export const PILOT_NOTIFICATION_TEMPLATES = [
  "product_launch_v1",
  "price_drop_v1",
  "order_confirmed_v1",
  "delivery_update_v1",
  "delivery_delivered_v1",
  "delivery_exception_v1",
  "return_requested_v1",
  "return_decision_v1",
  "return_inspection_v1",
  "return_refund_simulation_v1",
] as const;

export type PilotNotificationTemplate = typeof PILOT_NOTIFICATION_TEMPLATES[number];

export interface RenderedNotification {
  templateKey: PilotNotificationTemplate;
  audience: "all-pilot-users" | "order-owner";
  /** Heading — kept to 3-4 words for a push title. */
  title: string;
  /** Description — kept to roughly 10-12 words for a push body. */
  body: string;
  deepLink: string;
  /** Staging placeholder artwork (Pexels). Not production content. */
  imageUrl: string;
}

// Staging-only placeholder artwork. Replace with licensed production assets before release.
const IMAGE = {
  launch: "https://images.pexels.com/photos/1249611/pexels-photo-1249611.jpeg?auto=compress&cs=tinysrgb&w=600",
  price: "https://images.pexels.com/photos/2760241/pexels-photo-2760241.jpeg?auto=compress&cs=tinysrgb&w=600",
  order: "https://images.pexels.com/photos/4391470/pexels-photo-4391470.jpeg?auto=compress&cs=tinysrgb&w=600",
  delivery: "https://images.pexels.com/photos/4483610/pexels-photo-4483610.jpeg?auto=compress&cs=tinysrgb&w=600",
} as const;

function text(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export function renderPilotNotification(event: Record<string, unknown>): RenderedNotification | null {
  const eventType = String(event.event_type ?? "");
  const payload = event.payload && typeof event.payload === "object"
    ? event.payload as Record<string, unknown>
    : {};
  const aggregateId = text(event.aggregate_id, "pilot");

  switch (eventType) {
    case "catalog.product_launched": {
      const productId = text(payload.product_id, aggregateId);
      return {
        templateKey: "product_launch_v1",
        audience: "all-pilot-users",
        title: "New Arrival Live",
        body: "A new product landed in BuildKart. Tap to explore it now.",
        deepLink: `/product/${encodeURIComponent(productId)}`,
        imageUrl: IMAGE.launch,
      };
    }
    case "seller_offer.price_dropped": {
      const productId = text(payload.product_id, aggregateId);
      return {
        templateKey: "price_drop_v1",
        audience: "all-pilot-users",
        title: "Price Just Dropped",
        body: "The test price on this product just went lower. Check it out.",
        deepLink: `/product/${encodeURIComponent(productId)}`,
        imageUrl: IMAGE.price,
      };
    }
    case "order.confirmed": {
      const checkoutRef = text(payload.cart_id, aggregateId);
      return {
        templateKey: "order_confirmed_v1",
        audience: "order-owner",
        title: "Your Order Confirmed",
        body: "Your BuildKart test order is confirmed. We will keep you posted.",
        deepLink: `/orders/${encodeURIComponent(checkoutRef)}`,
        imageUrl: IMAGE.order,
      };
    }
    case "shipment.status_changed": {
      const status = text(payload.status, "");
      const delivered = status === "delivered";
      const exception = ["delivery_failed", "damaged", "lost"].includes(status);
      return {
        templateKey: delivered
          ? "delivery_delivered_v1"
          : exception
            ? "delivery_exception_v1"
            : "delivery_update_v1",
        audience: "order-owner",
        title: delivered
          ? "Delivered Successfully"
          : exception
            ? "Delivery Needs Attention"
            : "Delivery Status Update",
        body: delivered
          ? "Your simulated delivery is complete. Open BuildKart to review the order."
          : exception
            ? "A simulated delivery exception was recorded. Open BuildKart for details."
            : "Your simulated shipment status changed. Open BuildKart to see details.",
        deepLink: `/track?order=${encodeURIComponent(aggregateId)}`,
        imageUrl: IMAGE.delivery,
      };
    }
    case "return.requested": {
      return {
        templateKey: "return_requested_v1",
        audience: "order-owner",
        title: "Return Requested",
        body: "Your return request was recorded. A support operator will review it.",
        deepLink: `/returns/${encodeURIComponent(String(payload.return_id ?? aggregateId))}`,
        imageUrl: IMAGE.order,
      };
    }
    case "return.decision": {
      const status = text(payload.status, "decision");
      return {
        templateKey: "return_decision_v1",
        audience: "order-owner",
        title: status === "approved" ? "Return Approved" : "Return Update",
        body: status === "approved"
          ? "Your return was approved. No refund or stock movement is executed in this phase."
          : "Your return decision was recorded. Open BuildKart for the outcome.",
        deepLink: `/returns/${encodeURIComponent(String(payload.return_id ?? aggregateId))}`,
        imageUrl: IMAGE.order,
      };
    }
    case "return.inspection_completed": {
      return {
        templateKey: "return_inspection_v1",
        audience: "order-owner",
        title: "Return Inspected",
        body: "Inspection evidence is recorded. No stock moved; the marketplace can record a simulated refund.",
        deepLink: `/returns/${encodeURIComponent(String(payload.return_id ?? aggregateId))}`,
        imageUrl: IMAGE.order,
      };
    }
    case "return.refund_simulation_recorded": {
      return {
        templateKey: "return_refund_simulation_v1",
        audience: "order-owner",
        title: "Simulated Refund Recorded",
        body: "Your refund simulation is recorded. No real money or stock moved.",
        deepLink: `/returns/${encodeURIComponent(String(payload.return_id ?? aggregateId))}`,
        imageUrl: IMAGE.order,
      };
    }
    default:
      return null;
  }
}
