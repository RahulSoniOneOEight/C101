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

/**
 * A key that is neither a registry collection nor a commerce collection handle.
 *
 * Thrown rather than falling back: serving new arrivals for a broken link made every bad or unknown
 * collection URL look like a working page, which is both wrong and untraceable.
 */
export class CollectionNotFoundError extends Error {
  constructor(readonly reason: "unknown" | "empty") {
    super(`collection-not-found:${reason}`);
    this.name = "CollectionNotFoundError";
  }
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
    if (!collection) {
      // Registry keys keep precedence, so a curated key is never shadowed by a commerce handle with the
      // same spelling. Anything unregistered is treated as a commerce collection handle.
      return this.resolveCommerceCollection(key);
    }
    if (collection.status === "deferred" || !collection.enabled) {
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
      case "medusa_categories": {
        const names = (collection.parameters.category_names as string[]) ?? [];
        const limit = Number(collection.parameters.limit ?? 12);
        if (!names.length) return this.fallbackTo(key);
        const categories = await this.medusa.listProductCategories();
        const categoryIds = categories
          .filter((category) => names.includes(category.name))
          .map((category) => category.id);
        if (!categoryIds.length) return this.fallbackTo(key);
        const lists = await Promise.all(
          categoryIds.map((id) => this.medusa.listProductsByCategory(id, limit)),
        );
        const seen = new Set<string>();
        const items: StoreProduct[] = [];
        for (const list of lists) {
          for (const product of list) {
            if (items.length >= limit) break;
            if (seen.has(product.id)) continue;
            seen.add(product.id);
            items.push(product);
          }
        }
        return { collection, items, fallback: false };
      }
      default:
        return this.fallbackTo(key);
    }
  }

  /**
   * Resolve an unregistered key as a commerce collection handle.
   *
   * This is what gives every collection created in the console a customer-facing URL: the handle is the
   * address, commerce owns membership, and the response keeps the same shape as a registry collection so
   * the storefront needs one code path.
   */
  private async resolveCommerceCollection(key: string): Promise<{
    collection: CollectionDefinition;
    items: StoreProduct[];
    fallback: boolean;
  }> {
    const commerce = await this.medusa.getCollectionByHandle(key);
    if (!commerce) throw new CollectionNotFoundError("unknown");

    const items = await this.medusa.listProductsByCollection(commerce.id, 100);
    if (!items.length) throw new CollectionNotFoundError("empty");

    return {
      collection: {
        collection_key: commerce.handle,
        type: "manual",
        source: "medusa_collection",
        parameters: { collection_id: commerce.id, title: commerce.title },
        fallback: null,
        enabled: true,
        status: "enabled",
      },
      items,
      fallback: false,
    };
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
