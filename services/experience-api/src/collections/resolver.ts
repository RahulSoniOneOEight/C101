import type { MedusaStoreClient, StoreProduct } from "../medusa/store-client.js";
import { getCollection, type CollectionDefinition } from "./registry.js";

/**
 * Resolves a dynamic collection to a product list by calling the owning service. Deferred sources
 * (best_sellers, buy_again) fall back to new_arrivals until analytics/order-history is available.
 */

export interface CollectionContext {
  viewedProductIds?: string[];
  productIds?: string[];
}

export class CollectionResolver {
  private viewed: string[] = [];

  constructor(private readonly medusa: MedusaStoreClient) {}

  trackView(productId: string): void {
    this.viewed = [productId, ...this.viewed.filter((id) => id !== productId)].slice(0, 50);
  }

  async resolve(
    key: string,
    context: CollectionContext = {},
  ): Promise<{ collection: CollectionDefinition; items: StoreProduct[]; fallback: boolean }> {
    const collection = getCollection(key);
    if (!collection || collection.status === "deferred" || !collection.enabled) {
      return this.fallbackTo(key);
    }

    switch (collection.source) {
      case "local_history":
        return this.resolveRecent(context.viewedProductIds ?? this.viewed);
      case "medusa_products": {
        const limit = Number(collection.parameters.limit ?? 12);
        const items = await this.medusa.listProducts(limit);
        return { collection, items, fallback: false };
      }
      case "registry": {
        const ids = (collection.parameters.product_ids as string[]) ?? context.productIds ?? [];
        const items = await Promise.all(ids.map((id) => this.medusa.getProduct(id).catch(() => null)));
        return { collection, items: items.filter(Boolean) as StoreProduct[], fallback: false };
      }
      default:
        return this.fallbackTo(key);
    }
  }

  private async resolveRecent(productIds: string[]): Promise<{
    collection: CollectionDefinition;
    items: StoreProduct[];
    fallback: boolean;
  }> {
    const collection = getCollection("recently_viewed")!;
    if (!productIds.length) return this.fallbackTo("recently_viewed");
    const items = await Promise.all(
      productIds.slice(0, 12).map((id) => this.medusa.getProduct(id).catch(() => null)),
    );
    const resolved = items.filter(Boolean) as StoreProduct[];
    return resolved.length
      ? { collection, items: resolved, fallback: false }
      : this.fallbackTo("recently_viewed");
  }

  private async fallbackTo(key: string): Promise<{
    collection: CollectionDefinition;
    items: StoreProduct[];
    fallback: boolean;
  }> {
    const collection = getCollection(key) ?? getCollection("new_arrivals")!;
    const fallbackKey = collection.fallback?.collection_key ?? "new_arrivals";
    const fallbackCollection = getCollection(fallbackKey) ?? getCollection("new_arrivals")!;
    const items = await this.medusa.listProducts(Number(fallbackCollection.parameters.limit ?? 12));
    return { collection: fallbackCollection, items, fallback: true };
  }
}
