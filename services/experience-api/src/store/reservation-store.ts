import pg from "pg";

/**
 * Durable reservation ledger + per-checkout reservation records for the bounded staging pilot.
 *
 * Demonstrates E-017-013 "concurrent checkout cannot oversell constrained inventory": `tryReserve`
 * performs an atomic conditional increment (Postgres row lock serialises concurrent attempts) and
 * rejects any reservation that would push `reserved` above `available`. Per-checkout records give
 * idempotency (re-reserving the same checkout returns the existing reservation) and enable release.
 */

export interface ReservationRecord {
  checkout_ref: string;
  sku: string;
  quantity: number;
  move_id: number | null;
  status: string;
  created_at: string;
}

export interface ReservationLedgerRow {
  sku: string;
  available: number;
  reserved: number;
}

export class ReservationStore {
  private pool: pg.Pool;
  private ready: Promise<void>;

  constructor(connectionString: string) {
    this.pool = new pg.Pool({ connectionString, max: 5 });
    this.ready = this.ensureSchema();
  }

  private async ensureSchema(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS reservation (
        checkout_ref text PRIMARY KEY,
        sku          text NOT NULL,
        quantity     integer NOT NULL,
        move_id      bigint,
        status       text NOT NULL DEFAULT 'reserved',
        reserved_at  timestamptz NOT NULL DEFAULT now(),
        created_at   timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS reservation_ledger (
        sku        text PRIMARY KEY,
        available  integer NOT NULL DEFAULT 1000000,
        reserved   integer NOT NULL DEFAULT 0,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      ALTER TABLE reservation ADD COLUMN IF NOT EXISTS reserved_at timestamptz NOT NULL DEFAULT now();
    `);
  }

  async getReservation(checkoutRef: string): Promise<ReservationRecord | null> {
    await this.ready;
    const r = await this.pool.query(
      "SELECT checkout_ref, sku, quantity, move_id, status, created_at FROM reservation WHERE checkout_ref = $1",
      [checkoutRef],
    );
    return r.rows[0] ?? null;
  }

  /**
   * Atomically reserve `quantity` for `sku` if it does not exceed available. Returns the updated
   * ledger row, or null when the reservation would oversell.
   */
  async tryReserve(
    sku: string,
    quantity: number,
    availableDefault = 1000000,
  ): Promise<ReservationLedgerRow | null> {
    await this.ready;
    await this.pool.query(
      "INSERT INTO reservation_ledger (sku, available, reserved) VALUES ($1, $2, 0) ON CONFLICT (sku) DO NOTHING",
      [sku, availableDefault],
    );
    const r = await this.pool.query(
      `UPDATE reservation_ledger
         SET reserved = reserved + $2, updated_at = now()
       WHERE sku = $1 AND reserved + $2 <= available
       RETURNING sku, available, reserved`,
      [sku, quantity],
    );
    return r.rows[0] ?? null;
  }

  async recordReservation(
    checkoutRef: string,
    sku: string,
    quantity: number,
    moveId: number | null,
  ): Promise<void> {
    await this.ready;
    await this.pool.query(
      "INSERT INTO reservation (checkout_ref, sku, quantity, move_id) VALUES ($1, $2, $3, $4) ON CONFLICT (checkout_ref) DO NOTHING",
      [checkoutRef, sku, quantity, moveId],
    );
  }

  /** Decrement the ledger and mark the reservation released; returns the released record or null. */
  async release(checkoutRef: string): Promise<ReservationRecord | null> {
    await this.ready;
    const existing = await this.getReservation(checkoutRef);
    if (!existing) return null;
    await this.pool.query(
      "UPDATE reservation_ledger SET reserved = GREATEST(0, reserved - $2), updated_at = now() WHERE sku = $1",
      [existing.sku, existing.quantity],
    );
    await this.pool.query(
      "UPDATE reservation SET status = 'released' WHERE checkout_ref = $1",
      [checkoutRef],
    );
    return existing;
  }

  /** Directly decrement the ledger by `quantity` (used to roll back a failed reservation). */
  async releaseQuantity(sku: string, quantity: number): Promise<void> {
    await this.ready;
    await this.pool.query(
      "UPDATE reservation_ledger SET reserved = GREATEST(0, reserved - $2), updated_at = now() WHERE sku = $1",
      [sku, quantity],
    );
  }

  /** True when the checkout's reservation is expired (marked expired, or reserved past its TTL). */
  async isExpired(checkoutRef: string, ttlMs: number): Promise<boolean> {
    await this.ready;
    const r = await this.pool.query(
      "SELECT 1 FROM reservation WHERE checkout_ref = $1 AND (status = 'expired' OR (status = 'reserved' AND reserved_at < now() - ($2 || ' milliseconds')::interval))",
      [checkoutRef, ttlMs],
    );
    return (r.rowCount ?? 0) > 0;
  }

  /** Release all reservations older than `ttlMs` (decrement ledger + mark expired); returns count. */
  async expireReservations(ttlMs: number): Promise<number> {
    await this.ready;
    const expired = await this.pool.query(
      "SELECT checkout_ref, sku, quantity FROM reservation WHERE status = 'reserved' AND reserved_at < now() - ($1 || ' milliseconds')::interval",
      [ttlMs],
    );
    for (const r of expired.rows) {
      await this.pool.query(
        "UPDATE reservation_ledger SET reserved = GREATEST(0, reserved - $2), updated_at = now() WHERE sku = $1",
        [r.sku, r.quantity],
      );
      await this.pool.query(
        "UPDATE reservation SET status = 'expired' WHERE checkout_ref = $1",
        [r.checkout_ref],
      );
    }
    return expired.rowCount ?? 0;
  }

  async getLedger(sku: string): Promise<ReservationLedgerRow | null> {
    await this.ready;
    const r = await this.pool.query(
      "SELECT sku, available, reserved FROM reservation_ledger WHERE sku = $1",
      [sku],
    );
    return r.rows[0] ?? null;
  }

  async setAvailable(sku: string, available: number): Promise<void> {
    await this.ready;
    await this.pool.query(
      `INSERT INTO reservation_ledger (sku, available, reserved) VALUES ($1, $2, 0)
       ON CONFLICT (sku) DO UPDATE SET available = EXCLUDED.available, reserved = 0, updated_at = now()`,
      [sku, available],
    );
  }

  /** Connection-pool telemetry for the operational metrics endpoint. */
  poolStats(): { total: number; idle: number; waiting: number } {
    return {
      total: this.pool.totalCount,
      idle: this.pool.idleCount,
      waiting: this.pool.waitingCount,
    };
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
