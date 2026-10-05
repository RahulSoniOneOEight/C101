import pg from "pg";
import { randomUUID } from "node:crypto";

/**
 * Durable domain-event log (step 3 / WP4 foundation). Appends canonical events emitted by the
 * Experience API; consumers (Flutter, web, notifications, ERP) poll or subscribe. This is an
 * outbox-style projection — a full Redis-backed transport is tracked separately (step 7).
 */

export interface DomainEvent {
  id: string;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  correlation_id: string;
  payload: Record<string, unknown>;
  occurred_at: string;
}

export class EventStore {
  private pool: pg.Pool;
  private ready: Promise<void>;

  constructor(connectionString: string) {
    this.pool = new pg.Pool({ connectionString, max: 5 });
    this.ready = this.ensureSchema();
  }

  private async ensureSchema(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS domain_event (
        id             uuid PRIMARY KEY,
        event_type     text NOT NULL,
        aggregate_type text NOT NULL,
        aggregate_id   text NOT NULL,
        correlation_id text NOT NULL,
        payload        jsonb NOT NULL,
        occurred_at    timestamptz NOT NULL DEFAULT now(),
        published_at   timestamptz
      );
      ALTER TABLE domain_event ADD COLUMN IF NOT EXISTS published_at timestamptz;
      CREATE INDEX IF NOT EXISTS domain_event_aggregate_idx ON domain_event (aggregate_type, aggregate_id);
      CREATE INDEX IF NOT EXISTS domain_event_occurred_idx ON domain_event (occurred_at);
      CREATE INDEX IF NOT EXISTS domain_event_published_idx ON domain_event (published_at) WHERE published_at IS NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS domain_event_order_confirmed_unique
        ON domain_event (event_type, aggregate_type, aggregate_id)
        WHERE event_type = 'order.confirmed';
    `);
  }

  async append(event: Omit<DomainEvent, "id" | "occurred_at">): Promise<DomainEvent> {
    await this.ready;
    const id = randomUUID();
    const occurredAt = new Date().toISOString();
    await this.pool.query(
      `INSERT INTO domain_event (id, event_type, aggregate_type, aggregate_id, correlation_id, payload, occurred_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, event.event_type, event.aggregate_type, event.aggregate_id, event.correlation_id, JSON.stringify(event.payload), occurredAt],
    );
    return { id, ...event, occurred_at: occurredAt };
  }

  /**
   * Append the single canonical order-confirmed event for an order group. The partial unique index
   * makes duplicate cart-complete retries converge on the existing event instead of republishing.
   */
  async appendOrderConfirmed(
    event: Omit<DomainEvent, "id" | "occurred_at">,
  ): Promise<DomainEvent> {
    if (event.event_type !== "order.confirmed") {
      throw new Error("appendOrderConfirmed only accepts order.confirmed events");
    }
    await this.ready;
    const id = randomUUID();
    const occurredAt = new Date().toISOString();
    const inserted = await this.pool.query(
      `INSERT INTO domain_event (id, event_type, aggregate_type, aggregate_id, correlation_id, payload, occurred_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (event_type, aggregate_type, aggregate_id)
         WHERE event_type = 'order.confirmed'
       DO NOTHING
       RETURNING id, event_type, aggregate_type, aggregate_id, correlation_id, payload, occurred_at`,
      [id, event.event_type, event.aggregate_type, event.aggregate_id, event.correlation_id, JSON.stringify(event.payload), occurredAt],
    );
    if (inserted.rows[0]) return inserted.rows[0] as DomainEvent;

    const existing = await this.pool.query(
      `SELECT id, event_type, aggregate_type, aggregate_id, correlation_id, payload, occurred_at
       FROM domain_event
       WHERE event_type = 'order.confirmed' AND aggregate_type = $1 AND aggregate_id = $2
       LIMIT 1`,
      [event.aggregate_type, event.aggregate_id],
    );
    return existing.rows[0] as DomainEvent;
  }

  async list(aggregateType?: string, aggregateId?: string, limit = 50): Promise<DomainEvent[]> {
    await this.ready;
    const params: unknown[] = [];
    let where = "";
    if (aggregateType && aggregateId) {
      where = "WHERE aggregate_type = $1 AND aggregate_id = $2";
      params.push(aggregateType, aggregateId);
    }
    params.push(limit);
    const result = await this.pool.query(
      `SELECT id, event_type, aggregate_type, aggregate_id, correlation_id, payload, occurred_at
       FROM domain_event ${where} ORDER BY occurred_at DESC LIMIT $${params.length}`,
      params,
    );
    return result.rows;
  }

  /** Outbox drain: unpublished events, oldest first. */
  async listUnpublished(limit = 100): Promise<DomainEvent[]> {
    await this.ready;
    const result = await this.pool.query(
      `SELECT id, event_type, aggregate_type, aggregate_id, correlation_id, payload, occurred_at
       FROM domain_event WHERE published_at IS NULL ORDER BY occurred_at ASC LIMIT $1`,
      [limit],
    );
    return result.rows;
  }

  /** Mark an event published (outbox acknowledgement). */
  async markPublished(id: string): Promise<void> {
    await this.ready;
    await this.pool.query(
      "UPDATE domain_event SET published_at = now() WHERE id = $1 AND published_at IS NULL",
      [id],
    );
  }
}
