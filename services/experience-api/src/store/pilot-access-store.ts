import pg from "pg";
import type { PilotAuthorization, PilotRole } from "../auth/pilot-authorization.js";

/**
 * Persistent overrides for the deployed pilot role assignments.
 *
 * The environment remains the safe baseline. This store lets a super-admin grant or revoke
 * test-user access without rebuilding the Experience API, and every authenticated request reads
 * the override before falling back to the environment assignment.
 */
export interface PilotAccessAssignment extends PilotAuthorization {
  updatedBy?: string;
  updatedAt?: string;
}

interface AssignmentRow {
  user_id: string;
  roles: unknown;
  business_account_id: string | null;
  seller_id: string | null;
  updated_by: string;
  updated_at: Date | string;
}

export class PilotAccessStore {
  private static readonly CACHE_TTL_MS = 5_000;
  private readonly pool: pg.Pool;
  private readonly ready: Promise<void>;
  private cache?: Map<string, PilotAccessAssignment>;
  private cacheLoadedAt = 0;

  constructor(connectionString: string) {
    this.pool = new pg.Pool({ connectionString, max: 2 });
    this.ready = this.ensureSchema();
  }

  private async ensureSchema(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS pilot_access_assignment (
        user_id              text PRIMARY KEY,
        roles                jsonb NOT NULL,
        business_account_id  text,
        seller_id            text,
        updated_by           text NOT NULL,
        updated_at           timestamptz NOT NULL DEFAULT now(),
        test_data            boolean NOT NULL DEFAULT true CHECK (test_data = true)
      );
      CREATE INDEX IF NOT EXISTS pilot_access_assignment_updated_idx
        ON pilot_access_assignment (updated_at DESC);
    `);
  }

  private normalize(row: AssignmentRow): PilotAccessAssignment {
    const roles = Array.isArray(row.roles)
      ? (row.roles as unknown[]).map((role) => String(role)) as PilotRole[]
      : [];
    return {
      userId: row.user_id,
      roles,
      businessAccountId: row.business_account_id ?? undefined,
      sellerId: row.seller_id ?? undefined,
      updatedBy: row.updated_by,
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  private async load(): Promise<Map<string, PilotAccessAssignment>> {
    await this.ready;
    const result = await this.pool.query<AssignmentRow>(
      `SELECT user_id, roles, business_account_id, seller_id, updated_by, updated_at
         FROM pilot_access_assignment
        ORDER BY user_id`,
    );
    this.cache = new Map(result.rows.map((row) => [row.user_id, this.normalize(row)]));
    this.cacheLoadedAt = Date.now();
    return this.cache;
  }

  private async ensureCache(): Promise<Map<string, PilotAccessAssignment>> {
    if (
      !this.cache ||
      Date.now() - this.cacheLoadedAt > PilotAccessStore.CACHE_TTL_MS
    ) {
      return this.load();
    }
    return this.cache;
  }

  async get(userId: string): Promise<PilotAccessAssignment | undefined> {
    const cache = await this.ensureCache();
    return cache.get(userId);
  }

  async list(): Promise<PilotAccessAssignment[]> {
    const cache = await this.ensureCache();
    return [...cache.values()];
  }

  async upsert(input: {
    userId: string;
    roles: PilotRole[];
    businessAccountId?: string;
    sellerId?: string;
    updatedBy: string;
  }): Promise<PilotAccessAssignment> {
    await this.ready;
    const roles = [...new Set(input.roles)];
    const result = await this.pool.query<AssignmentRow>(
      `INSERT INTO pilot_access_assignment
         (user_id, roles, business_account_id, seller_id, updated_by, updated_at)
       VALUES ($1, $2::jsonb, $3, $4, $5, now())
       ON CONFLICT (user_id) DO UPDATE SET
         roles = EXCLUDED.roles,
         business_account_id = EXCLUDED.business_account_id,
         seller_id = EXCLUDED.seller_id,
         updated_by = EXCLUDED.updated_by,
         updated_at = now()
       RETURNING user_id, roles, business_account_id, seller_id, updated_by, updated_at`,
      [
        input.userId,
        JSON.stringify(roles),
        input.businessAccountId ?? null,
        input.sellerId ?? null,
        input.updatedBy,
      ],
    );
    const assignment = this.normalize(result.rows[0]);
    if (this.cache) {
      this.cache.set(assignment.userId, assignment);
      this.cacheLoadedAt = Date.now();
    }
    return assignment;
  }

  poolStats(): { total: number; idle: number; waiting: number } {
    return { total: this.pool.totalCount, idle: this.pool.idleCount, waiting: this.pool.waitingCount };
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
