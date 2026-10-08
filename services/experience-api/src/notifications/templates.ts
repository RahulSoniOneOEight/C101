export const PILOT_NOTIFICATION_TEMPLATES = [
  "product_launch_v1",
  "price_drop_v1",
  "order_confirmed_v1",
  "delivery_update_v1",
] as const;

export type PilotNotificationTemplate = typeof PILOT_NOTIFICATION_TEMPLATES[number];

export interface RenderedNotification {
  templateKey: PilotNotificationTemplate;
  audience: "all-pilot-users" | "order-owner";
  title: string;
  body: string;
  deepLink: string;
}

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
      const productTitle = text(payload.product_title, "A new product");
      const productId = text(payload.product_id, aggregateId);
      return {
        templateKey: "product_launch_v1",
        audience: "all-pilot-users",
        title: "New on BuildKart",
        body: `${productTitle} is now available in the staging pilot.`,
        deepLink: `/product/${encodeURIComponent(productId)}`,
      };
    }
    case "seller_offer.price_dropped": {
      const productTitle = text(payload.product_title, "A saved product");
      const productId = text(payload.product_id, aggregateId);
      return {
        templateKey: "price_drop_v1",
        audience: "all-pilot-users",
        title: "Pilot price update",
        body: `${productTitle} has a lower test price in the staging pilot.`,
        deepLink: `/product/${encodeURIComponent(productId)}`,
      };
    }
    case "order.confirmed": {
      const checkoutRef = text(payload.cart_id, aggregateId);
      return {
        templateKey: "order_confirmed_v1",
        audience: "order-owner",
        title: "Order confirmed",
        body: "Your test order has been confirmed in the BuildKart staging pilot.",
        deepLink: `/orders/${encodeURIComponent(checkoutRef)}`,
      };
    }
    case "shipment.status_changed": {
      const status = text(payload.status, "updated").replaceAll("_", " ");
      return {
        templateKey: "delivery_update_v1",
        audience: "order-owner",
        title: "Delivery update",
        body: `Your simulated delivery status is now ${status}.`,
        deepLink: `/track?order=${encodeURIComponent(aggregateId)}`,
      };
    }
    default:
      return null;
  }
}
