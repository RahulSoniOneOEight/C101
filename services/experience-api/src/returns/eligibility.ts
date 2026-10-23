import type { ShipmentRecord } from "../logistics/shipment-store.js";

/**
 * Return policy Phase 1. This is a staging default; the business decision remains open and must be
 * approved before production. Eligibility is computed, never stored, and the inputs are frozen onto
 * each return case at request time.
 */
export const RETURN_POLICY = {
  version: "return-policy-2026-10-20",
  windowDays: 7,
  reasons: ["damaged", "wrong_item", "not_as_described"],
  resolutions: ["refund", "replacement"],
  requiresDelivery: true,
} as const;

export interface OrderLineSnapshot {
  line_key: string;
  sku: string;
  title: string;
  quantity: number;
  unit_price: number;
  product_id: string | null;
  variant_id: string | null;
  seller_id: string | null;
}

export interface LineEligibility {
  line_key: string;
  sku: string;
  title: string;
  ordered_qty: number;
  delivered_qty: number;
  requested_qty: number;
  returnable_qty: number;
  deadline: string | null;
  allowed_reasons: string[];
  eligible: boolean;
  ineligible_reason: string | null;
}

export function orderLineSnapshots(ref: {
  medusa_order_group?: Record<string, unknown> | null;
}): OrderLineSnapshot[] {
  const raw = ref.medusa_order_group?.lines;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((line): line is Record<string, unknown> => Boolean(line && typeof line === "object"))
    .map((line) => ({
      line_key: String(line.line_key ?? line.id ?? ""),
      sku: String(line.sku ?? line.variant_id ?? line.line_key ?? ""),
      title: String(line.title ?? line.product_title ?? "Ordered item"),
      quantity: Number(line.quantity ?? 0),
      unit_price: Number(line.unit_price ?? 0),
      product_id: line.product_id ? String(line.product_id) : null,
      variant_id: line.variant_id ? String(line.variant_id) : null,
      seller_id: line.seller_id ? String(line.seller_id) : null,
    }))
    .filter((line) => line.line_key && line.quantity > 0);
}

export function computeReturnEligibility(input: {
  orderLines: OrderLineSnapshot[];
  shipments: ShipmentRecord[];
  alreadyRequested: Record<string, number>;
  now?: number;
}): LineEligibility[] {
  const delivered = new Map<string, { qty: number; deliveredAt: string | null }>();
  for (const shipment of input.shipments) {
    for (const line of shipment.lines) {
      const current = delivered.get(line.lineKey) ?? { qty: 0, deliveredAt: null };
      current.qty += line.deliveredQty;
      if (shipment.deliveredAt) {
        current.deliveredAt =
          !current.deliveredAt || shipment.deliveredAt > current.deliveredAt
            ? shipment.deliveredAt
            : current.deliveredAt;
      }
      delivered.set(line.lineKey, current);
    }
  }
  const now = input.now ?? Date.now();
  return input.orderLines.map((line) => {
    const delivery = delivered.get(line.line_key);
    const deliveredQty = delivery?.qty ?? 0;
    const already = input.alreadyRequested[line.line_key] ?? 0;
    const deadline = delivery?.deliveredAt
      ? new Date(
          Date.parse(delivery.deliveredAt) + RETURN_POLICY.windowDays * 86400000,
        ).toISOString()
      : null;
    const withinWindow = deadline ? now <= Date.parse(deadline) : false;
    const returnableQty = Math.max(deliveredQty - already, 0);
    let eligible = true;
    let reason: string | null = null;
    if (deliveredQty <= 0) {
      eligible = false;
      reason = "not_delivered";
    } else if (!withinWindow) {
      eligible = false;
      reason = "return_window_expired";
    } else if (returnableQty <= 0) {
      eligible = false;
      reason = "fully_returned";
    }
    return {
      line_key: line.line_key,
      sku: line.sku,
      title: line.title,
      ordered_qty: line.quantity,
      delivered_qty: deliveredQty,
      requested_qty: already,
      returnable_qty: returnableQty,
      deadline,
      allowed_reasons: eligible ? [...RETURN_POLICY.reasons] : [],
      eligible,
      ineligible_reason: reason,
    };
  });
}
