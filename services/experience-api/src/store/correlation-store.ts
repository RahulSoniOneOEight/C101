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
  medusa_order_group: Record<string, unknown> | null;
  payment_evidence: Record<string, unknown> | null;
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

  /** Serialize checkout completion across API processes using a PostgreSQL advisory lock. */
  async withCheckoutLock<T>(checkoutRef: string, operation: () => Promise<T>): Promise<T> {
    await this.ready;
    const client = await this.pool.connect();
    try {
      await client.query("SELECT pg_advisory_lock(hashtext($1))", [checkoutRef]);
      return await operation();
    } finally {
      await client
        .query("SELECT pg_advisory_unlock(hashtext($1))", [checkoutRef])
        .catch(() => undefined);
      client.release();
    }
  }

  private async ensureSchema(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS correlation (
        checkout_ref           text PRIMARY KEY,
        medusa_order_group_id  text,
        medusa_order_group     jsonb,
        payment_evidence       jsonb,
        tryton_move_id         bigint,
        created_at             timestamptz NOT NULL DEFAULT now(),
        updated_at             timestamptz NOT NULL DEFAULT now()
      );

      ALTER TABLE correlation ADD COLUMN IF NOT EXISTS medusa_order_group jsonb;
      ALTER TABLE correlation ADD COLUMN IF NOT EXISTS payment_evidence jsonb;

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
    patch: {
      orderGroup?: string;
      orderGroupPayload?: Record<string, unknown>;
      paymentEvidence?: Record<string, unknown>;
      trytonMove?: number;
    },
  ): Promise<void> {
    await this.ready;
    const result = await this.pool.query(
      `INSERT INTO correlation (
         checkout_ref, medusa_order_group_id, medusa_order_group, payment_evidence, tryton_move_id
       )
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (checkout_ref) DO UPDATE SET
         medusa_order_group_id = COALESCE(correlation.medusa_order_group_id, EXCLUDED.medusa_order_group_id),
         medusa_order_group = COALESCE(correlation.medusa_order_group, EXCLUDED.medusa_order_group),
         payment_evidence = COALESCE(correlation.payment_evidence, EXCLUDED.payment_evidence),
         tryton_move_id = COALESCE(correlation.tryton_move_id, EXCLUDED.tryton_move_id),
         updated_at = now()
       WHERE
         (correlation.medusa_order_group_id IS NULL OR EXCLUDED.medusa_order_group_id IS NULL
          OR correlation.medusa_order_group_id = EXCLUDED.medusa_order_group_id)
         AND
         (correlation.tryton_move_id IS NULL OR EXCLUDED.tryton_move_id IS NULL
          OR correlation.tryton_move_id = EXCLUDED.tryton_move_id)`,
      [
        checkoutRef,
        patch.orderGroup ?? null,
        patch.orderGroupPayload ? JSON.stringify(patch.orderGroupPayload) : null,
        patch.paymentEvidence ? JSON.stringify(patch.paymentEvidence) : null,
        patch.trytonMove ?? null,
      ],
    );
    if (result.rowCount === 0) {
      throw new Error(`Correlation conflict for checkout_ref ${checkoutRef}`);
    }
  }

  async get(checkoutRef: string): Promise<CorrelationRecord | null> {
    await this.ready;
    const result = await this.pool.query(
      `SELECT checkout_ref, medusa_order_group_id, medusa_order_group, payment_evidence,
              tryton_move_id, created_at, updated_at
       FROM correlation WHERE checkout_ref = $1`,
      [checkoutRef],
    );
    return result.rows[0] ?? null;
  }

  /** List recent correlations (most recently updated first) for the operator order queue. */
  async list(limit = 200): Promise<CorrelationRecord[]> {
    await this.ready;
    const result = await this.pool.query(
      `SELECT checkout_ref, medusa_order_group_id, medusa_order_group, payment_evidence,
              tryton_move_id, created_at, updated_at
       FROM correlation ORDER BY updated_at DESC LIMIT $1`,
      [limit],
    );
    return result.rows;
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
