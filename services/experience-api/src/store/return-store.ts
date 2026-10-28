import { createHash, randomUUID } from "node:crypto";
import pg from "pg";

/**
 * Phase 1 return workflow store.
 *
 * This owns a staged after-sales case only. It intentionally has no Medusa client and no Tryton
 * client: a return request/decision cannot move money or stock.
 */

export type ReturnStatus =
  | "requested"
  | "under_review"
  | "approved"
  | "rejected"
  | "cancelled"
  | "pickup_scheduled"
  | "pickup_attempted"
  | "in_return_transit"
  | "received"
  | "inspection_pending"
  | "inspection_complete"
  | "closed";

export const RETURN_TRANSITIONS: Record<ReturnStatus, ReturnStatus[]> = {
  requested: ["under_review", "cancelled"],
  under_review: ["approved", "rejected", "cancelled"],
  approved: ["pickup_scheduled", "received", "cancelled"],
  rejected: [],
  cancelled: [],
  pickup_scheduled: [
    "pickup_attempted",
    "in_return_transit",
    "received",
    "closed",
    "cancelled",
  ],
  pickup_attempted: ["pickup_scheduled", "in_return_transit", "closed", "cancelled"],
  in_return_transit: ["received", "closed"],
  received: ["inspection_pending", "inspection_complete", "closed"],
  inspection_pending: ["inspection_complete"],
  inspection_complete: ["closed"],
  closed: [],
};

/**
 * Seller portals advance reverse logistics only. Admin keeps decision and
 * cancellation authority for the return case.
 */
export const SELLER_RETURN_TRANSITIONS = new Set<ReturnStatus>([
  "pickup_scheduled",
  "pickup_attempted",
  "in_return_transit",
  "received",
  "inspection_pending",
]);

export function allowedReturnTransitions(
  status: ReturnStatus,
  resolution?: ReturnResolution,
): ReturnStatus[] {
  return RETURN_TRANSITIONS[status].filter(
    (target) =>
      target !== "inspection_complete" &&
      !(resolution === "refund" && target === "closed"),
  );
}

export type ReturnResolution = "refund" | "replacement";

export type ReturnCondition = "sellable" | "damaged" | "incomplete" | "wrong_item";
export type ReturnDisposition = "restock" | "repair" | "quarantine" | "dispose";
export type RefundSimulationStatus =
  | "simulated_pending"
  | "simulated_completed"
  | "simulated_failed";

export interface RefundSimulationBreakdown {
  itemSubtotalMinor: number;
  taxMinor: number;
  shippingMinor: number;
  restockingFeeMinor: number;
  returnFreightMinor: number;
}

export interface ReturnRefundSimulation {
  id: string;
  returnCaseId: string;
  operationKey: string;
  amountMinor: number;
  currencyCode: string;
  method: "original_method_simulation" | "cod_bank_transfer_simulation";
  status: RefundSimulationStatus;
  simulationReference: string;
  breakdown: RefundSimulationBreakdown;
  failureReason: string | null;
  createdAt: string;
  recordedAt: string;
  testData: true;
  simulated: true;
  moneyEffect: "none";
  stockEffect: "none";
}

export interface ReturnLineInput {
  lineKey: string;
  sku: string;
  orderedQty: number;
  deliveredQty: number;
  requestedQty: number;
  reasonCode: string;
  unitPriceMinor?: number;
}

export interface ReturnEvidenceInput {
  lineKey?: string | null;
  objectKey: string;
  contentType: string;
  sizeBytes: number;
  sha256?: string | null;
}

export interface ReturnLine extends ReturnLineInput {
  id: string;
  approvedQty: number | null;
  unitPriceMinor: number;
  receivedQty: number | null;
  condition: ReturnCondition | null;
  disposition: ReturnDisposition | null;
  inspectionNote: string | null;
  inspectedAt: string | null;
  inspectedBy: string | null;
}

export interface ReturnEvidence extends ReturnEvidenceInput {
  id: string;
  scanStatus: "pending" | "clean" | "rejected";
  createdAt: string;
}

export interface ReturnEvent {
  id: string;
  eventType: string;
  actorId: string | null;
  actorRole: string | null;
  detail: Record<string, unknown>;
  occurredAt: string;
}

export interface ReturnCase {
  id: string;
  orderId: string;
  orderGroupId: string | null;
  userId: string;
  idempotencyKey: string;
  policyVersion: string;
  policySnapshot: Record<string, unknown>;
  status: ReturnStatus;
  version: number;
  allowedTransitions: ReturnStatus[];
  resolution: ReturnResolution;
  reasonCode: string;
  customerComment: string | null;
  requestedAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
  decisionComment: string | null;
  environment: "staging";
  testData: true;
  lines: ReturnLine[];
  evidence: ReturnEvidence[];
  events: ReturnEvent[];
  refundSimulation: ReturnRefundSimulation | null;
}

interface ReturnCaseRow {
  id: string;
  order_id: string;
  order_group_id: string | null;
  user_id: string;
  idempotency_key: string;
  request_hash: string;
  policy_version: string;
  policy_snapshot: Record<string, unknown>;
  status: ReturnStatus;
  version: number;
  resolution: ReturnResolution;
  reason_code: string;
  customer_comment: string | null;
  requested_at: Date | string;
  decided_at: Date | string | null;
  decided_by: string | null;
  decision_comment: string | null;
  environment: "staging";
  test_data: true;
}

