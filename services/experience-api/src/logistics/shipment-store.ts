import { randomUUID } from "node:crypto";
import pg from "pg";

/**
 * Durable staging shipment projection and append-only provider event store.
 *
 * This is deliberately separate from the commerce order aggregate. It records only the
 * logistics projection and provider evidence; it never mutates Medusa order state or Tryton stock.
 */

export type ShipmentStatus =
  | "booked"
  | "picked_up"
  | "in_transit"
  | "delivery_failed"
  | "out_for_delivery"
  | "damaged"
  | "lost"
  | "delivered"
  | "rto_in_transit"
  | "rto_delivered"
  | "cancelled";

export const SHIPMENT_STATUS_RANK: Record<ShipmentStatus, number> = {
  booked: 10,
  picked_up: 20,
  in_transit: 30,
  delivery_failed: 35,
  out_for_delivery: 40,
  damaged: 45,
  lost: 45,
  delivered: 50,
  rto_in_transit: 55,
  rto_delivered: 60,
  cancelled: 70,
};

export const SHIPMENT_STATUSES = Object.keys(SHIPMENT_STATUS_RANK) as ShipmentStatus[];
export const TERMINAL_SHIPMENT_STATUSES = new Set<ShipmentStatus>([
  "delivered",
  "rto_delivered",
  "cancelled",
]);

export interface ShipmentLineInput {
  lineKey: string;
  sku: string;
  orderedQty: number;
}

export interface ShipmentLine extends ShipmentLineInput {
  deliveredQty: number;
}

export interface ShipmentRecord {
  id: string;
  orderGroupId: string;
  allocationId: string;
  sellerId: string;
  provider: string;
  trackingNumber: string;
  status: ShipmentStatus;
  deliveredAt: string | null;
  proofRef: string | null;
  destinationPostcode: string | null;
  environment: "staging";
  logisticsMode: "simulated";
  testData: true;
  createdAt: string;
  updatedAt: string;
  lines: ShipmentLine[];
}

export interface ShipmentEventRecord {
  id: string;
  shipmentId: string;
  provider: string;
  providerEventId: string;
  eventType: string;
  status: ShipmentStatus;
  occurredAt: string;
  receivedAt: string;
  payload: Record<string, unknown>;
  testData: true;
}

export interface ShipmentReconciliation {
  shipmentId: string;
  persistedStatus: ShipmentStatus;
  derivedStatus: ShipmentStatus;
  statusAdjusted: boolean;
  missingDeliveryEvidence: boolean;
  duplicateEvents: number;
  outOfOrderEvents: number;
  repaired: boolean;
}

interface ShipmentRow {
  id: string;
  order_group_id: string;
  allocation_id: string;
  seller_id: string;
  provider: string;
  tracking_number: string;
  status: ShipmentStatus;
  delivered_at: Date | string | null;
  proof_ref: string | null;
  destination_postcode: string | null;
  environment: "staging";
  logistics_mode: "simulated";
  test_data: true;
  created_at: Date | string;
  updated_at: Date | string;
}

interface ShipmentLineRow {
  shipment_id: string;
  line_key: string;
  sku: string;
  ordered_qty: number;
  delivered_qty: number;
}

interface ShipmentEventRow {
  id: string;
  shipment_id: string;
  provider: string;
  provider_event_id: string;
  event_type: string;
  status: ShipmentStatus;
  occurred_at: Date | string;
  received_at: Date | string;
  payload: Record<string, unknown>;
  test_data: true;
}

