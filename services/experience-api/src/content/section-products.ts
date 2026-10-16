/**
 * Storefront layout sections — product resolution.
 *
 * A section stores a *reference* to a commerce collection; commerce resolves the membership at read
 * time. Nothing is copied into editorial configuration, so changing a collection's products changes
 * every section that points at it, with no editorial action.
 *
 * Resolution returns a lean reference for each product (identity, handle and thumbnail) rather than a
 * full commerce payload: the storefront already renders product cards from its own catalog, and
 * duplicating price or stock here would create a second place where commerce data is composed.
 */
import type { MedusaStoreClient, StoreProduct } from "../medusa/store-client.js";
import type { StorefrontLayoutSection } from "./layout-sections.js";

export interface SectionProductReference {
  id: string;
  title: string;
  handle: string | null;
  thumbnail: string | null;
}

export interface ResolvedLayoutSection extends Omit<StorefrontLayoutSection, "children"> {
  /** Resolved products, in the order commerce returned them. Empty when the source is not a collection. */
  products: SectionProductReference[];
  /** Set when the section declares a source that cannot be resolved here, so the gap is visible. */
  products_unavailable_reason?: string;
  /** Group children, resolved with the same rules. */
  children?: ResolvedLayoutSection[];
}

export interface SectionProductResolution {
  sections: ResolvedLayoutSection[];
  /** Collections that were referenced but returned no products, for the console and for support. */
  empty_collections: string[];
}

function reference(product: StoreProduct): SectionProductReference {
  const record = product as unknown as Record<string, unknown>;
  return {
    id: String(record.id ?? ""),
    title: String(record.title ?? ""),
    handle: typeof record.handle === "string" ? record.handle : null,
    thumbnail: typeof record.thumbnail === "string" ? record.thumbnail : null,
  };
}

const DEFAULT_LIMIT = 12;

async function resolveOne(
  section: StorefrontLayoutSection,
  medusa: MedusaStoreClient,
  empty: Set<string>,
): Promise<ResolvedLayoutSection> {
  // Children are re-resolved below, so they must not ride along on the spread.
  const { children: declaredChildren, ...rest } = section;
  let products: SectionProductReference[] = [];
  let reason: string | undefined;

  if (section.source === "collection") {
    const collectionId = section.collection_key;
    if (collectionId) {
      const limit = section.limit && section.limit > 0 ? section.limit : DEFAULT_LIMIT;
      try {
        const found = await medusa.listProductsByCollection(collectionId, limit);
        if (found.length === 0) empty.add(collectionId);
        products = found.map(reference);
      } catch (error) {
        // A failing collection must not take the whole storefront down; the section renders empty and
        // says why, rather than showing a broken card.
        reason = `The collection could not be resolved: ${(error as Error).message}`;
      }
    } else {
      reason = "The section has no collection configured.";
    }
  } else if (section.source === "group") {
    // Groups resolve their children; a group itself carries no products.
    reason = undefined;
  } else if (section.source === "customer-history") {
    reason = "Buy Again is resolved per authenticated customer, not from the layout.";
  } else if (section.source === "schemes") {
    reason = "Schemes resolve through the offer and scheme services, not from the layout.";
  } else if (section.source === "best-selling") {
    reason = "Best-selling ranking is not available yet.";
  }

  const children = declaredChildren
    ? await Promise.all(declaredChildren.map((child) => resolveOne(child, medusa, empty)))
    : undefined;

  return {
    ...rest,
    products,
    ...(reason ? { products_unavailable_reason: reason } : {}),
    ...(children ? { children } : {}),
  };
}

export async function resolveSectionProducts(
  sections: StorefrontLayoutSection[],
  medusa: MedusaStoreClient,
): Promise<SectionProductResolution> {
  const empty = new Set<string>();
  const resolved = await Promise.all(
    sections.map((section) => resolveOne(section, medusa, empty)),
  );
  return { sections: resolved, empty_collections: [...empty] };
}
