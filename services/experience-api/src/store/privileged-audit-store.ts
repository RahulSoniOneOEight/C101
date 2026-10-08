import { randomUUID } from "node:crypto";
import pg from "pg";

export class PrivilegedAuditStore {
  private readonly pool: pg.Pool;
  private readonly ready: Promise<void>;

  constructor(connectionString: string) {
    this.pool = new pg.Pool({ connectionString, max: 3 });
    this.ready = this.ensureSchema();
  }

  private async ensureSchema(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS pilot_privileged_audit (
        id                   text PRIMARY KEY,
        actor_user_id        text NOT NULL,
        actor_roles          jsonb NOT NULL,
        business_account_id  text,
        seller_id            text,
        method               text NOT NULL,
        path                 text NOT NULL,
        correlation_id       text NOT NULL,
        status               text NOT NULL CHECK (status IN ('started', 'succeeded', 'rejected', 'failed')),
        response_status      integer,
        test_data            boolean NOT NULL DEFAULT true CHECK (test_data = true),
        started_at           timestamptz NOT NULL DEFAULT now(),
        completed_at         timestamptz
      );
      CREATE INDEX IF NOT EXISTS pilot_privileged_audit_actor_started_idx
        ON pilot_privileged_audit (actor_user_id, started_at DESC);
      CREATE INDEX IF NOT EXISTS pilot_privileged_audit_correlation_idx
        ON pilot_privileged_audit (correlation_id);
    `);
  }

  async start(input: {
    actorUserId: string;
    actorRoles: readonly string[];
    businessAccountId?: string;
    sellerId?: string;
    method: string;
    path: string;
    correlationId: string;
  }): Promise<string> {
    await this.ready;
    const id = `audit_${randomUUID()}`;
    await this.pool.query(
      `INSERT INTO pilot_privileged_audit (
         id, actor_user_id, actor_roles, business_account_id, seller_id,
         method, path, correlation_id, status, test_data
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'started', true)`,
      [
        id,
        input.actorUserId,
        JSON.stringify(input.actorRoles),
        input.businessAccountId ?? null,
        input.sellerId ?? null,
        input.method,
        input.path,
        input.correlationId,
      ],
    );
    return id;
  }

  async complete(id: string, responseStatus: number): Promise<void> {
    await this.ready;
    const status = responseStatus < 400 ? "succeeded" : responseStatus < 500 ? "rejected" : "failed";
    await this.pool.query(
      `UPDATE pilot_privileged_audit
       SET status = $2, response_status = $3, completed_at = now()
       WHERE id = $1 AND status = 'started'`,
      [id, status, responseStatus],
    );
  }

  async list(limit = 100): Promise<Record<string, unknown>[]> {
    await this.ready;
    const safeLimit = Math.max(1, Math.min(limit, 200));
    const result = await this.pool.query(
      `SELECT id, actor_user_id, actor_roles, business_account_id, seller_id,
              method, path, correlation_id, status, response_status, test_data,
              started_at, completed_at
       FROM pilot_privileged_audit
       ORDER BY started_at DESC
       LIMIT $1`,
      [safeLimit],
    );
    return result.rows;
  }

  poolStats(): { total: number; idle: number; waiting: number } {
    return { total: this.pool.totalCount, idle: this.pool.idleCount, waiting: this.pool.waitingCount };
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