function iso(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function requiredIso(value: Date | string): string {
  return iso(value) as string;
}

function mapLine(row: ShipmentLineRow): ShipmentLine {
  return {
    lineKey: row.line_key,
    sku: row.sku,
    orderedQty: row.ordered_qty,
    deliveredQty: row.delivered_qty,
  };
}

function mapShipment(row: ShipmentRow, lines: ShipmentLineRow[]): ShipmentRecord {
  return {
    id: row.id,
    orderGroupId: row.order_group_id,
    allocationId: row.allocation_id,
    sellerId: row.seller_id,
    provider: row.provider,
    trackingNumber: row.tracking_number,
    status: row.status,
    deliveredAt: iso(row.delivered_at),
    proofRef: row.proof_ref,
    destinationPostcode: row.destination_postcode,
    environment: row.environment,
    logisticsMode: row.logistics_mode,
    testData: true,
    createdAt: requiredIso(row.created_at),
    updatedAt: requiredIso(row.updated_at),
    lines: lines.filter((line) => line.shipment_id === row.id).map(mapLine),
  };
}

export class ShipmentStore {
  private readonly pool: pg.Pool;
  private readonly ready: Promise<void>;

  constructor(connectionString: string) {
    this.pool = new pg.Pool({ connectionString, max: 5 });
    this.ready = this.ensureSchema();
  }

  private async ensureSchema(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      // Multiple service instances can boot together; serialize idempotent DDL so Postgres cannot
      // race two CREATE TABLE IF NOT EXISTS statements into the same pg_type row.
      await client.query("SELECT pg_advisory_xact_lock(48203501)");
      await client.query(`
      CREATE TABLE IF NOT EXISTS pilot_shipment (
        id                   text PRIMARY KEY,
        order_group_id       text NOT NULL,
        allocation_id        text NOT NULL UNIQUE,
        seller_id            text NOT NULL,
        provider             text NOT NULL DEFAULT 'simulated',
        tracking_number      text NOT NULL,
        status               text NOT NULL,
        delivered_at         timestamptz,
        proof_ref            text,
        destination_postcode text,
        environment          text NOT NULL CHECK (environment = 'staging'),
        logistics_mode       text NOT NULL CHECK (logistics_mode = 'simulated'),
        test_data            boolean NOT NULL DEFAULT true CHECK (test_data = true),
        created_at           timestamptz NOT NULL DEFAULT now(),
        updated_at           timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS pilot_shipment_order_group_idx
        ON pilot_shipment (order_group_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS pilot_shipment_status_updated_idx
        ON pilot_shipment (status, updated_at);

      CREATE TABLE IF NOT EXISTS pilot_shipment_line (
        shipment_id   text NOT NULL REFERENCES pilot_shipment(id) ON DELETE CASCADE,
        line_key      text NOT NULL,
        sku           text NOT NULL,
        ordered_qty   integer NOT NULL CHECK (ordered_qty > 0),
        delivered_qty integer NOT NULL DEFAULT 0 CHECK (delivered_qty >= 0),
        PRIMARY KEY (shipment_id, line_key)
      );

      CREATE TABLE IF NOT EXISTS pilot_shipment_event (
        id                text PRIMARY KEY,
        shipment_id       text NOT NULL REFERENCES pilot_shipment(id) ON DELETE CASCADE,
        provider          text NOT NULL,
        provider_event_id text NOT NULL,
        event_type        text NOT NULL,
        status            text NOT NULL,
        occurred_at       timestamptz NOT NULL,
        received_at       timestamptz NOT NULL DEFAULT now(),
        payload           jsonb NOT NULL DEFAULT '{}'::jsonb,
        test_data         boolean NOT NULL DEFAULT true CHECK (test_data = true)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS pilot_shipment_event_provider_event_uidx
        ON pilot_shipment_event (provider, provider_event_id);
      CREATE INDEX IF NOT EXISTS pilot_shipment_event_shipment_idx
        ON pilot_shipment_event (shipment_id, occurred_at, received_at);
    `);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async book(input: {
    orderGroupId: string;
    allocationId: string;
    sellerId: string;
    lines: ShipmentLineInput[];
    destinationPostcode?: string | null;
    provider?: string;
  }): Promise<{ shipment: ShipmentRecord; created: boolean }> {
    await this.ready;
    const existing = await this.findByAllocation(input.allocationId);
    if (existing) return { shipment: existing, created: false };

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const id = `ship_${randomUUID().replaceAll("-", "")}`;
      const tracking = `SIM-${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
      const provider = input.provider ?? "simulated";
      await client.query(
        `INSERT INTO pilot_shipment
           (id, order_group_id, allocation_id, seller_id, provider, tracking_number, status,
            destination_postcode, environment, logistics_mode, test_data)
         VALUES ($1, $2, $3, $4, $5, $6, 'booked', $7, 'staging', 'simulated', true)`,
        [
          id,
          input.orderGroupId,
          input.allocationId,
          input.sellerId,
          provider,
          tracking,
          input.destinationPostcode ?? null,
        ],
      );
      for (const line of input.lines) {
        await client.query(
          `INSERT INTO pilot_shipment_line
             (shipment_id, line_key, sku, ordered_qty, delivered_qty)
           VALUES ($1, $2, $3, $4, 0)`,
          [id, line.lineKey, line.sku, line.orderedQty],
        );
      }
      await client.query(
        `INSERT INTO pilot_shipment_event
           (id, shipment_id, provider, provider_event_id, event_type, status, occurred_at, payload, test_data)
         VALUES ($1, $2, $3, $4, 'booked', 'booked', now(), $5, true)`,
        [
          `shev_${randomUUID().replaceAll("-", "")}`,
          id,
          provider,
          `booked:${input.allocationId}`,
          JSON.stringify({ tracking_number: tracking }),
        ],
      );
      await client.query("COMMIT");
      const shipment = await this.get(id);
      if (!shipment) throw new Error("Shipment disappeared after booking.");
      return { shipment, created: true };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      // A concurrent booking may have won the unique allocation race; return that record.
      const current = await this.findByAllocation(input.allocationId).catch(() => null);
      if (current) return { shipment: current, created: false };
      throw error;
    } finally {
      client.release();
    }
  }

  async appendEvent(input: {
    shipmentId: string;
    providerEventId: string;
    eventType: string;
    status: ShipmentStatus;
    occurredAt: string;
    payload?: Record<string, unknown>;
    provider?: string;
    deliveredLines?: Array<{ lineKey: string; deliveredQty: number }>;
    proofRef?: string | null;
  }): Promise<{ event: ShipmentEventRecord; duplicate: boolean; statusChanged: boolean }> {
    await this.ready;
    const shipment = await this.get(input.shipmentId);
    if (!shipment) throw new Error("Shipment not found.");
    const provider = input.provider ?? shipment.provider;
    const existing = await this.pool.query<ShipmentEventRow>(
      `SELECT * FROM pilot_shipment_event WHERE provider = $1 AND provider_event_id = $2`,
      [provider, input.providerEventId],
    );
    if (existing.rows[0]) {
      return {
        event: this.mapEvent(existing.rows[0]),
        duplicate: true,
        statusChanged: false,
      };
    }

    const currentRank = SHIPMENT_STATUS_RANK[shipment.status];
    const nextRank = SHIPMENT_STATUS_RANK[input.status];
    const shouldAdvance = nextRank > currentRank;
    // delivered and rto_delivered can both occur in one lifecycle; rank handles that.
    const nextStatus = shouldAdvance ? input.status : shipment.status;
    const deliveredAt = input.status === "delivered"
      ? input.occurredAt
      : shipment.deliveredAt;
    const proofRef = input.status === "delivered"
      ? input.proofRef ?? shipment.proofRef
      : shipment.proofRef;

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const eventId = `shev_${randomUUID().replaceAll("-", "")}`;
      const inserted = await client.query<ShipmentEventRow>(
        `INSERT INTO pilot_shipment_event
           (id, shipment_id, provider, provider_event_id, event_type, status, occurred_at, payload, test_data)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
         ON CONFLICT (provider, provider_event_id) DO NOTHING
         RETURNING *`,
        [
          eventId,
          input.shipmentId,
          provider,
          input.providerEventId,
          input.eventType,
          input.status,
          input.occurredAt,
          JSON.stringify(input.payload ?? {}),
        ],
      );
      if (!inserted.rows[0]) {
        await client.query("ROLLBACK");
        const replay = await this.pool.query<ShipmentEventRow>(
          `SELECT * FROM pilot_shipment_event WHERE provider = $1 AND provider_event_id = $2`,
          [provider, input.providerEventId],
        );
        return {
          event: this.mapEvent(replay.rows[0]),
          duplicate: true,
          statusChanged: false,
        };
      }
      if (shouldAdvance || deliveredAt !== shipment.deliveredAt) {
        await client.query(
          `UPDATE pilot_shipment
              SET status = $2, delivered_at = $3, proof_ref = $4, updated_at = now()
            WHERE id = $1`,
          [input.shipmentId, nextStatus, deliveredAt, proofRef],
        );
      } else {
        await client.query(
          `UPDATE pilot_shipment SET updated_at = now() WHERE id = $1`,
          [input.shipmentId],
        );
      }
      if (input.deliveredLines?.length) {
        for (const line of input.deliveredLines) {
          await client.query(
            `UPDATE pilot_shipment_line
                SET delivered_qty = GREATEST(delivered_qty, LEAST($3, ordered_qty))
              WHERE shipment_id = $1 AND line_key = $2`,
            [input.shipmentId, line.lineKey, line.deliveredQty],
          );
        }
      }
      await client.query("COMMIT");
      return {
        event: this.mapEvent(inserted.rows[0]),
        duplicate: false,
        statusChanged: shouldAdvance,
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async get(shipmentId: string): Promise<ShipmentRecord | null> {
    await this.ready;
    const result = await this.pool.query<ShipmentRow>(
      `SELECT * FROM pilot_shipment WHERE id = $1`,
      [shipmentId],
    );
    if (!result.rows[0]) return null;
    const lines = await this.pool.query<ShipmentLineRow>(
      `SELECT * FROM pilot_shipment_line WHERE shipment_id = $1 ORDER BY line_key`,
      [shipmentId],
    );
    return mapShipment(result.rows[0], lines.rows);
  }

  async findByAllocation(allocationId: string): Promise<ShipmentRecord | null> {
    await this.ready;
    const result = await this.pool.query<ShipmentRow>(
      `SELECT * FROM pilot_shipment WHERE allocation_id = $1`,
      [allocationId],
    );
    if (!result.rows[0]) return null;
    const lines = await this.pool.query<ShipmentLineRow>(
      `SELECT * FROM pilot_shipment_line WHERE shipment_id = $1 ORDER BY line_key`,
      [result.rows[0].id],
    );
    return mapShipment(result.rows[0], lines.rows);
  }

  async listByOrderGroup(orderGroupId: string): Promise<ShipmentRecord[]> {
    await this.ready;
    const result = await this.pool.query<ShipmentRow>(
      `SELECT * FROM pilot_shipment WHERE order_group_id = $1 ORDER BY created_at, id`,
      [orderGroupId],
    );
    if (result.rows.length === 0) return [];
    const lines = await this.pool.query<ShipmentLineRow>(
      `SELECT * FROM pilot_shipment_line WHERE shipment_id = ANY($1::text[]) ORDER BY line_key`,
      [result.rows.map((row) => row.id)],
    );
    return result.rows.map((row) => mapShipment(row, lines.rows));
  }

  async list(limit = 100): Promise<ShipmentRecord[]> {
    await this.ready;
    const result = await this.pool.query<ShipmentRow>(
      `SELECT * FROM pilot_shipment ORDER BY created_at DESC LIMIT $1`,
      [Math.min(Math.max(limit, 1), 500)],
    );
    if (result.rows.length === 0) return [];
    const lines = await this.pool.query<ShipmentLineRow>(
      `SELECT * FROM pilot_shipment_line WHERE shipment_id = ANY($1::text[]) ORDER BY line_key`,
      [result.rows.map((row) => row.id)],
    );
    return result.rows.map((row) => mapShipment(row, lines.rows));
  }

  async listEvents(shipmentId: string): Promise<ShipmentEventRecord[]> {
    await this.ready;
    const result = await this.pool.query<ShipmentEventRow>(
      `SELECT * FROM pilot_shipment_event
        WHERE shipment_id = $1
        ORDER BY occurred_at ASC, received_at ASC, id ASC`,
      [shipmentId],
    );
    return result.rows.map((row) => this.mapEvent(row));
  }

  async listExceptions(limit = 100): Promise<ShipmentRecord[]> {
    await this.ready;
    const result = await this.pool.query<ShipmentRow>(
      `SELECT * FROM pilot_shipment
        WHERE status IN ('delivery_failed', 'damaged', 'lost', 'rto_in_transit')
           OR (status NOT IN ('delivered', 'rto_delivered', 'cancelled') AND updated_at < now() - interval '3 days')
        ORDER BY updated_at ASC
        LIMIT $1`,
      [Math.min(Math.max(limit, 1), 500)],
    );
    if (result.rows.length === 0) return [];
    const lines = await this.pool.query<ShipmentLineRow>(
      `SELECT * FROM pilot_shipment_line WHERE shipment_id = ANY($1::text[]) ORDER BY line_key`,
      [result.rows.map((row) => row.id)],
    );
    return result.rows.map((row) => mapShipment(row, lines.rows));
  }

  async reconcile(shipmentId: string): Promise<ShipmentReconciliation | null> {
    await this.ready;
    const shipment = await this.get(shipmentId);
    if (!shipment) return null;
    const events = await this.listEvents(shipmentId);
    let derived = shipment.status;
    let duplicates = 0;
    let outOfOrder = 0;
    let lastOccurred = 0;
    for (const event of events) {
      const occurred = Date.parse(event.occurredAt);
      if (occurred < lastOccurred) outOfOrder++;
      lastOccurred = Math.max(lastOccurred, occurred);
      if (SHIPMENT_STATUS_RANK[event.status] > SHIPMENT_STATUS_RANK[derived]) {
        derived = event.status;
      }
    }
    const uniqueProviderEvents = new Set(
      events.map((event) => `${event.provider}:${event.providerEventId}`),
    );
    duplicates = events.length - uniqueProviderEvents.size;
    const deliveredEvent = events
      .filter((event) => event.status === "delivered")
      .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))[0];
    const missingDeliveryEvidence =
      derived === "delivered" &&
      (!deliveredEvent ||
        shipment.lines.some((line) => line.deliveredQty <= 0));
    const repaired = derived !== shipment.status;
    if (repaired) {
      await this.pool.query(
        `UPDATE pilot_shipment SET status = $2, updated_at = now() WHERE id = $1`,
        [shipmentId, derived],
      );
    }
    return {
      shipmentId,
      persistedStatus: shipment.status,
      derivedStatus: derived,
      statusAdjusted: repaired,
      missingDeliveryEvidence,
      duplicateEvents: duplicates,
      outOfOrderEvents: outOfOrder,
      repaired,
    };
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  private mapEvent(row: ShipmentEventRow): ShipmentEventRecord {
    return {
      id: row.id,
      shipmentId: row.shipment_id,
      provider: row.provider,
      providerEventId: row.provider_event_id,
      eventType: row.event_type,
      status: row.status,
      occurredAt: requiredIso(row.occurred_at),
      receivedAt: requiredIso(row.received_at),
      payload: row.payload,
      testData: true,
    };
  }
}
