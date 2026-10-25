import type { StoreOffer } from "../medusa/store-client.js";

/**
 * The B2B snapshot mirrored onto the product read model when Product Studio saves a B2B price
 * list. The B2B storefront does not carry a Medusa customer-group pricing context, so the saved
 * value is composed here instead of relying on Medusa's calculated price.
 */
export type B2bPricingSnapshot = {
  configured?: boolean;
  amount?: number | null;
  list_price_minor?: number | null;
  moq?: number | null;
  gst_inclusive?: boolean;
  starts_at?: string | null;
  ends_at?: string | null;
  tiers?: Array<{
    min_quantity: number;
    max_quantity?: number | null;
    amount: number;
  }>;
};

export type ComposeOptions = {
  channel?: "b2c" | "b2b";
  b2bPricing?: Record<string, B2bPricingSnapshot> | null;
};

export type ComposedVariant = {
  id: string;
  title?: string;
  sku?: string | null;
  metadata?: Record<string, unknown> | null;
};

export function composeVariantPrices(
  variants: ComposedVariant[],
  offers: StoreOffer[],
  options: ComposeOptions = {},
) {
  const offersByVariant = new Map<string, StoreOffer[]>();
  for (const offer of offers) {
    const list = offersByVariant.get(offer.variant_id) ?? [];
    list.push(offer);
    offersByVariant.set(offer.variant_id, list);
  }
  return variants.map((variant) => {
    const variantOffers = offersByVariant.get(variant.id) ?? [];
    const { selected } = composeOffers(variantOffers, options);
    return {
      ...variant,
      best_price: selected,
      offer_count: variantOffers.length,
      in_stock: variantOffers.some((offer) => offer.in_stock !== false),
    };
  });
}

/** Maps Mercur offers to composed offer views and picks the lowest eligible in-stock offer. */
export function composeOffers(offers: StoreOffer[], options: ComposeOptions = {}) {
  const channel = options.channel ?? "b2c";
  const b2bPricing = options.b2bPricing ?? {};
  const offerViews = offers.map((o) => {
    const qty = o.inventory_quantity ?? null;
    const stockBadge = !o.in_stock
      ? "out_of_stock"
      : qty !== null && qty <= 5
        ? "low_stock"
        : "in_stock";
    const b2b = channel === "b2b" ? b2bPricing[o.id] : undefined;
    const now = Date.now();
    const b2bStartsAt = b2b?.starts_at ? Date.parse(b2b.starts_at) : null;
    const b2bEndsAt = b2b?.ends_at ? Date.parse(b2b.ends_at) : null;
    const b2bWindowOpen =
      (b2bStartsAt === null || (!Number.isNaN(b2bStartsAt) && b2bStartsAt <= now)) &&
      (b2bEndsAt === null || (!Number.isNaN(b2bEndsAt) && b2bEndsAt > now));
    const b2bConfigured =
      channel === "b2b" &&
      b2b?.configured === true &&
      b2bWindowOpen &&
      typeof b2b.amount === "number" &&
      b2b.amount > 0;
    const selling = b2bConfigured
      ? b2b!.amount!
      : o.calculated_price?.calculated_amount ?? null;
    // CHG-052 staging price fixture: the source amount is the list price and the offer carries the
    // discounted selling price. Without this the storefront would show selling == list and no saving.
    const fixtureList = b2bConfigured
      ? Number(b2b!.list_price_minor)
      : Number(o.metadata?.list_price_minor);
    const list = Number.isFinite(fixtureList) && fixtureList > 0
      ? fixtureList
      : o.calculated_price?.original_amount ?? selling;
    const discountMinor =
      list !== null && selling !== null && list > selling ? list - selling : 0;
    return {
      id: o.id,
      seller_id: o.seller_id,
      seller_name: o.seller?.name ?? null,
      variant_id: o.variant_id,
      sku: o.sku,
      currency_code: o.calculated_price?.currency_code ?? "INR",
      unit_amount_minor: selling,
      list_amount_minor: list,
      selling_amount_minor: selling,
      discount_minor: discountMinor,
      discount_percent: discountMinor > 0 && list ? Math.round((discountMinor / list) * 100) : 0,
      price_source: b2bConfigured
        ? "b2b_price_list"
        : discountMinor > 0
          ? "price_list"
          : "list",
      b2b_configured: b2bConfigured,
      b2b_moq: b2bConfigured ? b2b?.moq ?? 1 : null,
      b2b_tiers: b2bConfigured ? b2b?.tiers ?? [] : [],
      b2b_starts_at: b2bConfigured ? b2b?.starts_at ?? null : null,
      b2b_ends_at: b2bConfigured ? b2b?.ends_at ?? null : null,
      inventory_quantity: qty,
      in_stock: o.in_stock ?? null,
      stock_badge: stockBadge,
    };
  });
  const eligible = offerViews.filter(
    (o) => o.in_stock !== false && o.unit_amount_minor != null,
  );
  const selected = eligible.length
    ? eligible.reduce((min, o) => (o.unit_amount_minor! < min.unit_amount_minor! ? o : min), eligible[0])
    : null;
  return { offerViews, selected };
}
