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
      return {
        templateKey: "delivery_update_v1",
        audience: "order-owner",
        title: "Delivery Status Update",
        body: "Your simulated shipment status changed. Open BuildKart to see details.",
        deepLink: `/track?order=${encodeURIComponent(aggregateId)}`,
        imageUrl: IMAGE.delivery,
      };
    }
    default:
      return null;
  }
}
