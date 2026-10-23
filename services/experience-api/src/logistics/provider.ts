import { randomUUID } from "node:crypto";
import { ShipmentStore, type ShipmentEventRecord, type ShipmentRecord } from "./shipment-store.js";

/**
 * Logistics provider boundary. The staging implementation is simulated; a production provider
 * must implement the same boundary without changing the order or return contracts.
 */
export interface LogisticsProvider {
  readonly name: string;
  book(input: {
    orderGroupId: string;
    allocationId: string;
    sellerId: string;
    lines: Array<{ lineKey: string; sku: string; orderedQty: number }>;
    destinationPostcode?: string | null;
  }): Promise<{ shipment: ShipmentRecord; created: boolean }>;
  appendEvent(input: {
    shipmentId: string;
    providerEventId: string;
    eventType: string;
    status: import("./shipment-store.js").ShipmentStatus;
    occurredAt: string;
    payload?: Record<string, unknown>;
    deliveredLines?: Array<{ lineKey: string; deliveredQty: number }>;
    proofRef?: string | null;
  }): Promise<{ event: ShipmentEventRecord; duplicate: boolean; statusChanged: boolean }>;
  get(shipmentId: string): Promise<ShipmentRecord | null>;
  listByOrderGroup(orderGroupId: string): Promise<ShipmentRecord[]>;
  listEvents(shipmentId: string): Promise<ShipmentEventRecord[]>;
  list(limit?: number): Promise<ShipmentRecord[]>;
  listExceptions(limit?: number): Promise<ShipmentRecord[]>;
  reconcile(shipmentId: string): Promise<import("./shipment-store.js").ShipmentReconciliation | null>;
}

export class SimulatedLogisticsProvider implements LogisticsProvider {
  readonly name = "simulated";

  constructor(private readonly store: ShipmentStore) {}

  book(input: {
    orderGroupId: string;
    allocationId: string;
    sellerId: string;
    lines: Array<{ lineKey: string; sku: string; orderedQty: number }>;
    destinationPostcode?: string | null;
  }): Promise<{ shipment: ShipmentRecord; created: boolean }> {
    return this.store.book({ ...input, provider: this.name });
  }

  appendEvent(input: {
    shipmentId: string;
    providerEventId: string;
    eventType: string;
    status: import("./shipment-store.js").ShipmentStatus;
    occurredAt: string;
    payload?: Record<string, unknown>;
    deliveredLines?: Array<{ lineKey: string; deliveredQty: number }>;
    proofRef?: string | null;
  }): Promise<{ event: ShipmentEventRecord; duplicate: boolean; statusChanged: boolean }> {
    return this.store.appendEvent({ ...input, provider: this.name });
  }

  get(shipmentId: string): Promise<ShipmentRecord | null> {
    return this.store.get(shipmentId);
  }

  listByOrderGroup(orderGroupId: string): Promise<ShipmentRecord[]> {
    return this.store.listByOrderGroup(orderGroupId);
  }

  listEvents(shipmentId: string): Promise<ShipmentEventRecord[]> {
    return this.store.listEvents(shipmentId);
  }

  list(limit = 100): Promise<ShipmentRecord[]> {
    return this.store.list(limit);
  }

  listExceptions(limit = 100): Promise<ShipmentRecord[]> {
    return this.store.listExceptions(limit);
  }

  reconcile(shipmentId: string): Promise<import("./shipment-store.js").ShipmentReconciliation | null> {
    return this.store.reconcile(shipmentId);
  }

  /**
   * Generate a deterministic staging scenario. `duplicate` replays the previous provider event;
   * `out_of_order` uses an occurred_at before the current latest event.
   */
  async simulate(input: {
    shipmentId: string;
    scenario:
      | "failed_attempt"
      | "delay"
      | "damaged"
      | "lost"
      | "rto"
      | "duplicate"
      | "out_of_order";
    proofRef?: string | null;
    deliveredLines?: Array<{ lineKey: string; deliveredQty: number }>;
  }): Promise<{ event: ShipmentEventRecord; duplicate: boolean; statusChanged: boolean }> {
    const shipment = await this.get(input.shipmentId);
    if (!shipment) throw new Error("Shipment not found.");
    const history = await this.listEvents(input.shipmentId);
    const now = new Date();
    if (input.scenario === "duplicate") {
      const previous = history[history.length - 1];
      if (!previous) throw new Error("No event to duplicate.");
      return this.appendEvent({
        shipmentId: input.shipmentId,
        providerEventId: previous.providerEventId,
        eventType: previous.eventType,
        status: previous.status,
        occurredAt: previous.occurredAt,
        payload: { ...previous.payload, simulated_duplicate: true },
      });
    }
    const statusByScenario = {
      failed_attempt: "delivery_failed",
      delay: "in_transit",
      damaged: "damaged",
      lost: "lost",
      rto: "rto_in_transit",
      out_of_order: "in_transit",
    } as const;
    const status = statusByScenario[input.scenario];
    const occurredAt = input.scenario === "out_of_order"
      ? new Date(now.getTime() - 60 * 60 * 1000).toISOString()
      : now.toISOString();
    return this.appendEvent({
      shipmentId: input.shipmentId,
      providerEventId: `sim:${input.scenario}:${randomUUID().slice(0, 10)}`,
      eventType: `shipment.${input.scenario}`,
      status,
      occurredAt,
      payload: { simulated: true, scenario: input.scenario },
      deliveredLines: input.deliveredLines,
      proofRef: input.proofRef,
    });
  }

  /** Record explicit delivery evidence, including per-line delivered quantities. */
  async deliver(input: {
    shipmentId: string;
    proofRef: string;
    deliveredAt?: string;
    deliveredLines: Array<{ lineKey: string; deliveredQty: number }>;
  }): Promise<{ event: ShipmentEventRecord; duplicate: boolean; statusChanged: boolean }> {
    return this.appendEvent({
      shipmentId: input.shipmentId,
      providerEventId: `delivery:${input.shipmentId}`,
      eventType: "shipment.delivered",
      status: "delivered",
      occurredAt: input.deliveredAt ?? new Date().toISOString(),
      payload: { proof_ref: input.proofRef, delivered_lines: input.deliveredLines },
      deliveredLines: input.deliveredLines,
      proofRef: input.proofRef,
    });
  }
}
