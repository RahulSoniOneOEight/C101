/**
 * CHG-046 — customer-facing collection URL assertions.
 *
 * Pure checks: no network. The resolver is given a stub commerce client, so these pin the resolution
 * order rather than Medusa's behaviour: a registry key is never shadowed, a commerce handle resolves,
 * and anything unknown or empty is a not-found instead of a substitute product list.
 */
import assert from "node:assert/strict";
import { CollectionNotFoundError, CollectionResolver } from "../collections/resolver.js";
import type { MedusaStoreClient, StoreProduct } from "../medusa/store-client.js";

const product = (id: string): StoreProduct => ({ id, title: `Product ${id}` }) as unknown as StoreProduct;

function stub(overrides: Record<string, unknown>): MedusaStoreClient {
  return {
    listProducts: async () => [product("fallback")],
    listProductsByCollection: async () => [],
    getCollectionByHandle: async () => null,
    getProduct: async () => product("x"),
    listProductCategories: async () => [],
    listProductsByCategory: async () => [],
    ...overrides,
  } as unknown as MedusaStoreClient;
}

// --- an operator-created collection resolves by its handle -------------------------------------
{
  const resolver = new CollectionResolver(
    stub({
      getCollectionByHandle: async (handle: string) =>
        handle === "flash-deals" ? { id: "pcol_1", title: "Flash Deals", handle } : null,
      listProductsByCollection: async (id: string) =>
        id === "pcol_1" ? [product("a"), product("b")] : [],
    }),
  );
  const result = await resolver.resolve("flash-deals");
  assert.equal(result.collection.collection_key, "flash-deals");
  assert.equal(result.collection.parameters.collection_id, "pcol_1");
  assert.equal(result.collection.parameters.title, "Flash Deals");
  assert.equal(result.items.length, 2, "the collection's own products are returned");
  assert.equal(result.fallback, false, "a real collection is never a fallback");
}

// --- an unknown handle is a not-found, never the new-arrivals list -------------------------------
{
  const resolver = new CollectionResolver(stub({}));
  await assert.rejects(
    () => resolver.resolve("no-such-collection"),
    (error: unknown) => error instanceof CollectionNotFoundError && error.reason === "unknown",
    "a broken link must not render another collection's products",
  );
}

// --- an existing collection with nothing to deliver is a distinct not-found ----------------------
{
  const resolver = new CollectionResolver(
    stub({
      getCollectionByHandle: async (handle: string) => ({ id: "pcol_2", title: "Empty", handle }),
      listProductsByCollection: async () => [],
    }),
  );
  await assert.rejects(
    () => resolver.resolve("empty-collection"),
    (error: unknown) => error instanceof CollectionNotFoundError && error.reason === "empty",
    "wrong link and nothing published yet need different words",
  );
}

// --- a registry key keeps precedence over a commerce handle of the same name ---------------------
{
  let consultedCommerce = false;
  const resolver = new CollectionResolver(
    stub({
      getCollectionByHandle: async () => {
        consultedCommerce = true;
        return null;
      },
      listProducts: async () => [product("r1")],
    }),
  );
  const result = await resolver.resolve("new_arrivals");
  assert.equal(result.collection.collection_key, "new_arrivals");
  assert.equal(result.fallback, false);
  assert.equal(consultedCommerce, false, "a curated key must not be looked up in commerce");
}

// --- a deferred registry key keeps its existing fallback behaviour -------------------------------
{
  const resolver = new CollectionResolver(stub({ listProducts: async () => [product("f1")] }));
  const result = await resolver.resolve("best_sellers");
  assert.equal(result.fallback, true, "deferred keys still fall back, as before this change");
}

console.log(
  "collection-url-test: PASS (commerce handle resolves, unknown and empty are not-found, registry precedence, deferred fallback preserved)",
);
