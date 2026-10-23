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
  | "ready_for_pickup"
  | "picked_up"
  | "in_transit"
  | "delayed"
  | "delivery_failed"
  | "out_for_delivery"
  | "delivery_attempted"
  | "buyer_action_required"
  | "partially_delivered"
  | "damaged"
  | "lost"
  | "delivered"
  | "returning_to_seller"
  | "returned_to_seller"
  | "rto_in_transit"
  | "rto_delivered"
  | "cancelled";

export const SHIPMENT_STATUS_RANK: Record<ShipmentStatus, number> = {
  booked: 10,
  ready_for_pickup: 15,
  picked_up: 20,
  in_transit: 30,
  delayed: 32,
  delivery_failed: 34,
  out_for_delivery: 40,
  delivery_attempted: 41,
  buyer_action_required: 42,
  partially_delivered: 44,
  damaged: 46,
  lost: 47,
  delivered: 50,
  returning_to_seller: 55,
  returned_to_seller: 60,
  rto_in_transit: 55,
  rto_delivered: 60,
  cancelled: 70,
};

/**
 * Explicit operator transition graph. Unlike provider-event reconciliation this
 * graph deliberately supports retry loops such as attempted -> out for delivery.
 */
export const SHIPMENT_TRANSITIONS: Record<ShipmentStatus, ShipmentStatus[]> = {
  booked: ["ready_for_pickup", "picked_up", "cancelled"],
  ready_for_pickup: ["picked_up", "delayed", "cancelled"],
  picked_up: [
    "in_transit",
    "delayed",
    "damaged",
    "lost",
    "returning_to_seller",
  ],
  in_transit: [
    "delayed",
    "out_for_delivery",
    "damaged",
    "lost",
    "returning_to_seller",
  ],
  delayed: [
    "in_transit",
    "out_for_delivery",
    "damaged",
    "lost",
    "returning_to_seller",
    "cancelled",
  ],
  out_for_delivery: [
    "delivery_attempted",
    "delivery_failed",
    "buyer_action_required",
    "partially_delivered",
    "delivered",
    "damaged",
    "lost",
    "returning_to_seller",
  ],
  delivery_attempted: [
    "out_for_delivery",
    "delivery_failed",
    "buyer_action_required",
    "partially_delivered",
    "delivered",
    "returning_to_seller",
  ],
  delivery_failed: [
    "out_for_delivery",
    "buyer_action_required",
    "returning_to_seller",
  ],
  buyer_action_required: ["out_for_delivery", "returning_to_seller", "cancelled"],
  partially_delivered: [
    "partially_delivered",
    "out_for_delivery",
    "delivery_attempted",
    "buyer_action_required",
    "delivered",
    "returning_to_seller",
  ],
  damaged: ["returning_to_seller", "cancelled"],
  lost: [],
  delivered: [],
  returning_to_seller: ["returned_to_seller"],
  returned_to_seller: [],
  // Legacy RTO states remain readable and can finish through either legacy or
  // canonical labels while existing staging fixtures are retained.
  rto_in_transit: ["rto_delivered", "returned_to_seller"],
  rto_delivered: [],
  cancelled: [],
};

/**
 * Seller portals may advance their own allocation, but cancellation and other
 * consequential closure decisions stay with an Admin operator.
 */
export const SELLER_SHIPMENT_TRANSITIONS = new Set<ShipmentStatus>(
  Object.values(SHIPMENT_TRANSITIONS)
    .flat()
    .filter((status) => status !== "cancelled"),
);

export function allowedShipmentTransitions(status: ShipmentStatus): ShipmentStatus[] {
  return [...SHIPMENT_TRANSITIONS[status]];
}

export function sellerAllowedShipmentTransitions(
  status: ShipmentStatus,
): ShipmentStatus[] {
  return SHIPMENT_TRANSITIONS[status].filter((next) =>
    SELLER_SHIPMENT_TRANSITIONS.has(next),
  );
}

export interface DeliveryLineQuantity {
  lineKey: string;
  orderedQty: number;
  deliveredQty: number;
}

export interface SubmittedDeliveryLine {
  lineKey: string;
  deliveredQty: number;
}

/**
 * Validates the per-line delivery evidence used by the manual shipment path.
 * `delivered` must be complete; `partially_delivered` must leave an outstanding unit.
 */
