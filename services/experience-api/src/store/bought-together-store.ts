import pg from "pg";
import { randomUUID } from "node:crypto";

export type BoughtTogetherChannel = "b2c" | "b2b" | "both";
export type BoughtTogetherStatus = "draft" | "active" | "paused" | "archived";

export interface BoughtTogetherPair {
  id: string;
  product_a_id: string;
  product_b_id: string;
  channel: BoughtTogetherChannel;
  status: BoughtTogetherStatus;
  version: number;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

export interface BoughtTogetherPairInput {
  product_a_id: string;
  product_b_id: string;
  channel: BoughtTogetherChannel;
  status: BoughtTogetherStatus;
}

export interface BoughtTogetherActivePair {
  pair: BoughtTogetherPair;
  paired_product_id: string;
}

export interface BoughtTogetherAuditRow {
  id: string;
  pair_id: string;
  action: string;
  actor_id: string;
  correlation_id: string | null;
  before: unknown;
  after: unknown;
  created_at: string;
}

export class BoughtTogetherError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 409,
  ) {
    super(message);
    this.name = "BoughtTogetherError";
  }
}

const CHANNELS: BoughtTogetherChannel[] = ["b2c", "b2b", "both"];
const STATUSES: BoughtTogetherStatus[] = ["draft", "active", "paused", "archived"];

function pairFromRow(row: Record<string, unknown>): BoughtTogetherPair {
  return {
    id: String(row.id),
    product_a_id: String(row.product_a_id),
    product_b_id: String(row.product_b_id),
    channel: row.channel as BoughtTogetherChannel,
    status: row.status as BoughtTogetherStatus,
    version: Number(row.version),
    created_by: String(row.created_by),
    updated_by: String(row.updated_by),
    created_at: new Date(row.created_at as string).toISOString(),
    updated_at: new Date(row.updated_at as string).toISOString(),
  };
}

function assertInput(input: BoughtTogetherPairInput) {
  if (!input.product_a_id?.trim() || !input.product_b_id?.trim()) {
    throw new BoughtTogetherError("invalid_pair", "Both products are required.", 400);
  }
  if (input.product_a_id === input.product_b_id) {
    throw new BoughtTogetherError("invalid_pair", "A product cannot be paired with itself.", 400);
  }
  if (!CHANNELS.includes(input.channel)) {
    throw new BoughtTogetherError("invalid_pair", "Channel must be b2c, b2b or both.", 400);
  }
  if (!STATUSES.includes(input.status)) {
    throw new BoughtTogetherError("invalid_pair", "Invalid pair status.", 400);
  }
}

function mapDatabaseError(error: unknown): BoughtTogetherError {
  if (error instanceof BoughtTogetherError) return error;
  const pgError = error as { code?: string; constraint?: string; message?: string };
  if (pgError.code === "23505") {
    if (pgError.constraint?.includes("active_members")) {
      return new BoughtTogetherError(
        "product_already_paired",
        "A product is already in an active pair for this channel.",
      );
    }
    return new BoughtTogetherError(
      "pair_exists",
      "A non-archived pair for these products already exists.",
    );
  }
  return new BoughtTogetherError(
    "pair_store_error",
    "The pair store is unavailable.",
    500,
  );
}

/**
 * Experience-owned merchandising pairs. The store deliberately keeps only
 * product IDs, channel and lifecycle; prices, stock and titles are composed at
 * read time from Medusa/offers.
 */
export class BoughtTogetherStore {
  private readonly pool: pg.Pool;
  private readonly ready: Promise<void>;

  constructor(connectionString: string) {
    this.pool = new pg.Pool({ connectionString, max: 3 });
    this.ready = this.ensureSchema();
  }

