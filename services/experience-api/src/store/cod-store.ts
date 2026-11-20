import { randomUUID } from "node:crypto";
import pg from "pg";

/**
 * COD policy, idempotency, cash collection, audit and seller dues.
 *
 * Bazarbee never holds COD goods money: the seller collects at delivery and owes commission,
 * GST on commission, TCS and any COD fee. This store keeps that receivable and its audit trail.
 */

export type CodCollectionStatus = "pending" | "collected" | "short" | "refused";

export interface CodPolicy {
  seller_id: string;
  enabled: boolean;
  pincodes: string[];
  blocked_category_ids: string[];
  max_order_minor: number | null;
  buyer_daily_cap_minor: number | null;
  seller_daily_cap_minor: number | null;
  cod_fee_minor: number;
  commission_bps: number;
  updated_at: string;
}

export interface CodCollection {
  id: string;
  order_group_id: string;
  checkout_ref: string | null;
  buyer_scope: string | null;
  status: CodCollectionStatus;
  expected_minor: number;
  collected_minor: number;
  currency: string;
  collector_kind: string | null;
  collector_user_id: string | null;
  collected_at: string | null;
  proof_ref: string | null;
  reason: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface DuesEntry {
  id: string;
  seller_id: string;
  period: string;
  kind: string;
  amount_minor: number;
  currency: string;
  source_ref: string | null;
  status: string;
  note: string | null;
  created_at: string;
}

const POLICY_DEFAULTS = {
  enabled: false,
  pincodes: [] as string[],
  blockedCategoryIds: [] as string[],
  maxOrderMinor: null as number | null,
  buyerDailyCapMinor: null as number | null,
  sellerDailyCapMinor: null as number | null,
  codFeeMinor: 0,
  commissionBps: 1000,
};

export class CodStore {
  private pool: pg.Pool;
  private ready: Promise<void>;

  constructor(connectionString: string) {
    this.pool = new pg.Pool({ connectionString, max: 5 });
    this.ready = this.ensureSchema();
  }

