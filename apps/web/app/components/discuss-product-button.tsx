"use client";

export interface DiscussProductDetails {
  title: string;
  sku?: string | null;
  productId?: string | null;
  variantId?: string | null;
  offerId?: string | null;
  sellerId?: string | null;
  sellerName?: string | null;
  quantity?: number;
  unitPriceMinor?: number | null;
  currency?: string | null;
}

/**
 * "Discuss" is the web entry point to the shared conversation. When the page has a sellable
 * offer, the drawer writes a product reference into the human channel; without one it falls back
 * to a prefilled message so the discussion still starts.
 */
export function DiscussProductButton(details: DiscussProductDetails) {
  return (
    <button
      type="button"
      className="button button-ghost discuss-product"
      onClick={() => {
        window.dispatchEvent(
          new CustomEvent("bazarbee:chat-product", {
            detail: { ...details, title: details.title, sku: details.sku ?? "" },
          }),
        );
      }}
    >
      Ask about this product
    </button>
  );
}
