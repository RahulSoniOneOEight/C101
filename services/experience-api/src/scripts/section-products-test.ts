/**
 * CHG-044 — layout section product resolution.
 *
 * A section stores a reference; commerce resolves membership at read time. These assertions pin down
 * the three things that would otherwise fail quietly on the storefront: the declared limit is honoured,
 * a broken collection cannot take the whole shell down, and a source that is not a collection says so
 * instead of rendering an empty rail with no explanation.
 */
import assert from "node:assert/strict";
import type { MedusaStoreClient, StoreProduct } from "../medusa/store-client.js";
import { resolveSectionProducts } from "../content/section-products.js";
import type { StorefrontLayoutSection } from "../content/layout-sections.js";

function product(id: string): StoreProduct {
  return { id, title: `Product ${id}`, handle: `product-${id}`, thumbnail: `https://img/${id}.jpg` } as unknown as StoreProduct;
}

function fakeMedusa(options: { fail?: boolean } = {}): { client: MedusaStoreClient; calls: Array<{ id: string; limit: number }> } {
  const calls: Array<{ id: string; limit: number }> = [];
  const client = {
    async listProductsByCollection(collectionId: string, limit = 12): Promise<StoreProduct[]> {
      calls.push({ id: collectionId, limit });
      if (options.fail) throw new Error("commerce unavailable");
      return [product(`${collectionId}-1`), product(`${collectionId}-2`)];
    },
  } as unknown as MedusaStoreClient;
  return { client, calls };
}

function section(overrides: Partial<StorefrontLayoutSection>): StorefrontLayoutSection {
  return {
    placement: "flash_deals",
    label: "Flash Deals",
    source: "collection",
    visible: true,
    ...overrides,
  };
}

// --- a collection section resolves products and honours its limit --------------------------------
{
  const { client, calls } = fakeMedusa();
  const result = await resolveSectionProducts(
    [section({ collection_key: "col_a", limit: 4 })],
    client,
  );
  assert.equal(result.sections.length, 1);
  assert.equal(result.sections[0].products.length, 2);
  assert.equal(result.sections[0].products[0].id, "col_a-1");
  assert.equal(result.sections[0].products[0].thumbnail, "https://img/col_a-1.jpg");
  assert.deepEqual(calls, [{ id: "col_a", limit: 4 }], "the declared limit must be passed to commerce");
}

// --- the limit defaults when absent --------------------------------------------------------------
{
  const { client, calls } = fakeMedusa();
  await resolveSectionProducts([section({ collection_key: "col_b" })], client);
  assert.equal(calls[0].limit, 12);
}

// --- an invalid limit falls back rather than asking commerce for nothing -------------------------
{
  const { client, calls } = fakeMedusa();
  await resolveSectionProducts([section({ collection_key: "col_c", limit: 0 })], client);
  assert.equal(calls[0].limit, 12);
}

// --- a failing collection explains itself and never throws --------------------------------------
{
  const { client } = fakeMedusa({ fail: true });
  const result = await resolveSectionProducts([section({ collection_key: "col_d" })], client);
  assert.equal(result.sections[0].products.length, 0);
  assert.match(String(result.sections[0].products_unavailable_reason), /could not be resolved/);
}

// --- a section with no collection says so -------------------------------------------------------
{
  const { client } = fakeMedusa();
  const result = await resolveSectionProducts([section({})], client);
  assert.equal(result.sections[0].products.length, 0);
  assert.match(String(result.sections[0].products_unavailable_reason), /no collection configured/);
}

// --- sources that are not collections are labelled, not silently empty ---------------------------
{
  const { client } = fakeMedusa();
  const result = await resolveSectionProducts(
    [
      section({ placement: "buy_again", source: "customer-history" }),
      section({ placement: "schemes", source: "schemes" }),
      section({ placement: "best_sellers", source: "best-selling" }),
    ],
    client,
  );
  assert.match(String(result.sections[0].products_unavailable_reason), /per authenticated customer/);
  assert.match(String(result.sections[1].products_unavailable_reason), /offer and scheme services/);
  assert.match(String(result.sections[2].products_unavailable_reason), /not available yet/);
}

// --- group children resolve, and the group itself carries none -----------------------------------
{
  const { client, calls } = fakeMedusa();
  const result = await resolveSectionProducts(
    [
      section({
        placement: "trade_offers",
        label: "Trade Offers & Deals",
        source: "group",
        children: [
          section({ placement: "seasonal", collection_key: "col_seasonal" }),
          section({ placement: "best_deals", collection_key: "col_deals" }),
          section({ placement: "schemes", source: "schemes" }),
        ],
      }),
    ],
    client,
  );
  assert.equal(result.sections[0].products.length, 0, "a group carries no products of its own");
  assert.equal(result.sections[0].children?.length, 3);
  assert.equal(result.sections[0].children?.[0].products.length, 2);
  assert.deepEqual(calls.map((call) => call.id).sort(), ["col_deals", "col_seasonal"]);
}

console.log("section-products-test: PASS (limits, defaults, failure isolation, non-collection sources, groups)");
