import type { StoreCart } from "../medusa/store-client.js";

/**
 * Product-only subtotal exposed to storefront summaries.
 *
 * Medusa's cart `subtotal` includes shipping after a delivery method is
 * attached. Prefer the authoritative `item_subtotal`; older payloads fall back
 * to line subtotals (or unit × quantity) rather than client-side subtraction.
 */
export function itemSubtotalMinor(cart: StoreCart): number {
  const engineItemSubtotal = Number(cart.item_subtotal);
  if (Number.isFinite(engineItemSubtotal) && engineItemSubtotal >= 0) {
    return engineItemSubtotal;
  }

  return (cart.items ?? []).reduce((sum, item) => {
    const lineSubtotal = Number(item.subtotal);
    if (Number.isFinite(lineSubtotal) && lineSubtotal >= 0) {
      return sum + lineSubtotal;
    }
    return sum + Math.max(0, Number(item.unit_price) || 0) * Math.max(0, Number(item.quantity) || 0);
  }, 0);
}
