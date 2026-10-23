import { createHash } from "node:crypto";

export const MARKETPLACE_ALLOCATION_EVENT_TYPE =
  "marketplace-allocation.created" as const;
export const MARKETPLACE_ALLOCATION_SUBJECT =
  "marketplace-allocation.created.v1" as const;

interface CartLineSource {
  id?: string | null;
  quantity?: unknown;
  variant_id?: string | null;
  variant?: {
    id?: string | null;
    sku?: string | null;
  } | null;
  offer?: {
    id?: string | null;
    seller_id?: string | null;
  } | null;
}

interface NativeOrderLineSource {
  id?: string | null;
  quantity?: unknown;
  variant_id?: string | null;
  variant_sku?: string | null;
  detail?: {
    quantity?: unknown;
    variant_id?: string | null;
    variant_sku?: string | null;
  } | null;
  variant?: {
    id?: string | null;
    sku?: string | null;
  } | null;
}

interface SellerOrderSource {
  id: string;
  sellerId: string;
  createdAt?: string | Date | null;
  lines: NativeOrderLineSource[];
}

export interface MarketplaceAllocationSource {
  orderGroupId: string;
  cartId: string;
  destinationPostcode?: string | null;
  cartLines: CartLineSource[];
  sellerOrders: SellerOrderSource[];
  environment: "staging";
}

export interface MarketplaceAllocationLine {
  line_key: string;
  order_line_id: string;
  sku: string;
  variant_id: string;
  offer_id: string | null;
  quantity: number;
  ordered_qty: number;
}

export interface MarketplaceAllocationData {
  allocation_id: string;
  order_id: string;
  order_group_id: string;
  seller_order_id: string;
  seller_id: string;
  order_line_ids: string[];
  status: "confirmed";
  lines: MarketplaceAllocationLine[];
  destination_postcode: string | null;
}

export interface MarketplaceAllocationEvent {
  /** Runtime compatibility with the existing JetStream worker envelope. */
  id: string;
  /** Governed AsyncAPI event identifier. */
  event_id: string;
  event_type: typeof MARKETPLACE_ALLOCATION_EVENT_TYPE;
  schema_version: 1;
  occurred_at: string;
  producer: "mercur";
  aggregate_type: "marketplace-allocation";
  aggregate_id: string;
  aggregate_version: 1;
  correlation_id: string;
  environment: "staging";
  test_data: true;
  causation_id: null;
  tenant_id: null;
  /** Runtime compatibility with the existing Experience API event envelope. */
  payload: MarketplaceAllocationData;
  /** Governed AsyncAPI data envelope. */
  data: MarketplaceAllocationData;
}

