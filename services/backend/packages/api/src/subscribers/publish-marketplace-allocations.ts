import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import {
  buildMarketplaceAllocationEvents,
  type MarketplaceAllocationSource,
} from "../integrations/marketplace-allocation-event";
import { MarketplaceAllocationPublisher } from "../integrations/marketplace-allocation-publisher";

type Logger = {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
};

type Query = {
  graph(input: {
    entity: string;
    fields: string[];
    filters: Record<string, unknown>;
  }): Promise<{ data: Array<Record<string, any>> }>;
};

let publisher: MarketplaceAllocationPublisher | null = null;

function runtimePublisher(): MarketplaceAllocationPublisher {
  const environment = process.env.BUILDKART_ENVIRONMENT?.trim().toLowerCase();
  if (environment !== "staging") {
    throw new Error(
      `Marketplace allocation publishing is staging-only; refusing environment ${environment || "unset"}.`,
    );
  }
  const url = process.env.NATS_URL?.trim();
  if (!url)
    throw new Error("NATS_URL is required for Mercur allocation publishing.");
  publisher ??= new MarketplaceAllocationPublisher(url, {
    user: process.env.NATS_USER?.trim() || undefined,
    password: process.env.NATS_PASSWORD,
  });
  return publisher;
}

async function loadSource(
  query: Query,
  orderGroupId: string,
): Promise<MarketplaceAllocationSource> {
  const { data: groups } = await query.graph({
    entity: "order_group",
    fields: ["id", "cart_id"],
    filters: { id: orderGroupId },
  });
  const group = groups[0];
  if (!group?.cart_id) {
    throw new Error(`Order group ${orderGroupId} has no cart link.`);
  }

  const { data: groupOrderLinks } = await query.graph({
    entity: "order_group_order",
    fields: ["order_group_id", "order_id"],
    filters: { order_group_id: orderGroupId },
  });
  const orderIds = groupOrderLinks
    .map((link) => String(link.order_id ?? ""))
    .filter(Boolean);
  if (orderIds.length === 0) {
    throw new Error(`Order group ${orderGroupId} has no seller-order links.`);
  }

  const [{ data: sellerLinks }, { data: orders }, { data: carts }] =
    await Promise.all([
      query.graph({
        entity: "order_seller",
        fields: ["order_id", "seller_id"],
        filters: { order_id: orderIds },
      }),
      query.graph({
        entity: "order",
        fields: [
          "id",
          "created_at",
          "items.id",
          "items.quantity",
          "items.variant_id",
          "items.variant_sku",
        ],
        filters: { id: orderIds },
      }),
      query.graph({
        entity: "cart",
        fields: [
          "id",
          "shipping_address.postal_code",
          "items.id",
          "items.quantity",
          "items.variant_id",
          "items.variant.id",
          "items.variant.sku",
          "items.offer.id",
          "items.offer.seller_id",
        ],
        filters: { id: String(group.cart_id) },
      }),
    ]);
  const cart = carts[0];
  if (!cart)
    throw new Error(`Cart ${group.cart_id} was not found for ${orderGroupId}.`);
  const sellerByOrder = new Map(
    sellerLinks.map((link) => [String(link.order_id), String(link.seller_id)]),
  );
  if (
    sellerByOrder.size !== orderIds.length ||
    orders.length !== orderIds.length
  ) {
    throw new Error(
      `Order group ${orderGroupId} has incomplete seller-order links.`,
    );
  }

  return {
    orderGroupId,
    cartId: String(group.cart_id),
    destinationPostcode: cart.shipping_address?.postal_code
      ? String(cart.shipping_address.postal_code)
      : null,
    cartLines: Array.isArray(cart.items) ? cart.items : [],
    sellerOrders: orders.map((order) => ({
      id: String(order.id),
      sellerId: sellerByOrder.get(String(order.id)) ?? "",
      createdAt: order.created_at,
      lines: Array.isArray(order.items) ? order.items : [],
    })),
    environment: "staging",
  };
}

async function loadSourceWithRetry(
  query: Query,
  logger: Logger,
  orderGroupId: string,
): Promise<MarketplaceAllocationSource> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      return await loadSource(query, orderGroupId);
    } catch (error) {
      lastError = error;
      if (attempt === 5) break;
      logger.warn(
        `[marketplace-allocation] ${orderGroupId} projection not ready (attempt ${attempt}/5): ${(error as Error).message}`,
      );
      await new Promise((resolve) => setTimeout(resolve, attempt * 250));
    }
  }
  throw lastError;
}

/**
 * Mercur emits a thin order_group.created event after checkout has split and linked seller orders.
 * This subscriber reads the completed projection and publishes one canonical allocation per seller
 * order to the cross-system JetStream. Deterministic event/allocation IDs make redelivery harmless.
 */
export default async function publishMarketplaceAllocations({
  event,
  container,
}: SubscriberArgs<{ id: string }>): Promise<void> {
  const logger = container.resolve("logger") as Logger;
  const orderGroupId = event.data.id;
  try {
    const query = container.resolve(ContainerRegistrationKeys.QUERY) as Query;
    const source = await loadSourceWithRetry(query, logger, orderGroupId);
    const events = buildMarketplaceAllocationEvents(source);
    const jetstream = runtimePublisher();
    for (const allocationEvent of events) {
      const acknowledgement = await jetstream.publish(allocationEvent);
      logger.info(
        `[marketplace-allocation] published ${allocationEvent.aggregate_id} order_group=${orderGroupId} seller=${allocationEvent.data.seller_id} stream_sequence=${acknowledgement.seq} duplicate=${acknowledgement.duplicate}`,
      );
    }
  } catch (error) {
    logger.error(
      `[marketplace-allocation] failed order_group=${orderGroupId}: ${(error as Error).message}`,
    );
    // Required cross-system handoff: rethrow so the Medusa event bus can retry rather than silently
    // losing an allocation. The deterministic event ID and shipment booking make retry idempotent.
    throw error;
  }
}

export const config: SubscriberConfig = {
  event: "order_group.created",
};