  private async ensureSchema(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS bought_together_pairs (
        id            text PRIMARY KEY,
        product_a_id  text NOT NULL,
        product_b_id  text NOT NULL,
        channel       text NOT NULL CHECK (channel IN ('b2c', 'b2b', 'both')),
        status        text NOT NULL CHECK (status IN ('draft', 'active', 'paused', 'archived')),
        version       integer NOT NULL DEFAULT 1,
        pair_key      text GENERATED ALWAYS AS (
                        least(product_a_id, product_b_id) || ':' ||
                        greatest(product_a_id, product_b_id)
                      ) STORED,
        created_by    text NOT NULL,
        updated_by    text NOT NULL,
        created_at    timestamptz NOT NULL DEFAULT now(),
        updated_at    timestamptz NOT NULL DEFAULT now(),
        test_data     boolean NOT NULL DEFAULT true CHECK (test_data = true),
        CHECK (product_a_id <> product_b_id)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS bought_together_pairs_non_archived_pair_key
        ON bought_together_pairs (pair_key)
        WHERE status <> 'archived';

      CREATE TABLE IF NOT EXISTS bought_together_active_members (
        product_id  text NOT NULL,
        channel     text NOT NULL CHECK (channel IN ('b2c', 'b2b')),
        pair_id     text NOT NULL REFERENCES bought_together_pairs(id) ON DELETE CASCADE,
        PRIMARY KEY (product_id, channel)
      );

      CREATE TABLE IF NOT EXISTS bought_together_audit (
        id              bigserial PRIMARY KEY,
        pair_id         text NOT NULL,
        action          text NOT NULL,
        actor_id        text NOT NULL,
        correlation_id  text,
        before          jsonb,
        after           jsonb,
        created_at      timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS bought_together_audit_pair_idx
        ON bought_together_audit (pair_id, created_at DESC);
    `);
  }

  private async writeAudit(
    client: pg.PoolClient,
    pairId: string,
    action: string,
    actorId: string,
    correlationId: string | null,
    before: unknown,
    after: unknown,
  ) {
    await client.query(
      `INSERT INTO bought_together_audit
         (pair_id, action, actor_id, correlation_id, before, after)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [pairId, action, actorId, correlationId, before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null],
    );
  }

  private async replaceMembers(client: pg.PoolClient, pair: BoughtTogetherPair) {
    await client.query(`DELETE FROM bought_together_active_members WHERE pair_id = $1`, [pair.id]);
    if (pair.status !== "active") return;
    const channels = pair.channel === "both" ? ["b2c", "b2b"] : [pair.channel];
    for (const channel of channels) {
      for (const productId of [pair.product_a_id, pair.product_b_id]) {
        await client.query(
          `INSERT INTO bought_together_active_members (product_id, channel, pair_id)
           VALUES ($1, $2, $3)`,
          [productId, channel, pair.id],
        );
      }
    }
  }

  async create(
    input: BoughtTogetherPairInput,
    actorId: string,
    correlationId: string | null = null,
  ): Promise<BoughtTogetherPair> {
    await this.ready;
    assertInput(input);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const id = `btp_${randomUUID().replaceAll("-", "")}`;
      const result = await client.query(
        `INSERT INTO bought_together_pairs
           (id, product_a_id, product_b_id, channel, status, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $6)
         RETURNING *`,
        [id, input.product_a_id, input.product_b_id, input.channel, input.status, actorId],
      );
      const pair = pairFromRow(result.rows[0]);
      await this.replaceMembers(client, pair);
      await this.writeAudit(client, id, "created", actorId, correlationId, null, pair);
      await client.query("COMMIT");
      return pair;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw mapDatabaseError(error);
    } finally {
      client.release();
    }
  }

