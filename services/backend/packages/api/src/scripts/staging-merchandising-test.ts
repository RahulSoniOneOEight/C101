import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  DISCOUNT_CEILING_PERCENT,
  MERCHANDISING_CAMPAIGN_PRESETS,
  MERCHANDISING_COLLECTION_PRESETS,
  MERCHANDISING_PROMOTION_PRESETS,
  assertPresetInvariants,
  budgetAmountMajor,
  merchandisingPresetCatalogue,
} from "../staging-merchandising/presets";
import { isStagingMerchandisingEnabled } from "../staging-merchandising/runtime";
import {
  OFFER_PATTERNS,
  STAGING_OFFERS,
  assertOfferInvariants,
} from "../staging-merchandising/offer-patterns";

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

// Conditions the engine enforces (rules) versus policy intent it cannot (deferred conditions).
const deferred = new Map(
  MERCHANDISING_PROMOTION_PRESETS.map((promotion) => [
    promotion.code,
    promotion.deferredConditions.map((condition) => condition.condition),
  ]),
);
assert.deepEqual(deferred.get("BK-STG-PROMO-TOOLS10"), []);
assert.deepEqual(deferred.get("BK-STG-PROMO-PLY-BULK"), ["min_quantity"]);
assert.deepEqual(deferred.get("BK-STG-PROMO-FREESHIP"), []);
assert.deepEqual(deferred.get("BK-STG-PROMO-SAFETY-B2B"), []);

const freeShipping = MERCHANDISING_PROMOTION_PRESETS.find(
  (promotion) => promotion.code === "BK-STG-PROMO-FREESHIP",
)!;
assert.equal(freeShipping.rules.length, 1);
assert.equal(freeShipping.rules[0].attribute, "subtotal");
assert.equal(freeShipping.rules[0].operator, "gte");
assert.deepEqual(freeShipping.rules[0].values, ["10000"]);

// Only the free-shipping preset gates on cart value; the others declare no extra rules.
for (const promotion of MERCHANDISING_PROMOTION_PRESETS) {
  if (promotion.code === "BK-STG-PROMO-FREESHIP") continue;
  assert.deepEqual(promotion.rules, [], `${promotion.code} should declare no extra rules`);
}

// Budgets are declared in minor units and converted to Medusa major units at the boundary.
for (const campaign of MERCHANDISING_CAMPAIGN_PRESETS) {
  assert.ok(campaign.budgetAmountMinor > 0);
  assert.equal(budgetAmountMajor(campaign.budgetAmountMinor) * 100, campaign.budgetAmountMinor);
}

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
  "staging-merchandising-test: PASS (4 collections, 4 marketplace-funded promotions, 2 campaigns, " +
    "1 enforced subtotal gate, 1 deferred condition)",
);

// CHG-030 offer-pattern declarations.
assertOfferInvariants();
assert.equal(STAGING_OFFERS.length, 6);
assert.equal(
  STAGING_OFFERS.filter((offer) => offer.trigger === "automatic").length > 0,
  true,
);
assert.equal(
  STAGING_OFFERS.filter((offer) => offer.trigger === "code").length > 0,
  true,
);
console.log(
  `staging-merchandising-test: PASS (offer lab declares ${STAGING_OFFERS.length} offers across ` +
    `${OFFER_PATTERNS.length} patterns)`,
);