interface ReturnLineRow {
  id: string;
  return_case_id: string;
  line_key: string;
  sku: string;
  ordered_qty: number;
  delivered_qty: number;
  requested_qty: number;
  approved_qty: number | null;
  reason_code: string;
  unit_price_minor: number;
  received_qty: number | null;
  condition: ReturnCondition | null;
  disposition: ReturnDisposition | null;
  inspection_note: string | null;
  inspected_at: Date | string | null;
  inspected_by: string | null;
}

interface ReturnRefundSimulationRow {
  id: string;
  return_case_id: string;
  operation_key: string;
  request_hash: string;
  amount_minor: number;
  currency_code: string;
  method: "original_method_simulation" | "cod_bank_transfer_simulation";
  status: RefundSimulationStatus;
  simulation_reference: string;
  breakdown: {
    item_subtotal_minor: number;
    tax_minor: number;
    shipping_minor: number;
    restocking_fee_minor: number;
    return_freight_minor: number;
  };
  failure_reason: string | null;
  created_at: Date | string;
  recorded_at: Date | string;
  test_data: true;
  simulated: true;
}

interface ReturnEvidenceRow {
  id: string;
  return_case_id: string;
  line_key: string | null;
  object_key: string;
  content_type: string;
  size_bytes: number;
  sha256: string | null;
  scan_status: "pending" | "clean" | "rejected";
  created_at: Date | string;
}

interface ReturnEventRow {
  id: string;
  return_case_id: string;
  event_type: string;
  actor_id: string | null;
  actor_role: string | null;
  detail: Record<string, unknown>;
  operation_key: string | null;
  occurred_at: Date | string;
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function isoOrNull(value: Date | string | null): string | null {
  return value === null ? null : iso(value);
}

export class ReturnStore {
  private readonly pool: pg.Pool;
  private readonly ready: Promise<void>;

  constructor(connectionString: string) {
    this.pool = new pg.Pool({ connectionString, max: 5 });
    this.ready = this.ensureSchema();
  }

