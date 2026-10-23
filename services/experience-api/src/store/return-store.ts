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
    "cancelled",
  ],
  pickup_attempted: ["pickup_scheduled", "in_return_transit", "cancelled"],
  in_return_transit: ["received"],
  received: ["inspection_pending", "inspection_complete"],
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
  "inspection_complete",
  "closed",
]);

export function allowedReturnTransitions(status: ReturnStatus): ReturnStatus[] {
  return [...RETURN_TRANSITIONS[status]];
}

export type ReturnResolution = "refund" | "replacement";

export interface ReturnLineInput {
  lineKey: string;
  sku: string;
  orderedQty: number;
  deliveredQty: number;
  requestedQty: number;
  reasonCode: string;
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
             (id, return_case_id, line_key, sku, ordered_qty, delivered_qty, requested_qty, approved_qty, reason_code)
           VALUES ($1, $2, $3, $4, $5, $6, $7, null, $8)`,
          [
            `retl_${randomUUID().replaceAll("-", "")}`,
            id,
            line.lineKey,
            line.sku,
            line.orderedQty,
            line.deliveredQty,
            line.requestedQty,
            line.reasonCode,
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
    const [lines, evidence, events] = await Promise.all([
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
      allowedTransitions: allowedReturnTransitions(row.status),
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