function stableUuid(seed: string): string {
  const bytes = Buffer.from(
    createHash("sha256").update(seed).digest().subarray(0, 16),
  );
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const value = bytes.toString("hex");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Marketplace allocation source is missing ${field}.`);
  }
  return value;
}

function positiveQuantity(value: unknown, field: string): number {
  const candidate =
    value && typeof value === "object" && "value" in value
      ? (value as { value?: unknown }).value
      : value;
  const quantity = Number(candidate);
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new Error(`Marketplace allocation source has invalid ${field}.`);
  }
  return quantity;
}

function allocationIdForOrder(orderId: string): string {
  const nativeId = orderId.startsWith("order_") ? orderId.slice(6) : orderId;
  return `alloc_${nativeId}`;
}

function lineVariantId(line: CartLineSource | NativeOrderLineSource): string {
  if ("variant" in line && line.variant?.id) return String(line.variant.id);
  if (line.variant_id) return String(line.variant_id);
  if ("detail" in line && line.detail?.variant_id)
    return String(line.detail.variant_id);
  return "";
}

function nativeLineQuantity(line: NativeOrderLineSource): unknown {
  return line.detail?.quantity ?? line.quantity;
}

function nativeLineSku(line: NativeOrderLineSource): string {
  return String(
    line.detail?.variant_sku ?? line.variant_sku ?? line.variant?.sku ?? "",
  );
}

function nativeLineForCartLine(
  cartLine: CartLineSource,
  available: NativeOrderLineSource[],
): NativeOrderLineSource {
  const variantId = lineVariantId(cartLine);
  const sku = cartLine.variant?.sku ? String(cartLine.variant.sku) : "";
  const quantity = positiveQuantity(
    cartLine.quantity,
    `quantity for cart line ${cartLine.id}`,
  );
  let index = available.findIndex(
    (line) =>
      lineVariantId(line) === variantId &&
      positiveQuantity(
        nativeLineQuantity(line),
        `quantity for order line ${line.id}`,
      ) === quantity,
  );
  if (index < 0 && sku) {
    index = available.findIndex(
      (line) =>
        nativeLineSku(line) === sku &&
        positiveQuantity(
          nativeLineQuantity(line),
          `quantity for order line ${line.id}`,
        ) === quantity,
    );
  }
  if (index < 0) {
    throw new Error(
      `No native seller-order line matches cart line ${cartLine.id ?? "unknown"}.`,
    );
  }
  return available.splice(index, 1)[0];
}

/**
 * Normalize Mercur's order-group/seller-order projection into one governed allocation event per
 * seller order. IDs are deterministic so Medusa subscriber redelivery and NATS retries converge.
 */
export function buildMarketplaceAllocationEvents(
  source: MarketplaceAllocationSource,
): MarketplaceAllocationEvent[] {
  const orderGroupId = requiredString(source.orderGroupId, "order_group_id");
  requiredString(source.cartId, "cart_id");
  if (source.environment !== "staging") {
    throw new Error(
      "Marketplace allocation publishing is authorized for staging only.",
    );
  }
  if (source.sellerOrders.length === 0) {
    throw new Error(`Order group ${orderGroupId} has no seller orders.`);
  }

  return source.sellerOrders.map((sellerOrder) => {
    const sellerOrderId = requiredString(sellerOrder.id, "seller_order_id");
    const sellerId = requiredString(sellerOrder.sellerId, "seller_id");
    const sellerCartLines = source.cartLines.filter(
      (line) => String(line.offer?.seller_id ?? "") === sellerId,
    );
    if (sellerCartLines.length === 0) {
      throw new Error(
        `Seller order ${sellerOrderId} has no seller-scoped source cart lines.`,
      );
    }
    const availableNativeLines = [...sellerOrder.lines];
    const lines = sellerCartLines.map((cartLine): MarketplaceAllocationLine => {
      const lineKey = requiredString(cartLine.id, "cart line id");
      const nativeLine = nativeLineForCartLine(cartLine, availableNativeLines);
      const orderLineId = requiredString(nativeLine.id, "order line id");
      const variantId = requiredString(
        lineVariantId(cartLine),
        `variant_id for ${lineKey}`,
      );
      const sku = requiredString(
        cartLine.variant?.sku ?? nativeLineSku(nativeLine),
        `sku for ${lineKey}`,
      );
      const quantity = positiveQuantity(
        cartLine.quantity,
        `quantity for ${lineKey}`,
      );
      return {
        line_key: lineKey,
        order_line_id: orderLineId,
        sku,
        variant_id: variantId,
        offer_id: cartLine.offer?.id ? String(cartLine.offer.id) : null,
        quantity,
        ordered_qty: quantity,
      };
    });
    if (availableNativeLines.length > 0) {
      throw new Error(
        `Seller order ${sellerOrderId} has native lines without source cart-line evidence.`,
      );
    }

    const allocationId = allocationIdForOrder(sellerOrderId);
    const eventId = stableUuid(
      `${MARKETPLACE_ALLOCATION_EVENT_TYPE}:${allocationId}`,
    );
    const data: MarketplaceAllocationData = {
      allocation_id: allocationId,
      order_id: sellerOrderId,
      order_group_id: orderGroupId,
      seller_order_id: sellerOrderId,
      seller_id: sellerId,
      order_line_ids: lines.map((line) => line.order_line_id),
      status: "confirmed",
      lines,
      destination_postcode: source.destinationPostcode?.trim() || null,
    };
    const occurredAt = sellerOrder.createdAt
      ? new Date(sellerOrder.createdAt).toISOString()
      : new Date().toISOString();
    return {
      id: eventId,
      event_id: eventId,
      event_type: MARKETPLACE_ALLOCATION_EVENT_TYPE,
      schema_version: 1,
      occurred_at: occurredAt,
      producer: "mercur",
      aggregate_type: "marketplace-allocation",
      aggregate_id: allocationId,
      aggregate_version: 1,
      correlation_id: stableUuid(`order-group:${orderGroupId}`),
      environment: "staging",
      test_data: true,
      causation_id: null,
      tenant_id: null,
      payload: data,
      data,
    };
  });
}