  private async ensureSchema(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      // Serialize idempotent DDL across service instances and concurrent test processes.
      await client.query("SELECT pg_advisory_xact_lock(48203502)");
      await client.query(`
      CREATE TABLE IF NOT EXISTS pilot_return_case (
        id               text PRIMARY KEY,
        order_id         text NOT NULL,
        order_group_id   text,
        user_id          text NOT NULL,
        idempotency_key  text NOT NULL,
        request_hash     text NOT NULL,
        policy_version   text NOT NULL,
        policy_snapshot  jsonb NOT NULL,
        status           text NOT NULL,
        version          integer NOT NULL DEFAULT 1 CHECK (version > 0),
        resolution       text NOT NULL,
        reason_code      text NOT NULL,
        customer_comment text,
        requested_at     timestamptz NOT NULL DEFAULT now(),
        decided_at       timestamptz,
        decided_by       text,
        decision_comment text,
        environment      text NOT NULL CHECK (environment = 'staging'),
        test_data        boolean NOT NULL DEFAULT true CHECK (test_data = true)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS pilot_return_case_idempotency_uidx
        ON pilot_return_case (user_id, idempotency_key);
      CREATE INDEX IF NOT EXISTS pilot_return_case_user_idx
        ON pilot_return_case (user_id, requested_at DESC);
      CREATE INDEX IF NOT EXISTS pilot_return_case_status_idx
        ON pilot_return_case (status, requested_at);

      ALTER TABLE pilot_return_case
        ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

      CREATE TABLE IF NOT EXISTS pilot_return_line (
        id             text PRIMARY KEY,
        return_case_id text NOT NULL REFERENCES pilot_return_case(id) ON DELETE CASCADE,
        line_key       text NOT NULL,
        sku            text NOT NULL,
        ordered_qty    integer NOT NULL,
        delivered_qty  integer NOT NULL,
        requested_qty  integer NOT NULL CHECK (requested_qty > 0),
        approved_qty   integer,
        reason_code    text NOT NULL,
        UNIQUE (return_case_id, line_key)
      );
      ALTER TABLE pilot_return_line
        ADD COLUMN IF NOT EXISTS unit_price_minor integer NOT NULL DEFAULT 0;
      ALTER TABLE pilot_return_line
        ADD COLUMN IF NOT EXISTS received_qty integer;
      ALTER TABLE pilot_return_line
        ADD COLUMN IF NOT EXISTS condition text;
      ALTER TABLE pilot_return_line
        ADD COLUMN IF NOT EXISTS disposition text;
      ALTER TABLE pilot_return_line
        ADD COLUMN IF NOT EXISTS inspection_note text;
      ALTER TABLE pilot_return_line
        ADD COLUMN IF NOT EXISTS inspected_at timestamptz;
      ALTER TABLE pilot_return_line
        ADD COLUMN IF NOT EXISTS inspected_by text;

      CREATE TABLE IF NOT EXISTS pilot_return_refund_simulation (
        id                   text PRIMARY KEY,
        return_case_id       text NOT NULL UNIQUE REFERENCES pilot_return_case(id) ON DELETE CASCADE,
        operation_key        text NOT NULL,
        request_hash         text NOT NULL,
        amount_minor         integer NOT NULL CHECK (amount_minor > 0),
        currency_code        text NOT NULL DEFAULT 'INR' CHECK (currency_code = upper(currency_code)),
        method               text NOT NULL CHECK (method IN ('original_method_simulation','cod_bank_transfer_simulation')),
        status               text NOT NULL CHECK (status IN ('simulated_pending','simulated_completed','simulated_failed')),
        simulation_reference text NOT NULL CHECK (simulation_reference LIKE 'SIM-%'),
        breakdown            jsonb NOT NULL,
        failure_reason       text,
        created_at           timestamptz NOT NULL DEFAULT now(),
        recorded_at          timestamptz NOT NULL DEFAULT now(),
        test_data            boolean NOT NULL DEFAULT true CHECK (test_data = true),
        simulated            boolean NOT NULL DEFAULT true CHECK (simulated = true),
        UNIQUE (return_case_id, operation_key)
      );

      CREATE TABLE IF NOT EXISTS pilot_return_event (
        id             text PRIMARY KEY,
        return_case_id text NOT NULL REFERENCES pilot_return_case(id) ON DELETE CASCADE,
        event_type     text NOT NULL,
        actor_id       text,
        actor_role     text,
        detail         jsonb NOT NULL DEFAULT '{}'::jsonb,
        operation_key  text,
        occurred_at    timestamptz NOT NULL DEFAULT now()
      );
      ALTER TABLE pilot_return_event
        ADD COLUMN IF NOT EXISTS operation_key text;
      CREATE INDEX IF NOT EXISTS pilot_return_event_case_idx
        ON pilot_return_event (return_case_id, occurred_at);
      CREATE UNIQUE INDEX IF NOT EXISTS pilot_return_event_operation_uidx
        ON pilot_return_event (return_case_id, operation_key)
        WHERE operation_key IS NOT NULL;

      CREATE TABLE IF NOT EXISTS pilot_return_evidence (
        id             text PRIMARY KEY,
        return_case_id text NOT NULL REFERENCES pilot_return_case(id) ON DELETE CASCADE,
        line_key       text,
        object_key     text NOT NULL,
        content_type   text NOT NULL,
        size_bytes     integer NOT NULL,
        sha256         text,
        scan_status    text NOT NULL DEFAULT 'pending'
                       CHECK (scan_status IN ('pending','clean','rejected')),
        created_at     timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS pilot_return_evidence_case_idx
        ON pilot_return_evidence (return_case_id, created_at);
    `);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async request(input: {
    orderId: string;
    orderGroupId?: string | null;
    userId: string;
    idempotencyKey: string;
    policyVersion: string;
    policySnapshot: Record<string, unknown>;
    resolution: ReturnResolution;
    reasonCode: string;
    customerComment?: string | null;
    lines: ReturnLineInput[];
    evidence?: ReturnEvidenceInput[];
  }): Promise<{ returnCase: ReturnCase; replayed: boolean }> {
    await this.ready;
    const requestHash = createHash("sha256")
      .update(JSON.stringify({
        orderId: input.orderId,
        orderGroupId: input.orderGroupId ?? null,
        resolution: input.resolution,
        reasonCode: input.reasonCode,
        customerComment: input.customerComment ?? null,
        lines: input.lines,
        evidence: input.evidence ?? [],
      }))
      .digest("hex");
    const existing = await this.pool.query<ReturnCaseRow>(
      `SELECT * FROM pilot_return_case WHERE user_id = $1 AND idempotency_key = $2`,
      [input.userId, input.idempotencyKey],
    );
    if (existing.rows[0]) {
      if (existing.rows[0].request_hash !== requestHash) {
        throw Object.assign(new Error("Idempotency key reused with a different payload."), {
          code: "idempotency-key-reuse",
        });
      }
      const replay = await this.get(existing.rows[0].id);
      if (!replay) throw new Error("Existing return case disappeared.");
      return { returnCase: replay, replayed: true };
    }
    if (input.lines.length === 0) throw new Error("A return case requires at least one line.");

    const id = `ret_${randomUUID().replaceAll("-", "")}`;
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO pilot_return_case
           (id, order_id, order_group_id, user_id, idempotency_key, request_hash, policy_version,
            policy_snapshot, status, resolution, reason_code, customer_comment, environment, test_data)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'requested', $9, $10, $11, 'staging', true)`,
        [
          id,
          input.orderId,
          input.orderGroupId ?? null,
          input.userId,
          input.idempotencyKey,
          requestHash,
          input.policyVersion,
          JSON.stringify(input.policySnapshot),
          input.resolution,
          input.reasonCode,
          input.customerComment ?? null,
        ],
      );
      for (const line of input.lines) {
        await client.query(
          `INSERT INTO pilot_return_line
             (id, return_case_id, line_key, sku, ordered_qty, delivered_qty, requested_qty, approved_qty, reason_code, unit_price_minor)
           VALUES ($1, $2, $3, $4, $5, $6, $7, null, $8, $9)`,
          [
            `retl_${randomUUID().replaceAll("-", "")}`,
            id,
            line.lineKey,
            line.sku,
            line.orderedQty,
            line.deliveredQty,
            line.requestedQty,
            line.reasonCode,
            line.unitPriceMinor ?? 0,
          ],
        );
      }
      for (const evidence of input.evidence ?? []) {
        await client.query(
          `INSERT INTO pilot_return_evidence
             (id, return_case_id, line_key, object_key, content_type, size_bytes, sha256, scan_status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')`,
          [
            `retev_${randomUUID().replaceAll("-", "")}`,
            id,
            evidence.lineKey ?? null,
            evidence.objectKey,
            evidence.contentType,
            evidence.sizeBytes,
            evidence.sha256 ?? null,
          ],
        );
      }
      await client.query(
        `INSERT INTO pilot_return_event
           (id, return_case_id, event_type, actor_id, actor_role, detail)
         VALUES ($1, $2, 'return.requested', $3, 'customer', $4)`,
        [
          `rete_${randomUUID().replaceAll("-", "")}`,
          id,
          input.userId,
          JSON.stringify({
            resolution: input.resolution,
            reason_code: input.reasonCode,
            policy_version: input.policyVersion,
            line_count: input.lines.length,
          }),
        ],
      );
      await client.query("COMMIT");
      const created = await this.get(id);
      if (!created) throw new Error("Return case disappeared after creation.");
      return { returnCase: created, replayed: false };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      // A concurrent request with the same key may have won the unique index.
      const concurrent = await this.pool.query<ReturnCaseRow>(
        `SELECT * FROM pilot_return_case WHERE user_id = $1 AND idempotency_key = $2`,
        [input.userId, input.idempotencyKey],
      );
      if (concurrent.rows[0]) {
        if (concurrent.rows[0].request_hash !== requestHash) {
          throw Object.assign(new Error("Idempotency key reused with a different payload."), {
            code: "idempotency-key-reuse",
          });
        }
        const replay = await this.get(concurrent.rows[0].id);
        if (replay) return { returnCase: replay, replayed: true };
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async get(id: string): Promise<ReturnCase | null> {
    await this.ready;
    const result = await this.pool.query<ReturnCaseRow>(
      `SELECT * FROM pilot_return_case WHERE id = $1`,
      [id],
    );
    if (!result.rows[0]) return null;
    const row = result.rows[0];
    const [lines, evidence, events, refundSimulation] = await Promise.all([
      this.pool.query<ReturnLineRow>(
        `SELECT * FROM pilot_return_line WHERE return_case_id = $1 ORDER BY line_key`,
        [id],
      ),
      this.pool.query<ReturnEvidenceRow>(
        `SELECT * FROM pilot_return_evidence WHERE return_case_id = $1 ORDER BY created_at, id`,
        [id],
      ),
      this.pool.query<ReturnEventRow>(
        `SELECT * FROM pilot_return_event WHERE return_case_id = $1 ORDER BY occurred_at, id`,
        [id],
      ),
      this.pool.query<ReturnRefundSimulationRow>(
        `SELECT * FROM pilot_return_refund_simulation WHERE return_case_id = $1`,
        [id],
      ),
    ]);
    return {
      id: row.id,
      orderId: row.order_id,
      orderGroupId: row.order_group_id,
      userId: row.user_id,
      idempotencyKey: row.idempotency_key,
      policyVersion: row.policy_version,
      policySnapshot: row.policy_snapshot,
      status: row.status,
      version: Number(row.version),
      allowedTransitions: allowedReturnTransitions(row.status, row.resolution),
      resolution: row.resolution,
      reasonCode: row.reason_code,
      customerComment: row.customer_comment,
      requestedAt: iso(row.requested_at),
      decidedAt: isoOrNull(row.decided_at),
      decidedBy: row.decided_by,
      decisionComment: row.decision_comment,
      environment: row.environment,
      testData: true,
      lines: lines.rows.map((line) => ({
        id: line.id,
        lineKey: line.line_key,
        sku: line.sku,
        orderedQty: line.ordered_qty,
        deliveredQty: line.delivered_qty,
        requestedQty: line.requested_qty,
        approvedQty: line.approved_qty,
        reasonCode: line.reason_code,
        unitPriceMinor: line.unit_price_minor,
        receivedQty: line.received_qty,
        condition: line.condition,
        disposition: line.disposition,
        inspectionNote: line.inspection_note,
        inspectedAt: line.inspected_at ? iso(line.inspected_at) : null,
        inspectedBy: line.inspected_by,
      })),
      evidence: evidence.rows.map((item) => ({
        id: item.id,
        lineKey: item.line_key,
        objectKey: item.object_key,
        contentType: item.content_type,
        sizeBytes: item.size_bytes,
        sha256: item.sha256,
        scanStatus: item.scan_status,
        createdAt: iso(item.created_at),
      })),
      events: events.rows.map((event) => ({
        id: event.id,
        eventType: event.event_type,
        actorId: event.actor_id,
        actorRole: event.actor_role,
        detail: event.detail,
        occurredAt: iso(event.occurred_at),
      })),
      refundSimulation: refundSimulation.rows[0]
        ? {
            id: refundSimulation.rows[0].id,
            returnCaseId: refundSimulation.rows[0].return_case_id,
            operationKey: refundSimulation.rows[0].operation_key,
            amountMinor: refundSimulation.rows[0].amount_minor,
            currencyCode: refundSimulation.rows[0].currency_code,
            method: refundSimulation.rows[0].method,
            status: refundSimulation.rows[0].status,
            simulationReference: refundSimulation.rows[0].simulation_reference,
            breakdown: {
              itemSubtotalMinor: refundSimulation.rows[0].breakdown.item_subtotal_minor,
              taxMinor: refundSimulation.rows[0].breakdown.tax_minor,
              shippingMinor: refundSimulation.rows[0].breakdown.shipping_minor,
              restockingFeeMinor: refundSimulation.rows[0].breakdown.restocking_fee_minor,
              returnFreightMinor: refundSimulation.rows[0].breakdown.return_freight_minor,
            },
            failureReason: refundSimulation.rows[0].failure_reason,
            createdAt: iso(refundSimulation.rows[0].created_at),
            recordedAt: iso(refundSimulation.rows[0].recorded_at),
            testData: true,
            simulated: true,
            moneyEffect: "none",
            stockEffect: "none",
          }
        : null,
    };
  }

  async getForUser(id: string, userId: string): Promise<ReturnCase | null> {
    const record = await this.get(id);
    return record && record.userId === userId ? record : null;
  }

  async listForUser(userId: string, limit = 50): Promise<ReturnCase[]> {
    await this.ready;
    const result = await this.pool.query<ReturnCaseRow>(
      `SELECT * FROM pilot_return_case WHERE user_id = $1 ORDER BY requested_at DESC LIMIT $2`,
      [userId, Math.min(Math.max(limit, 1), 200)],
    );
    return this.loadMany(result.rows);
  }

  async requestedQuantitiesForOrder(
    userId: string,
    orderId: string,
  ): Promise<Record<string, number>> {
    await this.ready;
    const result = await this.pool.query<{ line_key: string; requested: number }>(
      `SELECT l.line_key, coalesce(sum(l.requested_qty), 0)::int AS requested
         FROM pilot_return_line l
         JOIN pilot_return_case c ON c.id = l.return_case_id
        WHERE c.user_id = $1 AND c.order_id = $2
          AND c.status NOT IN ('cancelled', 'rejected')
        GROUP BY l.line_key`,
      [userId, orderId],
    );
    const quantities: Record<string, number> = {};
    for (const row of result.rows) quantities[row.line_key] = Number(row.requested);
    return quantities;
  }

  async listAll(limit = 100): Promise<ReturnCase[]> {
    await this.ready;
    const result = await this.pool.query<ReturnCaseRow>(
      `SELECT * FROM pilot_return_case ORDER BY requested_at DESC LIMIT $1`,
      [Math.min(Math.max(limit, 1), 500)],
    );
    return this.loadMany(result.rows);
  }

  async decide(input: {
    id: string;
    decision: "approved" | "rejected";
    actorId: string;
    actorRole: string;
    expectedVersion?: number | null;
    comment?: string | null;
    approvedLines?: Array<{ lineKey: string; approvedQty: number }>;
  }): Promise<ReturnCase> {
    await this.ready;
    const current = await this.get(input.id);
    if (!current) throw Object.assign(new Error("Return case not found."), { code: "return-not-found" });
    if (!(["requested", "under_review"] as ReturnStatus[]).includes(current.status)) {
      throw Object.assign(new Error("Return case is not awaiting a decision."), {
        code: "return-not-decidable",
      });
    }
    if (
      input.expectedVersion !== undefined &&
      input.expectedVersion !== null &&
      current.version !== input.expectedVersion
    ) {
      throw Object.assign(
        new Error(
          `Return changed from version ${input.expectedVersion} to ${current.version}. Refresh before retrying.`,
        ),
        { code: "return-version-conflict", currentVersion: current.version },
      );
    }
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const updatedCase = await client.query(
        `UPDATE pilot_return_case
            SET status = $2, decided_at = now(), decided_by = $3,
                decision_comment = $4, version = version + 1
          WHERE id = $1
            AND status IN ('requested', 'under_review')
            AND ($5::integer IS NULL OR version = $5)
          RETURNING version`,
        [
          input.id,
          input.decision,
          input.actorId,
          input.comment ?? null,
          input.expectedVersion ?? null,
        ],
      );
      if (updatedCase.rowCount !== 1) {
        throw Object.assign(
          new Error("Return changed while the decision was being recorded. Refresh before retrying."),
          { code: "return-version-conflict" },
        );
      }
      if (input.decision === "approved" && input.approvedLines?.length) {
        for (const line of input.approvedLines) {
          await client.query(
            `UPDATE pilot_return_line
                SET approved_qty = LEAST(GREATEST($3, 0), requested_qty)
              WHERE return_case_id = $1 AND line_key = $2`,
            [input.id, line.lineKey, line.approvedQty],
          );
        }
      }
      await client.query(
        `INSERT INTO pilot_return_event
           (id, return_case_id, event_type, actor_id, actor_role, detail)
         VALUES ($1, $2, 'return.decision', $3, $4, $5)`,
        [
          `rete_${randomUUID().replaceAll("-", "")}`,
          input.id,
          input.actorId,
          input.actorRole,
          JSON.stringify({
            decision: input.decision,
            comment: input.comment ?? null,
            approved_lines: input.approvedLines ?? [],
            money_effect: "none",
            stock_effect: "none",
          }),
        ],
      );
      await client.query("COMMIT");
      const updated = await this.get(input.id);
      if (!updated) throw new Error("Return case disappeared after decision.");
      return updated;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async inspect(input: {
    id: string;
    expectedVersion: number;
    actorId: string;
    actorRole: string;
    lines: Array<{
      lineKey: string;
      receivedQty: number;
      condition: ReturnCondition;
      disposition: ReturnDisposition;
      note?: string | null;
    }>;
    note?: string | null;
    allowedLineKeys?: readonly string[];
  }): Promise<ReturnCase> {
    await this.ready;
    const current = await this.get(input.id);
    if (!current) {
      throw Object.assign(new Error("Return case not found."), { code: "return-not-found" });
    }
    if (!(["received", "inspection_pending"] as ReturnStatus[]).includes(current.status)) {
      throw Object.assign(
        new Error("Return must be received before inspection."),
        { code: "return-not-inspectable" },
      );
    }
    if (current.version !== input.expectedVersion) {
      throw Object.assign(
        new Error(
          `Return changed from version ${input.expectedVersion} to ${current.version}. Refresh before retrying.`,
        ),
        { code: "return-version-conflict", currentVersion: current.version },
      );
    }
    const inspectionNote = input.note?.trim();
    if (!inspectionNote) {
      throw Object.assign(
        new Error("An inspection note is required."),
        { code: "inspection-note-required" },
      );
    }
    const approved = new Map(
      current.lines
        .filter((line) => (line.approvedQty ?? 0) > 0)
        .map((line) => [line.lineKey, line.approvedQty as number]),
    );
    if (input.allowedLineKeys) {
      const allowed = new Set(input.allowedLineKeys);
      if ([...approved.keys()].some((lineKey) => !allowed.has(lineKey))) {
        throw Object.assign(
          new Error("This return contains approved lines outside the seller allocation."),
          { code: "inspection-scope-incomplete" },
        );
      }
    }
    if (approved.size === 0 || input.lines.length !== approved.size) {
      throw Object.assign(
        new Error("Inspection must include every approved return line exactly once."),
        { code: "inspection-lines-required" },
      );
    }
    const seen = new Set<string>();
    const conditions = new Set<ReturnCondition>(["sellable", "damaged", "incomplete", "wrong_item"]);
    const dispositions = new Set<ReturnDisposition>(["restock", "repair", "quarantine", "dispose"]);
    for (const line of input.lines) {
      if (seen.has(line.lineKey) || !approved.has(line.lineKey)) {
        throw Object.assign(
          new Error("Inspection lines must match the approved return lines."),
          { code: "inspection-lines-required" },
        );
      }
      seen.add(line.lineKey);
      if (
        !Number.isInteger(line.receivedQty) ||
        line.receivedQty < 0 ||
        line.receivedQty > (approved.get(line.lineKey) ?? 0)
      ) {
        throw Object.assign(
          new Error("Received quantity must be between 0 and the approved quantity."),
          { code: "invalid-inspection-quantity" },
        );
      }
      if (!conditions.has(line.condition) || !dispositions.has(line.disposition)) {
        throw Object.assign(
          new Error("Inspection condition or disposition is invalid."),
          { code: "invalid-inspection" },
        );
      }
    }
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      for (const line of input.lines) {
        await client.query(
          `UPDATE pilot_return_line
              SET received_qty = $3, condition = $4, disposition = $5,
                  inspection_note = $6, inspected_at = now(), inspected_by = $7
            WHERE return_case_id = $1 AND line_key = $2`,
          [
            input.id,
            line.lineKey,
            line.receivedQty,
            line.condition,
            line.disposition,
            line.note?.trim() || inspectionNote,
            input.actorId,
          ],
        );
      }
      const updatedCase = await client.query(
        `UPDATE pilot_return_case
            SET status = 'inspection_complete', version = version + 1
          WHERE id = $1 AND version = $2 AND status IN ('received', 'inspection_pending')
          RETURNING version`,
        [input.id, input.expectedVersion],
      );
      if (updatedCase.rowCount !== 1) {
        throw Object.assign(
          new Error("Return changed while inspection was being recorded. Refresh before retrying."),
          { code: "return-version-conflict" },
        );
      }
      await client.query(
        `INSERT INTO pilot_return_event
           (id, return_case_id, event_type, actor_id, actor_role, detail)
         VALUES ($1, $2, 'return.inspection_completed', $3, $4, $5)`,
        [
          `rete_${randomUUID().replaceAll("-", "")}`,
          input.id,
          input.actorId,
          input.actorRole,
          JSON.stringify({
            lines: input.lines,
            note: inspectionNote,
            test_data: true,
            simulated: true,
            money_effect: "none",
            stock_effect: "none",
          }),
        ],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
    const updated = await this.get(input.id);
    if (!updated) throw new Error("Return case disappeared after inspection.");
    return updated;
  }

  async recordRefundSimulation(input: {
    id: string;
    expectedVersion: number;
    operationKey: string;
    actorId: string;
    actorRole: string;
    method: "original_method_simulation" | "cod_bank_transfer_simulation";
    amountMinor: number;
    currencyCode: string;
    breakdown: RefundSimulationBreakdown;
  }): Promise<{
    returnCase: ReturnCase;
    refundSimulation: ReturnRefundSimulation;
    duplicate: boolean;
  }> {
    await this.ready;
    if (!new Set(["marketplace_operator", "super_admin"]).has(input.actorRole)) {
      throw Object.assign(
        new Error("Only an Admin operator can record a refund simulation."),
        { code: "refund-operator-required" },
      );
    }
    const operationKey = input.operationKey.trim();
    if (operationKey.length < 8 || operationKey.length > 200) {
      throw Object.assign(
        new Error("An operation key between 8 and 200 characters is required."),
        { code: "operation-key-required" },
      );
    }
    if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) {
      throw Object.assign(
        new Error("A positive simulated refund amount is required."),
        { code: "refund-amount-required" },
      );
    }
    const currencyCode = input.currencyCode.trim().toUpperCase();
    if (currencyCode !== "INR") {
      throw Object.assign(
        new Error("The bounded staging refund simulation supports INR only."),
        { code: "unsupported-refund-currency" },
      );
    }
    if (
      input.method !== "original_method_simulation" &&
      input.method !== "cod_bank_transfer_simulation"
    ) {
      throw Object.assign(
        new Error("The simulated refund method is invalid."),
        { code: "invalid-refund-method" },
      );
    }
    const breakdownEntries = Object.entries(input.breakdown);
    if (
      breakdownEntries.length !== 5 ||
      breakdownEntries.some(([, value]) => !Number.isInteger(value) || value < 0)
    ) {
      throw Object.assign(
        new Error("Every simulated refund breakdown value must be a non-negative integer."),
        { code: "invalid-refund-breakdown" },
      );
    }
    const calculatedAmount =
      input.breakdown.itemSubtotalMinor +
      input.breakdown.taxMinor +
      input.breakdown.shippingMinor -
      input.breakdown.restockingFeeMinor -
      input.breakdown.returnFreightMinor;
    if (calculatedAmount !== input.amountMinor) {
      throw Object.assign(
        new Error("The simulated refund amount must match its explicit breakdown."),
        { code: "refund-breakdown-mismatch" },
      );
    }
    const requestHash = createHash("sha256")
      .update(JSON.stringify({
        amountMinor: input.amountMinor,
        currencyCode,
        method: input.method,
        breakdown: input.breakdown,
      }))
      .digest("hex");
    const id = `refsim_${randomUUID().replaceAll("-", "")}`;
    const simulationReference = `SIM-REFUND-${randomUUID().slice(0, 8).toUpperCase()}`;
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const locked = await client.query<ReturnCaseRow>(
        `SELECT * FROM pilot_return_case WHERE id = $1 FOR UPDATE`,
        [input.id],
      );
      const current = locked.rows[0];
      if (!current) {
        throw Object.assign(new Error("Return case not found."), {
          code: "return-not-found",
        });
      }
      const existing = await client.query<ReturnRefundSimulationRow>(
        `SELECT * FROM pilot_return_refund_simulation WHERE return_case_id = $1`,
        [input.id],
      );
      if (existing.rows[0]) {
        if (existing.rows[0].operation_key === operationKey) {
          if (existing.rows[0].request_hash !== requestHash) {
            throw Object.assign(
              new Error("Operation key reused with a different refund simulation payload."),
              { code: "idempotency-key-reuse" },
            );
          }
        } else {
          throw Object.assign(
            new Error("A simulated refund projection already exists for this return."),
            { code: "refund-simulation-exists" },
          );
        }
        await client.query("COMMIT");
        const replay = await this.get(input.id);
        if (!replay?.refundSimulation) {
          throw new Error("Refund simulation disappeared during replay.");
        }
        return {
          returnCase: replay,
          refundSimulation: replay.refundSimulation,
          duplicate: true,
        };
      }
      if (current.status !== "inspection_complete") {
        throw Object.assign(
          new Error("Return must be inspected before a refund simulation can be recorded."),
          { code: "return-not-refundable" },
        );
      }
      if (Number(current.version) !== input.expectedVersion) {
        throw Object.assign(
          new Error(
            `Return changed from version ${input.expectedVersion} to ${current.version}. Refresh before retrying.`,
          ),
          { code: "return-version-conflict", currentVersion: Number(current.version) },
        );
      }
      const breakdown = {
        item_subtotal_minor: input.breakdown.itemSubtotalMinor,
        tax_minor: input.breakdown.taxMinor,
        shipping_minor: input.breakdown.shippingMinor,
        restocking_fee_minor: input.breakdown.restockingFeeMinor,
        return_freight_minor: input.breakdown.returnFreightMinor,
      };
      await client.query(
        `INSERT INTO pilot_return_refund_simulation
           (id, return_case_id, operation_key, request_hash, amount_minor, currency_code, method,
            status, simulation_reference, breakdown, recorded_at, test_data, simulated)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'simulated_completed', $8, $9, now(), true, true)`,
        [
          id,
          input.id,
          operationKey,
          requestHash,
          input.amountMinor,
          currencyCode,
          input.method,
          simulationReference,
          JSON.stringify(breakdown),
        ],
      );
      const updatedCase = await client.query(
        `UPDATE pilot_return_case
            SET status = 'closed', version = version + 1
          WHERE id = $1 AND version = $2 AND status = 'inspection_complete'
          RETURNING version`,
        [input.id, input.expectedVersion],
      );
      if (updatedCase.rowCount !== 1) {
        throw Object.assign(
          new Error("Return changed while the refund was being recorded. Refresh before retrying."),
          { code: "return-version-conflict" },
        );
      }
      await client.query(
        `INSERT INTO pilot_return_event
           (id, return_case_id, event_type, actor_id, actor_role, detail, operation_key)
         VALUES ($1, $2, 'return.refund_simulation_recorded', $3, $4, $5, $6)`,
        [
          `rete_${randomUUID().replaceAll("-", "")}`,
          input.id,
          input.actorId,
          input.actorRole,
          JSON.stringify({
            refund_simulation_id: id,
            status: "simulated_completed",
            amount_minor: input.amountMinor,
            currency_code: currencyCode,
            method: input.method,
            simulation_reference: simulationReference,
            breakdown,
            test_data: true,
            simulated: true,
            money_effect: "none",
            stock_effect: "none",
          }),
          operationKey,
        ],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
    const updated = await this.get(input.id);
    if (!updated?.refundSimulation) {
      throw new Error("Refund simulation disappeared after creation.");
    }
    return {
      returnCase: updated,
      refundSimulation: updated.refundSimulation,
      duplicate: false,
    };
  }

  async updateStatus(input: {
    id: string;
    status: ReturnStatus;
    expectedVersion: number;
    idempotencyKey: string;
    actorId: string;
    actorRole: string;
    note?: string | null;
  }): Promise<{ returnCase: ReturnCase; duplicate: boolean }> {
    await this.ready;
    const replay = await this.pool.query<ReturnEventRow>(
      `SELECT * FROM pilot_return_event
        WHERE return_case_id = $1 AND operation_key = $2`,
      [input.id, input.idempotencyKey],
    );
    if (replay.rows[0]) {
      const current = await this.get(input.id);
      if (!current) {
        throw Object.assign(new Error("Return case not found."), {
          code: "return-not-found",
        });
      }
      return { returnCase: current, duplicate: true };
    }
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const locked = await client.query<ReturnCaseRow>(
        `SELECT * FROM pilot_return_case WHERE id = $1 FOR UPDATE`,
        [input.id],
      );
      const current = locked.rows[0];
      if (!current) {
        throw Object.assign(new Error("Return case not found."), {
          code: "return-not-found",
        });
      }
      if (Number(current.version) !== input.expectedVersion) {
        throw Object.assign(
          new Error(
            `Return changed from version ${input.expectedVersion} to ${current.version}. Refresh before retrying.`,
          ),
          { code: "return-version-conflict", currentVersion: Number(current.version) },
        );
      }
      if (
        ["approved", "rejected", "requested"].includes(input.status) ||
        input.status === "inspection_complete" ||
        (input.status === "closed" && current.resolution === "refund") ||
        !RETURN_TRANSITIONS[current.status].includes(input.status)
      ) {
        throw Object.assign(
          new Error(
            `Cannot move a return from ${current.status} to ${input.status}.`,
          ),
          { code: "invalid-return-transition" },
        );
      }
      await client.query(
        `UPDATE pilot_return_case
            SET status = $2, version = version + 1
          WHERE id = $1`,
        [input.id, input.status],
      );
      await client.query(
        `INSERT INTO pilot_return_event
           (id, return_case_id, event_type, actor_id, actor_role, detail,
            operation_key)
         VALUES ($1, $2, 'return.status_changed', $3, $4, $5, $6)`,
        [
          `rete_${randomUUID().replaceAll("-", "")}`,
          input.id,
          input.actorId,
          input.actorRole,
          JSON.stringify({
            previous_status: current.status,
            status: input.status,
            note: input.note ?? null,
            expected_version: input.expectedVersion,
            resulting_version: input.expectedVersion + 1,
            money_effect: "none",
            stock_effect: "none",
          }),
          input.idempotencyKey,
        ],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
    const updated = await this.get(input.id);
    if (!updated) throw new Error("Return case disappeared after status update.");
    return { returnCase: updated, duplicate: false };
  }

  async cancel(id: string, userId: string): Promise<ReturnCase> {
    await this.ready;
    const current = await this.getForUser(id, userId);
    if (!current) throw Object.assign(new Error("Return case not found."), { code: "return-not-found" });
    if (current.status !== "requested") {
      throw Object.assign(new Error("Only a requested case can be cancelled."), {
        code: "return-not-cancellable",
      });
    }
    await this.pool.query(
      `UPDATE pilot_return_case
          SET status = 'cancelled', decided_at = now(), decided_by = $2,
              version = version + 1
        WHERE id = $1 AND status = 'requested'`,
      [id, userId],
    );
    await this.pool.query(
      `INSERT INTO pilot_return_event
         (id, return_case_id, event_type, actor_id, actor_role, detail)
       VALUES ($1, $2, 'return.cancelled', $3, 'customer', '{}'::jsonb)`,
      [`rete_${randomUUID().replaceAll("-", "")}`, id, userId],
    );
    const updated = await this.get(id);
    if (!updated) throw new Error("Return case disappeared after cancellation.");
    return updated;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  private async loadMany(rows: ReturnCaseRow[]): Promise<ReturnCase[]> {
    const result: ReturnCase[] = [];
    for (const row of rows) {
      const record = await this.get(row.id);
      if (record) result.push(record);
    }
    return result;
  }
}
