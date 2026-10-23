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
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
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
        decision_note  text
      );
      CREATE INDEX IF NOT EXISTS idx_inventory_request_status
        ON inventory_adjustment_request (status, requested_at DESC);
      CREATE INDEX IF NOT EXISTS idx_inventory_request_seller
        ON inventory_adjustment_request (seller_id, requested_at DESC);
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
         (id, sku, offer_id, product_id, seller_id, quantity_delta, reason, requested_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
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

  async close(): Promise<void> {
    await this.pool.end();
  }
}
