import type {
  ComposedProduct,
  CustomerOrderSummary,
} from "./experience-api";

/** Turns a server-owned business account id into a readable trade identity. */
export function readableBusinessName(value: string | null | undefined): string {
  if (!value) return "Trade account";
  return value
    .replace(/^business_/, "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

/**
 * Buy-again lines from the buyer's owner-scoped order history, matched back to the live trade
 * catalogue. Products that no longer have an active B2B offer are skipped rather than shown stale.
 */
export function buyAgainProducts(
  products: ComposedProduct[],
  orders: CustomerOrderSummary[],
  limit = 4,
): ComposedProduct[] {
  const byProduct = new Map(products.map((product) => [product.id, product]));
  const bySku = new Map(
    products
      .filter((product) => product.best_price?.sku)
      .map((product) => [product.best_price!.sku!.toLowerCase(), product]),
  );
  const seen = new Set<string>();
  const result: ComposedProduct[] = [];
  for (const order of orders) {
    for (const line of order.lines ?? []) {
      const product =
        (line.product_id ? byProduct.get(line.product_id) : undefined) ??
        (line.sku ? bySku.get(line.sku.toLowerCase()) : undefined);
      if (!product || !product.best_price || seen.has(product.id)) continue;
      seen.add(product.id);
      result.push(product);
      if (result.length >= limit) return result;
    }
  }
  return result;
}
