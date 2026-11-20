import pg from "pg";

/**
 * Idempotency ledger for public guest checkout.
 *
 * A request key reserves the first attempt; a concurrent retry never creates a second cart. The
 * canonical completion response is stored so a retried request returns the first order.
 */
export interface GuestCheckoutRecord {
  request_key: string;
  request_hash: string;
  cart_id: string | null;
  response: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export class GuestCheckoutStore {
  private pool: pg.Pool;
  private ready: Promise<void>;

  constructor(connectionString: string) {
    this.pool = new pg.Pool({ connectionString, max: 5 });
    this.ready = this.ensureSchema();
  }

  private async ensureSchema(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS guest_checkout_request (
        request_key   text PRIMARY KEY,
        request_hash  text NOT NULL,
        cart_id       text,
        response      jsonb,
        created_at    timestamptz NOT NULL DEFAULT now(),
        updated_at    timestamptz NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS guest_checkout_cart_idx
        ON guest_checkout_request (cart_id)
        WHERE cart_id IS NOT NULL;
    `);
  }

  async begin(requestKey: string, requestHash: string): Promise<GuestCheckoutRecord> {
    await this.ready;
    await this.pool.query(
      `INSERT INTO guest_checkout_request (request_key, request_hash)
       VALUES ($1, $2)
       ON CONFLICT (request_key) DO NOTHING`,
      [requestKey, requestHash],
    );
    const result = await this.pool.query<GuestCheckoutRecord>(
      `SELECT request_key, request_hash, cart_id, response, created_at, updated_at
         FROM guest_checkout_request WHERE request_key = $1`,
      [requestKey],
    );
    const record = result.rows[0];
    if (!record) throw new Error("Guest checkout reservation was not persisted.");
    if (record.request_hash !== requestHash) {
      throw Object.assign(new Error("Idempotency key reused with a different checkout."), {
        code: "idempotency-key-reuse",
      });
    }
    return record;
  }

  /** Returns false when another in-flight request already attached its cart. */
  async attachCart(requestKey: string, cartId: string): Promise<boolean> {
    await this.ready;
    const result = await this.pool.query(
      `UPDATE guest_checkout_request
          SET cart_id = $2, updated_at = now()
        WHERE request_key = $1 AND cart_id IS NULL`,
      [requestKey, cartId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async complete(requestKey: string, response: Record<string, unknown>): Promise<void> {
    await this.ready;
    await this.pool.query(
      `UPDATE guest_checkout_request
          SET response = $2, updated_at = now()
        WHERE request_key = $1`,
      [requestKey, JSON.stringify(response)],
    );
  }

  /** A failed attempt may be retried; a completed attempt must never be deleted. */
  async fail(requestKey: string): Promise<void> {
    await this.ready;
    await this.pool.query(
      `DELETE FROM guest_checkout_request WHERE request_key = $1 AND response IS NULL`,
      [requestKey],
    );
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