  async update(
    id: string,
    input: Partial<BoughtTogetherPairInput>,
    expectedVersion: number,
    actorId: string,
    correlationId: string | null = null,
  ): Promise<BoughtTogetherPair> {
    await this.ready;
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const currentResult = await client.query(
        `SELECT * FROM bought_together_pairs WHERE id = $1 FOR UPDATE`,
        [id],
      );
      if (currentResult.rowCount === 0) {
        throw new BoughtTogetherError("pair_not_found", "Pair not found.", 404);
      }
      const current = pairFromRow(currentResult.rows[0]);
      if (current.status === "archived") {
        throw new BoughtTogetherError("archived_pair", "Archived pairs are read-only.", 409);
      }
      if (current.version !== expectedVersion) {
        throw new BoughtTogetherError(
          "stale_pair",
          "This pair changed since it was opened. Refresh and try again.",
        );
      }
      const next: BoughtTogetherPairInput = {
        product_a_id: input.product_a_id ?? current.product_a_id,
        product_b_id: input.product_b_id ?? current.product_b_id,
        channel: input.channel ?? current.channel,
        status: input.status ?? current.status,
      };
      assertInput(next);
      const result = await client.query(
        `UPDATE bought_together_pairs
         SET product_a_id = $2,
             product_b_id = $3,
             channel = $4,
             status = $5,
             version = version + 1,
             updated_by = $6,
             updated_at = now()
         WHERE id = $1
         RETURNING *`,
        [id, next.product_a_id, next.product_b_id, next.channel, next.status, actorId],
      );
      const updated = pairFromRow(result.rows[0]);
      await this.replaceMembers(client, updated);
      const action =
        next.status === "active" && current.status !== "active"
          ? "activated"
          : next.status === "paused"
            ? "paused"
            : next.status === "archived"
              ? "archived"
              : "updated";
      await this.writeAudit(client, id, action, actorId, correlationId, current, updated);
      await client.query("COMMIT");
      return updated;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw mapDatabaseError(error);
    } finally {
      client.release();
    }
  }

  async list(filters: {
    status?: BoughtTogetherStatus;
    channel?: BoughtTogetherChannel;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ items: BoughtTogetherPair[]; count: number }> {
    await this.ready;
    const values: unknown[] = [];
    const clauses: string[] = [];
    if (filters.status) {
      values.push(filters.status);
      clauses.push(`status = $${values.length}`);
    }
    if (filters.channel === "both") {
      clauses.push(`channel = 'both'`);
    } else if (filters.channel) {
      values.push(filters.channel);
      clauses.push(`(channel = $${values.length} OR channel = 'both')`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const countResult = await this.pool.query(
      `SELECT count(*)::int AS count FROM bought_together_pairs ${where}`,
      values,
    );
    const limit = Math.min(Math.max(filters.limit ?? 50, 1), 100);
    const offset = Math.max(filters.offset ?? 0, 0);
    values.push(limit, offset);
    const result = await this.pool.query(
      `SELECT * FROM bought_together_pairs
       ${where}
       ORDER BY updated_at DESC
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    );
    return {
      items: result.rows.map(pairFromRow),
      count: Number(countResult.rows[0]?.count ?? 0),
    };
  }

  async get(id: string): Promise<BoughtTogetherPair | undefined> {
    await this.ready;
    const result = await this.pool.query(
      `SELECT * FROM bought_together_pairs WHERE id = $1`,
      [id],
    );
    return result.rows[0] ? pairFromRow(result.rows[0]) : undefined;
  }

  async getActiveForProduct(
    productId: string,
    channel: "b2c" | "b2b",
  ): Promise<BoughtTogetherActivePair | undefined> {
    await this.ready;
    const result = await this.pool.query(
      `SELECT p.*,
              CASE WHEN p.product_a_id = $1 THEN p.product_b_id ELSE p.product_a_id END AS paired_product_id
       FROM bought_together_active_members m
       JOIN bought_together_pairs p ON p.id = m.pair_id
       WHERE m.product_id = $1 AND m.channel = $2 AND p.status = 'active'
       LIMIT 1`,
      [productId, channel],
    );
    const row = result.rows[0];
    if (!row) return undefined;
    return {
      pair: pairFromRow(row),
      paired_product_id: String(row.paired_product_id),
    };
  }

  async audit(id: string): Promise<BoughtTogetherAuditRow[]> {
    await this.ready;
    const result = await this.pool.query(
      `SELECT * FROM bought_together_audit WHERE pair_id = $1 ORDER BY created_at DESC, id DESC`,
      [id],
    );
    return result.rows.map((row) => ({
      id: String(row.id),
      pair_id: String(row.pair_id),
      action: String(row.action),
      actor_id: String(row.actor_id),
      correlation_id: row.correlation_id ? String(row.correlation_id) : null,
      before: row.before,
      after: row.after,
      created_at: new Date(row.created_at).toISOString(),
    }));
  }

  async poolStats() {
    return {
      total: this.pool.totalCount,
      idle: this.pool.idleCount,
      waiting: this.pool.waitingCount,
    };
  }
}
