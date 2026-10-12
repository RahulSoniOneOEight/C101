import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  DISCOUNT_CEILING_PERCENT,
  MERCHANDISING_CAMPAIGN_PRESETS,
  MERCHANDISING_COLLECTION_PRESETS,
  MERCHANDISING_PROMOTION_PRESETS,
  assertPresetInvariants,
  merchandisingPresetCatalogue,
} from "../staging-merchandising/presets";
import { isStagingMerchandisingEnabled } from "../staging-merchandising/runtime";

// --- environment guard ------------------------------------------------------------------------
assert.equal(isStagingMerchandisingEnabled({ NODE_ENV: "development" }), false);
assert.equal(isStagingMerchandisingEnabled({ NODE_ENV: "production" }), false);
assert.equal(
  isStagingMerchandisingEnabled({ BUILDKART_ENVIRONMENT: "production" }),
  false,
);
assert.equal(
  isStagingMerchandisingEnabled({
    NODE_ENV: "production",
    BUILDKART_ENVIRONMENT: "staging",
  }),
  true,
);
assert.equal(isStagingMerchandisingEnabled({ BUILDKART_ENVIRONMENT: " staging " }), true);

// --- preset invariants ------------------------------------------------------------------------
assertPresetInvariants();

assert.equal(MERCHANDISING_COLLECTION_PRESETS.length, 4);
assert.equal(MERCHANDISING_PROMOTION_PRESETS.length, 4);
assert.equal(MERCHANDISING_CAMPAIGN_PRESETS.length, 2);

for (const promotion of MERCHANDISING_PROMOTION_PRESETS) {
  assert.equal(promotion.fundingSource, "marketplace");
  assert.ok(
    promotion.value <= DISCOUNT_CEILING_PERCENT,
    `${promotion.code} breaches the discount ceiling`,
  );
}
for (const campaign of MERCHANDISING_CAMPAIGN_PRESETS) {
  assert.equal(campaign.fundingSource, "marketplace");
}

// The two engine-unsupported conditions must stay explicit so they cannot be mistaken for
// enforced behaviour.
const deferred = new Map(
  MERCHANDISING_PROMOTION_PRESETS.map((promotion) => [
    promotion.code,
    promotion.deferredConditions.map((condition) => condition.condition),
  ]),
);
assert.deepEqual(deferred.get("BK-STG-PROMO-TOOLS10"), []);
assert.deepEqual(deferred.get("BK-STG-PROMO-PLY-BULK"), ["min_quantity"]);
assert.deepEqual(deferred.get("BK-STG-PROMO-FREESHIP"), ["min_subtotal_minor"]);
assert.deepEqual(deferred.get("BK-STG-PROMO-SAFETY-B2B"), []);

// --- catalogue matches the reviewed contract fixture -------------------------------------------
const fixturePath = path.resolve(
  __dirname,
  "../../../../../../client-projects/client101/contracts/fixtures/merchandising-presets.json",
);
const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as Record<string, unknown>;
const catalogue = merchandisingPresetCatalogue() as unknown as Record<string, unknown>;

const withoutGeneratedAt = (value: Record<string, unknown>) => {
  const { generated_at: _ignored, ...rest } = value;
  return rest;
};

assert.deepEqual(
  withoutGeneratedAt(catalogue),
  withoutGeneratedAt(fixture),
  "backend presets drifted from the reviewed merchandising fixture",
);

console.log(
  "staging-merchandising-test: PASS (4 collections, 4 marketplace-funded promotions, 2 campaigns, 2 deferred conditions)",
);
