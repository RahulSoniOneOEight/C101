/**
 * CHG-029 — merchandising content and collection registry assertions.
 *
 * Pure checks: no network. Verifies the curated staging collections are registered with the
 * category source and that campaign content resolves by placement with hi-IN -> en-IN fallback.
 */
import assert from "node:assert/strict";
import { getCollection } from "../collections/registry.js";
import { resolveContent, appContent } from "../content/app-content.js";

const CURATED = [
  { key: "monsoon-site-essentials", categories: ["Building Materials", "Safety Gear"] },
  { key: "power-tool-week", categories: ["Power Tools"] },
  { key: "plumbing-refresh", categories: ["Pipes & Fittings", "Faucets & Showers"] },
  { key: "electrical-safety", categories: ["Wiring & Cables", "Lighting", "Switches & Sockets"] },
];

for (const expected of CURATED) {
  const collection = getCollection(expected.key);
  assert.ok(collection, `missing curated collection ${expected.key}`);
  assert.equal(collection.source, "medusa_categories");
  assert.equal(collection.enabled, true);
  assert.equal(collection.status, "enabled");
  assert.deepEqual(collection.parameters.category_names, expected.categories);
  assert.ok(collection.fallback, `${expected.key} must declare a fallback`);
}

// Dynamic keys from before CHG-029 must remain unchanged in behaviour.
for (const key of ["new_arrivals", "recently_viewed", "related"]) {
  const collection = getCollection(key);
  assert.ok(collection, `regression: ${key} disappeared`);
  assert.equal(collection.enabled, true);
}

// Campaign copy resolves by placement and locale.
const hero = resolveContent("collection.power-tool-week.hero", "en-IN");
assert.equal(hero.length, 1);
assert.equal(hero[0].content_type, "campaign-copy");
assert.equal(typeof hero[0].version, "string");

const stripEn = resolveContent("home.campaign-strip", "en-IN");
assert.equal(stripEn.length, 1);
assert.equal(stripEn[0].content_type, "banner");

// hi-IN has its own strip copy, so it must not fall back.
const stripHi = resolveContent("home.campaign-strip", "hi-IN");
assert.equal(stripHi.length, 1);
assert.equal(stripHi[0].locale, "hi-IN");

// Fallback still works for a placement that only has en-IN.
const trade = resolveContent("onboarding.trade-program", "hi-IN");
assert.equal(trade.length, 1);
assert.equal(trade[0].locale, "en-IN");

// Every content element must carry a string version and a test_data flag.
for (const element of appContent) {
  assert.equal(typeof element.version, "string", `${element.id} version must be a string`);
  assert.equal(element.test_data, true);
}

console.log(
  "merchandising-content-test: PASS (4 curated collections, 4 campaign content placements, locale fallback)",
);
