import pg from "pg";

export type PreviewCheckoutStatus =
  | "intent"
  | "creating"
  | "draft"
  | "committing"
  | "committed"
  | "completing"
  | "confirmed"
  | "needs_review";

export interface PreviewCheckoutRecord {
  checkout_ref: string;
  sku: string;
  quantity: number;
  move_id: number | null;
  status: PreviewCheckoutStatus;
}

/** Separate journal: it is constructed only when the isolated-preview feature is enabled. */
export class PreviewCheckoutStore {
  private readonly pool: pg.Pool;
  private readonly ready: Promise<void>;

  constructor(connectionString: string) {
    this.pool = new pg.Pool({ connectionString, max: 5 });
    this.ready = this.pool.query(`
      CREATE TABLE IF NOT EXISTS preview_checkout_reservation (
        checkout_ref text PRIMARY KEY,
        sku text NOT NULL,
        quantity integer NOT NULL CHECK (quantity > 0),
        move_id bigint UNIQUE,
        status text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `).then(() => undefined);
  }

  async withSkuLock<T>(sku: string, operation: () => Promise<T>): Promise<T> {
    await this.ready;
    const client = await this.pool.connect();
    try {
      await client.query("SELECT pg_advisory_lock(hashtext($1))", [`preview-stock:${sku}`]);
      return await operation();
    } finally {
      await client.query("SELECT pg_advisory_unlock(hashtext($1))", [`preview-stock:${sku}`])
        .catch(() => undefined);
      client.release();
    }
  }

  async get(checkoutRef: string): Promise<PreviewCheckoutRecord | null> {
    await this.ready;
    const result = await this.pool.query<PreviewCheckoutRecord>(
      "SELECT checkout_ref, sku, quantity, move_id::integer AS move_id, status FROM preview_checkout_reservation WHERE checkout_ref = $1",
      [checkoutRef],
    );
    return result.rows[0] ?? null;
  }

  async createIntent(checkoutRef: string, sku: string, quantity: number): Promise<void> {
    await this.ready;
    const result = await this.pool.query(
      `INSERT INTO preview_checkout_reservation (checkout_ref, sku, quantity, status)
       VALUES ($1, $2, $3, 'intent') ON CONFLICT (checkout_ref) DO NOTHING`,
      [checkoutRef, sku, quantity],
    );
    if (result.rowCount !== 1) throw new Error("Preview checkout already has an intent");
  }

  async advance(
    checkoutRef: string,
    expected: PreviewCheckoutStatus,
    next: PreviewCheckoutStatus,
    moveId?: number,
  ): Promise<void> {
    await this.ready;
    const result = await this.pool.query(
      `UPDATE preview_checkout_reservation
          SET status = $3, move_id = COALESCE($4, move_id), updated_at = now()
        WHERE checkout_ref = $1 AND status = $2`,
      [checkoutRef, expected, next, moveId ?? null],
    );
    if (result.rowCount !== 1) {
      throw new Error(`Preview checkout transition ${expected} -> ${next} failed`);
    }
  }

  async needsReview(checkoutRef: string): Promise<void> {
    await this.ready;
    await this.pool.query(
      `UPDATE preview_checkout_reservation
          SET status = 'needs_review', updated_at = now()
        WHERE checkout_ref = $1 AND status <> 'confirmed'`,
      [checkoutRef],
    );
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