export function validateDeliveryQuantities(input: {
  lines: DeliveryLineQuantity[];
  deliveredLines: SubmittedDeliveryLine[];
  target: "partially_delivered" | "delivered";
}): SubmittedDeliveryLine[] {
  if (input.deliveredLines.length === 0) {
    throw Object.assign(
      new Error("Delivery requires per-line delivered quantities."),
      { code: "delivery-evidence-required" },
    );
  }
  const submitted = new Map<string, number>();
  for (const line of input.deliveredLines) {
    if (submitted.has(line.lineKey)) {
      throw Object.assign(new Error(`Duplicate delivery line ${line.lineKey}.`), {
        code: "invalid-delivered-lines",
      });
    }
    submitted.set(line.lineKey, line.deliveredQty);
  }
  for (const line of input.lines) {
    const quantity = submitted.get(line.lineKey);
    if (
      quantity === undefined ||
      !Number.isInteger(quantity) ||
      quantity < line.deliveredQty ||
      quantity > line.orderedQty
    ) {
      throw Object.assign(
        new Error(
          `Delivered quantity for ${line.lineKey} must be an integer between ${line.deliveredQty} and ${line.orderedQty}.`,
        ),
        { code: "invalid-delivered-lines" },
      );
    }
  }
  if (
    submitted.size !== input.lines.length ||
    [...submitted.keys()].some(
      (lineKey) => !input.lines.some((line) => line.lineKey === lineKey),
    )
  ) {
    throw Object.assign(
      new Error("Delivery evidence must include each shipment line exactly once."),
      { code: "invalid-delivered-lines" },
    );
  }
  const quantities = input.lines.map((line) => submitted.get(line.lineKey)!);
  const complete = quantities.every(
    (quantity, index) => quantity === input.lines[index].orderedQty,
  );
  const anyDelivered = quantities.some((quantity) => quantity > 0);
  if (input.target === "delivered" && !complete) {
    throw Object.assign(
      new Error(
        "Delivered requires every line in full. Use Partially delivered for incomplete quantities.",
      ),
      { code: "partial-delivery-status-required" },
    );
  }
  if (input.target === "partially_delivered" && (!anyDelivered || complete)) {
    throw Object.assign(
      new Error(
        "Partially delivered requires at least one delivered unit and at least one outstanding unit.",
      ),
      { code: "invalid-partial-delivery" },
    );
  }
  return input.deliveredLines;
}

/**
 * Provider/webhook events cannot assert `delivered` without proof and positive
 * per-line quantities. The caller still normalises an incomplete submission to
 * `partially_delivered`.
 */
export function assertDeliveredEvidence(
  proofRef: string | null | undefined,
  deliveredLines: SubmittedDeliveryLine[] | undefined,
): void {
  if (!proofRef?.trim() || !deliveredLines?.length) {
    throw Object.assign(
      new Error(
        "Delivered status requires a proof reference and positive per-line delivered quantities.",
      ),
      { code: "delivery-evidence-required" },
    );
  }
  const seen = new Set<string>();
  for (const line of deliveredLines) {
    if (
      !line.lineKey ||
      seen.has(line.lineKey) ||
      !Number.isInteger(line.deliveredQty) ||
      line.deliveredQty <= 0
    ) {
      throw Object.assign(
        new Error(
          "Delivered status requires each line once with a positive integer quantity.",
        ),
        { code: "invalid-delivered-lines" },
      );
    }
    seen.add(line.lineKey);
  }
}

