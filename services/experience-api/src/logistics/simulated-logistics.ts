import { randomUUID } from "node:crypto";

/**
 * Simulated logistics for the pilot. No real carrier. Serviceability is faked (all valid 6-digit
 * Indian postcodes serviceable), and shipments progress through a fixed status timeline. This must be
 * replaced by a real logistics provider before production.
 */

export interface Shipment {
  id: string;
  order_group_id: string;
  tracking_number: string;
  status: "booked" | "in_transit" | "out_for_delivery" | "delivered" | "exception";
  events: { status: string; at: string }[];
  created_at: string;
}

const shipments = new Map<string, Shipment>();

const SERVICEABLE_POSTCODE = /^\d{6}$/;

export function checkServiceability(postcode: string): {
  serviceable: boolean;
  eta_days: number;
  reason: string | null;
} {
  if (!SERVICEABLE_POSTCODE.test(postcode)) {
    return { serviceable: false, eta_days: 0, reason: "invalid_postcode" };
  }
  return { serviceable: true, eta_days: 3, reason: null };
}

export function bookShipment(orderGroupId: string): Shipment {
  const now = new Date().toISOString();
  const shipment: Shipment = {
    id: `ship_${randomUUID().slice(0, 8)}`,
    order_group_id: orderGroupId,
    tracking_number: `SIM-${randomUUID().slice(0, 12).toUpperCase()}`,
    status: "booked",
    events: [{ status: "booked", at: now }],
    created_at: now,
  };
  shipments.set(shipment.id, shipment);
  return shipment;
}

export function getShipment(shipmentId: string): Shipment | null {
  return shipments.get(shipmentId) ?? null;
}

/** Advance a shipment one step for demo purposes. */
export function advanceShipment(shipmentId: string): Shipment | null {
  const shipment = shipments.get(shipmentId);
  if (!shipment) return null;
  const next: Record<string, Shipment["status"]> = {
    booked: "in_transit",
    in_transit: "out_for_delivery",
    out_for_delivery: "delivered",
    delivered: "delivered",
    exception: "exception",
  };
  shipment.status = next[shipment.status];
  shipment.events.push({ status: shipment.status, at: new Date().toISOString() });
  return shipment;
}
