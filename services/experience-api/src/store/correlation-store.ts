import pg from "pg";

/**
 * Durable cross-system correlation store backed by PostgreSQL.
 *
 * Replaces the previous in-memory Map so Medusa order-group and Tryton stock-move references survive
 * restarts. Uses idempotent upsert with conflict detection: an established external ID is never
 * overwritten by a different value.
 */

export interface CorrelationRecord {
  checkout_ref: string;
  medusa_order_group_id: string | null;
  tryton_move_id: number | null;
  created_at: string;
  updated_at: string;
}

export class CorrelationStore {
  private pool: pg.Pool;
  private ready: Promise<void>;

  constructor(connectionString: string) {
    this.pool = new pg.Pool({ connectionString, max: 5 });
    this.ready = this.ensureSchema();
  }

  private async ensureSchema(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS correlation (
        checkout_ref           text PRIMARY KEY,
        medusa_order_group_id  text,
        tryton_move_id         bigint,
        created_at             timestamptz NOT NULL DEFAULT now(),
        updated_at             timestamptz NOT NULL DEFAULT now()
      );

      CREATE UNIQUE INDEX IF NOT EXISTS correlation_medusa_uidx
        ON correlation (medusa_order_group_id)
        WHERE medusa_order_group_id IS NOT NULL;

      CREATE UNIQUE INDEX IF NOT EXISTS correlation_tryton_uidx
        ON correlation (tryton_move_id)
        WHERE tryton_move_id IS NOT NULL;
    `);
  }

  /** Idempotent upsert; never overwrites an established external ID with a different value. */
  async link(
    checkoutRef: string,
    patch: { orderGroup?: string; trytonMove?: number },
  ): Promise<void> {
    await this.ready;
    const result = await this.pool.query(
      `INSERT INTO correlation (checkout_ref, medusa_order_group_id, tryton_move_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (checkout_ref) DO UPDATE SET
         medusa_order_group_id = COALESCE(correlation.medusa_order_group_id, EXCLUDED.medusa_order_group_id),
         tryton_move_id = COALESCE(correlation.tryton_move_id, EXCLUDED.tryton_move_id),
         updated_at = now()
       WHERE
         (correlation.medusa_order_group_id IS NULL OR EXCLUDED.medusa_order_group_id IS NULL
          OR correlation.medusa_order_group_id = EXCLUDED.medusa_order_group_id)
         AND
         (correlation.tryton_move_id IS NULL OR EXCLUDED.tryton_move_id IS NULL
          OR correlation.tryton_move_id = EXCLUDED.tryton_move_id)`,
      [checkoutRef, patch.orderGroup ?? null, patch.trytonMove ?? null],
    );
    if (result.rowCount === 0) {
      throw new Error(`Correlation conflict for checkout_ref ${checkoutRef}`);
    }
  }

  async get(checkoutRef: string): Promise<CorrelationRecord | null> {
    await this.ready;
    const result = await this.pool.query(
      "SELECT checkout_ref, medusa_order_group_id, tryton_move_id, created_at, updated_at FROM correlation WHERE checkout_ref = $1",
      [checkoutRef],
    );
    return result.rows[0] ?? null;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
