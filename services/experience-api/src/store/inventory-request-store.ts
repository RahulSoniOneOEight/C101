import { randomUUID } from "node:crypto";
import pg from "pg";

export interface InventoryAdjustmentRequest {
  id: string;
  sku: string;
  offer_id: string | null;
  product_id: string | null;
  seller_id: string | null;
  quantity_delta: number;
  reason: string;
  status: "requested" | "approved" | "rejected";
  requested_by: string;
  requested_at: string;
  acting_for_seller_id: string | null;
  reference: string | null;
  correlation_id: string | null;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
}

export interface InventoryPosting {
  id: string;
  request_id: string;
  operation_key: string;
  status:
    | "posting_pending"
    | "posted"
    | "posting_failed"
    | "reconciliation_required"
    | "reconciled";
  actor_user_id: string;
  tryton_move_id: number | null;
  movement_ref: string | null;
  attempts: number;
  last_error: string | null;
  reconciliation_status: string | null;
  created_at: string;
  updated_at: string;
}

export class InventoryRequestStore {
  private pool: pg.Pool;
  private ready: Promise<void>;

  constructor(connectionString: string) {
    this.pool = new pg.Pool({ connectionString, max: 5 });
    this.ready = this.ensureSchema();
  }

  private async ensureSchema(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS inventory_adjustment_request (
        id             text PRIMARY KEY,
        sku            text NOT NULL,
        offer_id       text,
        product_id     text,
        seller_id      text,
        quantity_delta integer NOT NULL,
        reason         text NOT NULL,
        status         text NOT NULL DEFAULT 'requested',
        requested_by   text NOT NULL,
        requested_at   timestamptz NOT NULL DEFAULT now(),
        decided_by     text,
        decided_at     timestamptz,
        decision_note  text,
        acting_for_seller_id text,
        reference      text,
        correlation_id text
      );
      ALTER TABLE inventory_adjustment_request
        ADD COLUMN IF NOT EXISTS acting_for_seller_id text,
        ADD COLUMN IF NOT EXISTS reference text,
        ADD COLUMN IF NOT EXISTS correlation_id text;
      CREATE INDEX IF NOT EXISTS idx_inventory_request_status
        ON inventory_adjustment_request (status, requested_at DESC);
      CREATE INDEX IF NOT EXISTS idx_inventory_request_seller
        ON inventory_adjustment_request (seller_id, requested_at DESC);
      CREATE TABLE IF NOT EXISTS inventory_adjustment_posting (
        id                    text PRIMARY KEY,
        request_id            text NOT NULL UNIQUE,
        operation_key         text NOT NULL UNIQUE,
        status                text NOT NULL DEFAULT 'posting_pending',
        actor_user_id         text NOT NULL,
        tryton_move_id        integer,
        movement_ref          text,
        attempts              integer NOT NULL DEFAULT 0,
        last_error            text,
        reconciliation_status text,
        created_at            timestamptz NOT NULL DEFAULT now(),
        updated_at            timestamptz NOT NULL DEFAULT now()
      );
    `);
  }

  async create(
    input: Omit<
      InventoryAdjustmentRequest,
      "id" | "status" | "requested_at" | "decided_by" | "decided_at" | "decision_note"
    >,
  ): Promise<InventoryAdjustmentRequest> {
    await this.ready;
    const id = `invreq_${randomUUID().replaceAll("-", "")}`;
    const result = await this.pool.query(
      `INSERT INTO inventory_adjustment_request
         (id, sku, offer_id, product_id, seller_id, quantity_delta, reason, requested_by,
          acting_for_seller_id, reference, correlation_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [
        id,
        input.sku,
        input.offer_id,
        input.product_id,
        input.seller_id,
        input.quantity_delta,
        input.reason,
        input.requested_by,
        input.acting_for_seller_id,
        input.reference,
        input.correlation_id,
      ],
    );
    return result.rows[0] as InventoryAdjustmentRequest;
  }

  async list(filters: {
    status?: string;
    sellerId?: string | null;
    limit?: number;
  }): Promise<InventoryAdjustmentRequest[]> {
    await this.ready;
    const clauses: string[] = [];
    const values: unknown[] = [];
    if (filters.status) {
      values.push(filters.status);
      clauses.push(`status = $${values.length}`);
    }
    if (filters.sellerId) {
      values.push(filters.sellerId);
      clauses.push(`seller_id = $${values.length}`);
    }
    values.push(Math.min(500, Math.max(1, filters.limit ?? 100)));
    const result = await this.pool.query(
      `SELECT * FROM inventory_adjustment_request
       ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
       ORDER BY requested_at DESC
       LIMIT $${values.length}`,
      values,
    );
    return result.rows as InventoryAdjustmentRequest[];
  }

  async decide(
    id: string,
    status: "approved" | "rejected",
    decidedBy: string,
    note: string | null,
  ): Promise<InventoryAdjustmentRequest | null> {
    await this.ready;
    const result = await this.pool.query(
      `UPDATE inventory_adjustment_request
       SET status = $2, decided_by = $3, decided_at = now(), decision_note = $4
       WHERE id = $1 AND status = 'requested'
       RETURNING *`,
      [id, status, decidedBy, note],
    );
    return (result.rows[0] as InventoryAdjustmentRequest | undefined) ?? null;
  }

  async get(id: string): Promise<InventoryAdjustmentRequest | null> {
    await this.ready;
    const result = await this.pool.query(
      "SELECT * FROM inventory_adjustment_request WHERE id = $1",
      [id],
    );
    return (result.rows[0] as InventoryAdjustmentRequest | undefined) ?? null;
  }

  async getPosting(requestId: string): Promise<InventoryPosting | null> {
    await this.ready;
    const result = await this.pool.query(
      "SELECT * FROM inventory_adjustment_posting WHERE request_id = $1",
      [requestId],
    );
    return (result.rows[0] as InventoryPosting | undefined) ?? null;
  }

  async beginPosting(
    requestId: string,
    operationKey: string,
    actorUserId: string,
  ): Promise<InventoryPosting> {
    await this.ready;
    const existing = await this.getPosting(requestId);
    if (existing) return existing;
    const result = await this.pool.query(
      `INSERT INTO inventory_adjustment_posting
         (id, request_id, operation_key, actor_user_id)
       VALUES ($1,$2,$3,$4)
       RETURNING *`,
      [
        `invpost_${randomUUID().replaceAll("-", "")}`,
        requestId,
        operationKey,
        actorUserId,
      ],
    );
    return result.rows[0] as InventoryPosting;
  }

  async finishPosting(
    requestId: string,
    input: {
      status: InventoryPosting["status"];
      trytonMoveId?: number | null;
      movementRef?: string | null;
      error?: string | null;
      reconciliationStatus?: string | null;
    },
  ): Promise<InventoryPosting> {
    await this.ready;
    const result = await this.pool.query(
      `UPDATE inventory_adjustment_posting
       SET status = $2,
           tryton_move_id = COALESCE($3, tryton_move_id),
           movement_ref = COALESCE($4, movement_ref),
           last_error = $5,
           reconciliation_status = COALESCE($6, reconciliation_status),
           attempts = attempts + 1,
           updated_at = now()
       WHERE request_id = $1
       RETURNING *`,
      [
        requestId,
        input.status,
        input.trytonMoveId ?? null,
        input.movementRef ?? null,
        input.error ?? null,
        input.reconciliationStatus ?? null,
      ],
    );
    return result.rows[0] as InventoryPosting;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
