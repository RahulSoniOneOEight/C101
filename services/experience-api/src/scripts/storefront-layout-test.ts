/**
 * CHG-032 — storefront layout projection assertions.
 *
 * Pure checks: no network. Verifies resolution, editorial ownership of labels, that membership is
 * delivered as a reference, and that the seed does not drift from the reviewed fixture.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveLayout, storefrontLayouts } from "../content/storefront-layout.js";

// --- resolution ------------------------------------------------------------------------------
const b2c = resolveLayout("b2c", "en-IN");
assert.ok(b2c, "a b2c layout must resolve for en-IN");
assert.equal(b2c.layout_key, "b2c-home");
assert.equal(b2c.channel, "b2c");

// No b2b layout is seeded yet: absence must be undefined, never a throw.
assert.equal(resolveLayout("b2b", "en-IN"), undefined);

// Outside the layout window the layout is withheld rather than served stale.
assert.equal(resolveLayout("b2c", "en-IN", new Date("2027-06-01T00:00:00Z")), undefined);

// --- composition -----------------------------------------------------------------------------
assert.ok(b2c.modules.length >= 1, "a layout must compose at least one module");
const moduleKeys = b2c.modules.map((module) => module.module_key);
assert.equal(
  new Set(moduleKeys).size,
  moduleKeys.length,
  "module_key must be unique within a layout",
);

// Merchandising labels are editorial and must survive to delivery.
const bestDeals = b2c.modules.find((module) => module.module_key === "home-best-deals");
assert.ok(bestDeals, "the Best Deals module must exist");
assert.equal(bestDeals.type, "offer-collection");
assert.equal(bestDeals.title, "Best Deals");
assert.ok(bestDeals.tag, "the Best Deals module must carry an editorial badge");

// A category banner is a first-class merchandising property.
const categoryBanner = b2c.modules.find((module) => module.type === "category-banner");
assert.ok(categoryBanner, "a category banner module must be composable");
assert.equal(categoryBanner.category_reference, "pcat_construction");
assert.equal(categoryBanner.position, "top");

// --- membership is a reference, never inlined transactional data -------------------------------
for (const module of b2c.modules) {
  if (!module.membership) continue;
  assert.ok(
    ["staged-ids", "curated-collection", "none"].includes(module.membership.mode),
    `${module.module_key}: unknown membership mode`,
  );
  if (module.membership.mode === "curated-collection") {
    assert.ok(
      module.membership.collection_key,
      `${module.module_key}: curated membership must name a collection`,
    );
  }
}

const serialised = JSON.stringify(storefrontLayouts);
for (const forbidden of ["price", "amount", "mrp", "stock", "commission"]) {
  assert.equal(
    serialised.includes(`"${forbidden}`),
    false,
    `layout seed must not carry transactional field '${forbidden}'`,
  );
}

// --- fixture parity --------------------------------------------------------------------------
const fixturePath = new URL(
  "../../../../client-projects/client101/contracts/fixtures/storefront-layout.json",
  import.meta.url,
);
const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as Record<string, unknown>;

// generated_at and source are stamped at delivery, not held in the seed.
const { generated_at: _generated, source: _source, ...fixtureBody } = fixture;
assert.deepEqual(
  b2c as unknown as Record<string, unknown>,
  fixtureBody,
  "layout seed drifted from the reviewed storefront-layout fixture",
);

console.log(
  "storefront-layout-test: PASS (b2c layout resolves, b2b withholds, labels and badge preserved, membership referenced, fixture parity)",
);