  private async ensureSchema(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS cod_seller_policy (
        seller_id            text PRIMARY KEY,
        enabled              boolean NOT NULL DEFAULT false,
        pincodes             text[] NOT NULL DEFAULT '{}',
        blocked_category_ids text[] NOT NULL DEFAULT '{}',
        max_order_minor      bigint,
        buyer_daily_cap_minor bigint,
        seller_daily_cap_minor bigint,
        cod_fee_minor        bigint NOT NULL DEFAULT 0,
        commission_bps       integer NOT NULL DEFAULT 1000,
        updated_at           timestamptz NOT NULL DEFAULT now(),
        updated_by           text
      );

      CREATE TABLE IF NOT EXISTS cod_checkout_request (
        request_key   text PRIMARY KEY,
        request_hash  text NOT NULL,
        owner_scope   text NOT NULL,
        cart_id       text,
        response      jsonb,
        created_at    timestamptz NOT NULL DEFAULT now(),
        updated_at    timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS cod_collection (
        id                 text PRIMARY KEY,
        order_group_id     text NOT NULL UNIQUE,
        checkout_ref       text,
        buyer_scope        text,
        status             text NOT NULL CHECK (status IN ('pending','collected','short','refused')),
        expected_minor     bigint NOT NULL,
        collected_minor    bigint NOT NULL DEFAULT 0,
        currency           text NOT NULL DEFAULT 'INR',
        collector_kind     text CHECK (collector_kind IN ('seller','admin','delivery_agent')),
        collector_user_id  text,
        collected_at       timestamptz,
        proof_ref          text,
        reason             text,
        version            integer NOT NULL DEFAULT 1,
        created_at         timestamptz NOT NULL DEFAULT now(),
        updated_at         timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS cod_collection_event (
        id            text PRIMARY KEY,
        collection_id text NOT NULL REFERENCES cod_collection(id) ON DELETE CASCADE,
        event_type    text NOT NULL,
        actor_user_id text NOT NULL,
        actor_roles   jsonb NOT NULL,
        payload       jsonb NOT NULL,
        created_at    timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS seller_dues_ledger (
        id           text PRIMARY KEY,
        seller_id    text NOT NULL,
        period       text NOT NULL,
        kind         text NOT NULL CHECK (kind IN
                       ('commission','gst_on_commission','tcs','cod_fee','adjustment','payment','waiver')),
        amount_minor bigint NOT NULL,
        currency     text NOT NULL DEFAULT 'INR',
        source_ref   text,
        status       text NOT NULL DEFAULT 'open' CHECK (status IN ('open','settled','waived')),
        note         text,
        created_at   timestamptz NOT NULL DEFAULT now(),
        UNIQUE (seller_id, period, kind, source_ref)
      );

      CREATE INDEX IF NOT EXISTS cod_collection_buyer_idx ON cod_collection (buyer_scope, created_at DESC);
      CREATE INDEX IF NOT EXISTS seller_dues_open_idx ON seller_dues_ledger (seller_id, status);
    `);
  }

  private normalizeCollection(row: Record<string, unknown>): CodCollection {
    return {
      ...(row as unknown as CodCollection),
      expected_minor: Number(row.expected_minor ?? 0),
      collected_minor: Number(row.collected_minor ?? 0),
      version: Number(row.version ?? 1),
    };
  }

  private normalizePolicy(row: Record<string, unknown>): CodPolicy {
    return {
      ...(row as unknown as CodPolicy),
      max_order_minor:
        row.max_order_minor === null || row.max_order_minor === undefined
          ? null
          : Number(row.max_order_minor),
      buyer_daily_cap_minor:
        row.buyer_daily_cap_minor === null || row.buyer_daily_cap_minor === undefined
          ? null
          : Number(row.buyer_daily_cap_minor),
      seller_daily_cap_minor:
        row.seller_daily_cap_minor === null || row.seller_daily_cap_minor === undefined
          ? null
          : Number(row.seller_daily_cap_minor),
      cod_fee_minor: Number(row.cod_fee_minor ?? 0),
      commission_bps: Number(row.commission_bps ?? 1000),
    };
  }

  async getPolicy(sellerId: string): Promise<CodPolicy | null> {
    await this.ready;
    const result = await this.pool.query("SELECT * FROM cod_seller_policy WHERE seller_id = $1", [
      sellerId,
    ]);
    const row = result.rows[0] as Record<string, unknown> | undefined;
    return row ? this.normalizePolicy(row) : null;
  }

  async listPolicies(): Promise<CodPolicy[]> {
    await this.ready;
    const result = await this.pool.query("SELECT * FROM cod_seller_policy ORDER BY seller_id");
    return (result.rows as Array<Record<string, unknown>>).map((row) =>
      this.normalizePolicy(row),
    );
  }

  async upsertPolicy(input: {
    sellerId: string;
    enabled: boolean;
    pincodes?: string[];
    blockedCategoryIds?: string[];
    maxOrderMinor?: number | null;
    buyerDailyCapMinor?: number | null;
    sellerDailyCapMinor?: number | null;
    codFeeMinor?: number;
    commissionBps?: number;
    updatedBy: string;
  }): Promise<CodPolicy> {
    await this.ready;
    const result = await this.pool.query(
      `INSERT INTO cod_seller_policy
         (seller_id, enabled, pincodes, blocked_category_ids, max_order_minor,
          buyer_daily_cap_minor, seller_daily_cap_minor, cod_fee_minor, commission_bps,
          updated_at, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now(),$10)
       ON CONFLICT (seller_id) DO UPDATE SET
         enabled = EXCLUDED.enabled,
         pincodes = EXCLUDED.pincodes,
         blocked_category_ids = EXCLUDED.blocked_category_ids,
         max_order_minor = EXCLUDED.max_order_minor,
         buyer_daily_cap_minor = EXCLUDED.buyer_daily_cap_minor,
         seller_daily_cap_minor = EXCLUDED.seller_daily_cap_minor,
         cod_fee_minor = EXCLUDED.cod_fee_minor,
         commission_bps = EXCLUDED.commission_bps,
         updated_at = now(),
         updated_by = EXCLUDED.updated_by
       RETURNING *`,
      [
        input.sellerId,
        input.enabled,
        input.pincodes ?? POLICY_DEFAULTS.pincodes,
        input.blockedCategoryIds ?? POLICY_DEFAULTS.blockedCategoryIds,
        input.maxOrderMinor ?? POLICY_DEFAULTS.maxOrderMinor,
        input.buyerDailyCapMinor ?? POLICY_DEFAULTS.buyerDailyCapMinor,
        input.sellerDailyCapMinor ?? POLICY_DEFAULTS.sellerDailyCapMinor,
        input.codFeeMinor ?? POLICY_DEFAULTS.codFeeMinor,
        input.commissionBps ?? POLICY_DEFAULTS.commissionBps,
        input.updatedBy,
      ],
    );
    return this.normalizePolicy(result.rows[0] as Record<string, unknown>);
  }

  /** Return a replayable response, or claim a new request key. */
  async beginRequest(
    scope: string,
    key: string,
    hash: string,
  ): Promise<
    | { state: "new" }
    | { state: "replay"; response: Record<string, unknown> }
    | { state: "conflict" }
    | { state: "in-flight" }
  > {
    await this.ready;
    const inserted = await this.pool.query(
      `INSERT INTO cod_checkout_request (request_key, request_hash, owner_scope)
       VALUES ($1,$2,$3)
       ON CONFLICT (request_key) DO NOTHING
       RETURNING request_key`,
      [`${scope}:${key}`, hash, scope],
    );
    if (inserted.rowCount) return { state: "new" };
    const existing = await this.pool.query(
      "SELECT request_hash, response FROM cod_checkout_request WHERE request_key = $1",
      [`${scope}:${key}`],
    );
    const row = existing.rows[0] as { request_hash: string; response: unknown } | undefined;
    if (!row) return { state: "new" };
    if (row.request_hash !== hash) return { state: "conflict" };
    if (row.response && typeof row.response === "object") {
      return { state: "replay", response: row.response as Record<string, unknown> };
    }
    return { state: "in-flight" };
  }

  async completeRequest(
    scope: string,
    key: string,
    cartId: string,
    response: Record<string, unknown>,
  ): Promise<void> {
    await this.ready;
    await this.pool.query(
      `UPDATE cod_checkout_request
          SET cart_id = $3, response = $4, updated_at = now()
        WHERE request_key = $1 AND owner_scope = $2`,
      [`${scope}:${key}`, scope, cartId, response],
    );
  }

  async clearRequest(scope: string, key: string): Promise<void> {
    await this.ready;
    await this.pool.query("DELETE FROM cod_checkout_request WHERE request_key = $1", [
      `${scope}:${key}`,
    ]);
  }

  async buyerDailyTotal(buyerScope: string): Promise<number> {
    await this.ready;
    const result = await this.pool.query(
      `SELECT COALESCE(SUM(expected_minor),0)::bigint AS total
         FROM cod_collection
        WHERE buyer_scope = $1 AND created_at >= date_trunc('day', now())`,
      [buyerScope],
    );
    return Number(result.rows[0]?.total ?? 0);
  }

  async sellerDailyTotal(sellerId: string): Promise<number> {
    await this.ready;
    const result = await this.pool.query(
      `SELECT COALESCE(SUM((c.payment_evidence->>'expected_minor')::bigint),0)::bigint AS total
         FROM correlation c
        WHERE c.payment_evidence->>'payment_mode' = 'cod'
          AND c.created_at >= date_trunc('day', now())
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements(c.medusa_order_group->'lines') line
             WHERE line->>'seller_id' = $1
          )`,
      [sellerId],
    );
    return Number(result.rows[0]?.total ?? 0);
  }

  async ensureCollection(input: {
    orderGroupId: string;
    checkoutRef?: string | null;
    buyerScope?: string | null;
    expectedMinor: number;
  }): Promise<CodCollection> {
    await this.ready;
    await this.pool.query(
      `INSERT INTO cod_collection
         (id, order_group_id, checkout_ref, buyer_scope, status, expected_minor)
       VALUES ($1,$2,$3,$4,'pending',$5)
       ON CONFLICT (order_group_id) DO NOTHING`,
      [`codc_${randomUUID()}`, input.orderGroupId, input.checkoutRef ?? null, input.buyerScope ?? null, input.expectedMinor],
    );
    return (await this.getCollectionByOrderGroup(input.orderGroupId))!;
  }

  async getCollectionByOrderGroup(orderGroupId: string): Promise<CodCollection | null> {
    await this.ready;
    const result = await this.pool.query("SELECT * FROM cod_collection WHERE order_group_id = $1", [
      orderGroupId,
    ]);
    const row = result.rows[0] as Record<string, unknown> | undefined;
    return row ? this.normalizeCollection(row) : null;
  }

  async recordCollection(input: {
    orderGroupId: string;
    status: Exclude<CodCollectionStatus, "pending">;
    collectedMinor: number;
    collectorKind: "seller" | "admin" | "delivery_agent";
    collectorUserId: string;
    proofRef?: string | null;
    reason?: string | null;
    actorRoles: string[];
    eventType: string;
    expectedVersion?: number;
  }): Promise<CodCollection> {
    await this.ready;
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query(
        "SELECT * FROM cod_collection WHERE order_group_id = $1 FOR UPDATE",
        [input.orderGroupId],
      );
      const row = current.rows[0] as CodCollection | undefined;
      if (!row) throw Object.assign(new Error("COD collection not found."), { code: "not-found" });
      if (
        typeof input.expectedVersion === "number" &&
        input.expectedVersion !== row.version
      ) {
        throw Object.assign(new Error("The collection changed; reload before saving."), {
          code: "version-conflict",
        });
      }
      if (row.status === "refused") {
        throw Object.assign(new Error("A refused COD collection is final."), {
          code: "invalid-transition",
        });
      }
      const collected =
        input.status === "refused" ? 0 : Math.max(0, Math.round(input.collectedMinor));
      const expected = Number(row.expected_minor);
      if (input.status === "collected" && collected !== expected) {
        throw Object.assign(
          new Error("A collected COD entry must equal the expected amount."),
          { code: "amount-mismatch" },
        );
      }
      if (input.status === "short" && (collected <= 0 || collected >= expected)) {
        throw Object.assign(
          new Error("A short COD entry must record a positive amount below the expected total."),
          { code: "amount-mismatch" },
        );
      }
      const updated = await client.query(
        `UPDATE cod_collection
            SET status = $2,
                collected_minor = $3,
                collector_kind = $4,
                collector_user_id = $5,
                collected_at = CASE WHEN $2 = 'refused' THEN NULL ELSE now() END,
                proof_ref = $6,
                reason = $7,
                version = version + 1,
                updated_at = now()
          WHERE order_group_id = $1
          RETURNING *`,
        [
          input.orderGroupId,
          input.status,
          collected,
          input.collectorKind,
          input.collectorUserId,
          input.proofRef ?? null,
          input.reason ?? null,
        ],
      );
      await client.query(
        `INSERT INTO cod_collection_event
           (id, collection_id, event_type, actor_user_id, actor_roles, payload)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          `codev_${randomUUID()}`,
          row.id,
          input.eventType,
          input.collectorUserId,
          JSON.stringify(input.actorRoles),
          JSON.stringify({
            status: input.status,
            expected_minor: row.expected_minor,
            collected_minor: collected,
            proof_ref: input.proofRef ?? null,
            reason: input.reason ?? null,
            previous_status: row.status,
          }),
        ],
      );
      await client.query("COMMIT");
      return this.normalizeCollection(updated.rows[0] as Record<string, unknown>);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async listEvents(orderGroupId: string): Promise<Array<Record<string, unknown>>> {
    await this.ready;
    const result = await this.pool.query(
      `SELECT e.* FROM cod_collection_event e
         JOIN cod_collection c ON c.id = e.collection_id
        WHERE c.order_group_id = $1
        ORDER BY e.created_at`,
      [orderGroupId],
    );
    return result.rows as Array<Record<string, unknown>>;
  }

  async addDues(
    entries: Array<{
      sellerId: string;
      period: string;
      kind: string;
      amountMinor: number;
      sourceRef: string;
      note?: string | null;
    }>,
  ): Promise<void> {
    await this.ready;
    for (const entry of entries) {
      await this.pool.query(
        `INSERT INTO seller_dues_ledger
           (id, seller_id, period, kind, amount_minor, source_ref, note)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (seller_id, period, kind, source_ref) DO NOTHING`,
        [
          `due_${randomUUID()}`,
          entry.sellerId,
          entry.period,
          entry.kind,
          entry.amountMinor,
          entry.sourceRef,
          entry.note ?? null,
        ],
      );
    }
  }

  async listDues(input: { sellerId?: string; period?: string; limit?: number }): Promise<DuesEntry[]> {
    await this.ready;
    const clauses: string[] = [];
    const values: unknown[] = [];
    if (input.sellerId) {
      values.push(input.sellerId);
      clauses.push(`seller_id = $${values.length}`);
    }
    if (input.period) {
      values.push(input.period);
      clauses.push(`period = $${values.length}`);
    }
    values.push(input.limit ?? 500);
    const result = await this.pool.query(
      `SELECT * FROM seller_dues_ledger
        ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
        ORDER BY period DESC, created_at DESC
        LIMIT $${values.length}`,
      values,
    );
    return (result.rows as Array<Record<string, unknown>>).map((row) => ({
      ...(row as unknown as DuesEntry),
      amount_minor: Number(row.amount_minor ?? 0),
    }));
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

export function currentPeriod(date = new Date()): string {
  return date.toISOString().slice(0, 7);
}