export const SHIPMENT_STATUSES = Object.keys(SHIPMENT_STATUS_RANK) as ShipmentStatus[];
export const TERMINAL_SHIPMENT_STATUSES = new Set<ShipmentStatus>([
  "delivered",
  "returned_to_seller",
  "rto_delivered",
  "cancelled",
  "lost",
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
  version: number;
  allowedTransitions: ShipmentStatus[];
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
  version: number;
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
    version: Number(row.version),
    allowedTransitions: allowedShipmentTransitions(row.status),
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
        version              integer NOT NULL DEFAULT 1 CHECK (version > 0),
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
      CREATE UNIQUE INDEX IF NOT EXISTS pilot_shipment_order_seller_uidx
        ON pilot_shipment (order_group_id, seller_id);
      CREATE INDEX IF NOT EXISTS pilot_shipment_status_updated_idx
        ON pilot_shipment (status, updated_at);

      ALTER TABLE pilot_shipment
        ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

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
    const existingForSeller = await this.findByOrderGroupSeller(
      input.orderGroupId,
      input.sellerId,
    );
    if (existingForSeller) return { shipment: existingForSeller, created: false };

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
      // A concurrent booking may have won the allocation or order-group/seller race.
      const current = await this.findByAllocation(input.allocationId).catch(() => null);
      if (current) return { shipment: current, created: false };
      const currentForSeller = await this.findByOrderGroupSeller(
        input.orderGroupId,
        input.sellerId,
      ).catch(() => null);
      if (currentForSeller) return { shipment: currentForSeller, created: false };
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

    if (input.status === "delivered") {
      assertDeliveredEvidence(input.proofRef, input.deliveredLines);
    }

    let eventStatus = input.status;
    if (
      input.status === "delivered" &&
      input.deliveredLines?.some(
        (line) => !shipment.lines.some((item) => item.lineKey === line.lineKey),
      )
    ) {
      throw Object.assign(
        new Error("Delivered lines must match the shipment lines."),
        { code: "invalid-delivered-lines" },
      );
    }

    if (input.status === "delivered" && input.deliveredLines?.length) {
      const deliveredByLine = new Map(
        input.deliveredLines.map((line) => [line.lineKey, line.deliveredQty]),
      );
      const isComplete = shipment.lines.every(
        (line) =>
          Math.max(line.deliveredQty, deliveredByLine.get(line.lineKey) ?? 0) >=
          line.orderedQty,
      );
      const hasDelivery = shipment.lines.some(
        (line) =>
          Math.max(line.deliveredQty, deliveredByLine.get(line.lineKey) ?? 0) > 0,
      );
      if (hasDelivery && !isComplete) eventStatus = "partially_delivered";
    }

    const currentRank = SHIPMENT_STATUS_RANK[shipment.status];
    const nextRank = SHIPMENT_STATUS_RANK[eventStatus];
    const shouldAdvance = nextRank > currentRank;
    // delivered and rto_delivered can both occur in one lifecycle; rank handles that.
    const nextStatus = shouldAdvance ? eventStatus : shipment.status;
    const deliveredAt = eventStatus === "delivered"
      ? input.occurredAt
      : shipment.deliveredAt;
    const proofRef = ["delivered", "partially_delivered"].includes(eventStatus)
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
          eventStatus,
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
              SET status = $2, delivered_at = $3, proof_ref = $4,
                  version = version + 1, updated_at = now()
            WHERE id = $1`,
          [input.shipmentId, nextStatus, deliveredAt, proofRef],
        );
      } else {
        await client.query(
          `UPDATE pilot_shipment
              SET version = version + 1, updated_at = now()
            WHERE id = $1`,
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

  async transitionManual(input: {
    shipmentId: string;
    expectedVersion: number;
    status: ShipmentStatus;
    occurredAt: string;
    actorId: string;
    actorRole: string;
    source: "admin_console" | "seller_portal";
    idempotencyKey: string;
    reason?: string | null;
    note?: string | null;
    attemptNumber?: number | null;
    attemptReason?: string | null;
    nextAction?: string | null;
    revisedDeliveryAt?: string | null;
    notifyCustomer?: boolean;
    deliveredLines?: Array<{ lineKey: string; deliveredQty: number }>;
    proofRef?: string | null;
  }): Promise<{
    shipment: ShipmentRecord;
    event: ShipmentEventRecord;
    duplicate: boolean;
    statusChanged: boolean;
  }> {
    await this.ready;
    const provider = "manual";
    const providerEventId = `manual:${input.shipmentId}:${input.idempotencyKey}`;
    const replay = await this.pool.query<ShipmentEventRow>(
      `SELECT * FROM pilot_shipment_event
        WHERE provider = $1 AND provider_event_id = $2`,
      [provider, providerEventId],
    );
    if (replay.rows[0]) {
      const current = await this.get(input.shipmentId);
      if (!current) {
        throw Object.assign(new Error("Shipment not found."), {
          code: "shipment-not-found",
        });
      }
      return {
        shipment: current,
        event: this.mapEvent(replay.rows[0]),
        duplicate: true,
        statusChanged: false,
      };
    }

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const locked = await client.query<ShipmentRow>(
        `SELECT * FROM pilot_shipment WHERE id = $1 FOR UPDATE`,
        [input.shipmentId],
      );
      const row = locked.rows[0];
      if (!row) {
        throw Object.assign(new Error("Shipment not found."), {
          code: "shipment-not-found",
        });
      }
      if (Number(row.version) !== input.expectedVersion) {
        throw Object.assign(
          new Error(
            `Shipment changed from version ${input.expectedVersion} to ${row.version}. Refresh before retrying.`,
          ),
          { code: "shipment-version-conflict", currentVersion: Number(row.version) },
        );
      }
      if (!SHIPMENT_TRANSITIONS[row.status].includes(input.status)) {
        throw Object.assign(
          new Error(`Cannot move a shipment from ${row.status} to ${input.status}.`),
          { code: "invalid-shipment-transition" },
        );
      }

      const lineRows = await client.query<ShipmentLineRow>(
        `SELECT * FROM pilot_shipment_line
          WHERE shipment_id = $1
          ORDER BY line_key
          FOR UPDATE`,
        [input.shipmentId],
      );
      const deliveryStatus = ["partially_delivered", "delivered"].includes(
        input.status,
      );
      if (deliveryStatus) {
        if (!input.proofRef?.trim()) {
          throw Object.assign(
            new Error(
              "Partial and complete delivery updates require a proof reference.",
            ),
            { code: "delivery-evidence-required" },
          );
        }
        validateDeliveryQuantities({
          lines: lineRows.rows.map((line) => ({
            lineKey: line.line_key,
            orderedQty: line.ordered_qty,
            deliveredQty: line.delivered_qty,
          })),
          deliveredLines: input.deliveredLines ?? [],
          target: input.status as "partially_delivered" | "delivered",
        });
      }

      const eventId = `shev_${randomUUID().replaceAll("-", "")}`;
      const inserted = await client.query<ShipmentEventRow>(
        `INSERT INTO pilot_shipment_event
           (id, shipment_id, provider, provider_event_id, event_type, status,
            occurred_at, payload, test_data)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
         RETURNING *`,
        [
          eventId,
          input.shipmentId,
          provider,
          providerEventId,
          `${input.source}.shipment.${input.status}`,
          input.status,
          input.occurredAt,
          JSON.stringify({
            source: input.source,
            actor_id: input.actorId,
            actor_role: input.actorRole,
            previous_status: row.status,
            reason: input.reason ?? null,
            note: input.note ?? null,
            attempt_number: input.attemptNumber ?? null,
            attempt_reason: input.attemptReason ?? null,
            next_action: input.nextAction ?? null,
            revised_delivery_at: input.revisedDeliveryAt ?? null,
            notify_customer: input.notifyCustomer ?? false,
            expected_version: input.expectedVersion,
            resulting_version: input.expectedVersion + 1,
          }),
        ],
      );
      if (deliveryStatus) {
        for (const line of input.deliveredLines ?? []) {
          await client.query(
            `UPDATE pilot_shipment_line
                SET delivered_qty = $3
              WHERE shipment_id = $1 AND line_key = $2`,
            [input.shipmentId, line.lineKey, line.deliveredQty],
          );
        }
      }
      await client.query(
        `UPDATE pilot_shipment
            SET status = $2,
                delivered_at = CASE WHEN $2 = 'delivered' THEN $3 ELSE delivered_at END,
                proof_ref = CASE
                  WHEN $2 IN ('partially_delivered', 'delivered') THEN $4
                  ELSE proof_ref
                END,
                version = version + 1,
                updated_at = now()
          WHERE id = $1`,
        [
          input.shipmentId,
          input.status,
          input.occurredAt,
          input.proofRef?.trim() ?? null,
        ],
      );
      await client.query("COMMIT");
      const shipment = await this.get(input.shipmentId);
      if (!shipment) throw new Error("Shipment disappeared after transition.");
      return {
        shipment,
        event: this.mapEvent(inserted.rows[0]),
        duplicate: false,
        statusChanged: true,
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

  async findByOrderGroupSeller(
    orderGroupId: string,
    sellerId: string,
  ): Promise<ShipmentRecord | null> {
    await this.ready;
    const result = await this.pool.query<ShipmentRow>(
      `SELECT * FROM pilot_shipment WHERE order_group_id = $1 AND seller_id = $2 LIMIT 1`,
      [orderGroupId, sellerId],
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
        WHERE status IN (
          'delayed', 'delivery_attempted', 'delivery_failed',
          'buyer_action_required', 'damaged', 'lost',
          'returning_to_seller', 'rto_in_transit'
        )
           OR (status NOT IN (
             'delivered', 'returned_to_seller', 'rto_delivered', 'cancelled', 'lost'
           ) AND updated_at < now() - interval '3 days')
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
