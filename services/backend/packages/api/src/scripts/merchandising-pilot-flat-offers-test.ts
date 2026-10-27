/**
 * U-003 / B002 — declarative proof for the pilot flat offers.
 *
 * Pure module test (no Medusa container): pins the configuration the governed staging script
 * applies, so a later edit cannot silently change FLAT5/ORDER10 or re-activate PLY5.
 *
 * Run: bun run src/scripts/merchandising-pilot-flat-offers-test.ts
 */
import assert from "node:assert/strict";
import {
  DISCOUNT_CEILING_PERCENT,
  MERCHANDISING_PROMOTION_PRESETS,
  assertPresetInvariants,
} from "../staging-merchandising/presets";
import {
  OFFER_CAMPAIGNS,
  PILOT_FLAT_OFFERS,
  PILOT_FLAT_OFFERS_CAMPAIGN,
  assertOfferInvariants,
  buildOffer,
} from "../staging-merchandising/offer-patterns";

interface BuiltOffer {
  code: string;
  status: string;
  is_automatic: boolean;
  limit?: number;
  rules?: unknown[];
  application_method: {
    type: string;
    target_type: string;
    value: number;
    allocation?: string;
    target_rules?: unknown[];
  };
}

assertPresetInvariants();
assertOfferInvariants();

// PLY5 is retired, not deleted (D6), and is no longer engine-automatic.
const ply5 = MERCHANDISING_PROMOTION_PRESETS.find((preset) => preset.code === "PLY5");
assert.ok(ply5, "PLY5 must stay in the preset list for redemption history");
assert.equal(ply5.status, "inactive", "PLY5 must be inactive");
assert.equal(ply5.automatic, false, "PLY5 must never auto-apply again (D6)");
assert.equal(ply5.value, 5, "PLY5 value must be untouched");

// Every other preset keeps its default lifecycle state; only PLY5 is retired.
for (const preset of MERCHANDISING_PROMOTION_PRESETS) {
  if (preset.code === "PLY5") continue;
  assert.notEqual(preset.status, "inactive", `${preset.code} must stay active`);
}

// FLAT5 and ORDER10: code-triggered order-level percentages in the pilot campaign.
const flat5 = PILOT_FLAT_OFFERS.find((offer) => offer.code === "FLAT5");
const order10 = PILOT_FLAT_OFFERS.find((offer) => offer.code === "ORDER10");
assert.ok(flat5, "FLAT5 must be declared");
assert.ok(order10, "ORDER10 must be declared");

for (const offer of [flat5, order10]) {
  assert.equal(offer.trigger, "code", `${offer.code} must be code-triggered`);
  assert.equal(offer.mechanic, "order-percentage", `${offer.code} must be order-level`);
  assert.equal(offer.campaignKey, PILOT_FLAT_OFFERS_CAMPAIGN.campaignKey);
  assert.ok(offer.usageLimit > 0, `${offer.code} must record a usage limit`);
  assert.ok(offer.value > 0 && offer.value <= DISCOUNT_CEILING_PERCENT);
}

assert.equal(flat5.value, 5, "FLAT5 must grant 5%");
assert.equal(order10.value, 10, "ORDER10 must grant 10%");

const flat5Payload = buildOffer({
  code: flat5.code,
  mechanic: flat5.mechanic,
  value: flat5.value,
  automatic: false,
  usageLimit: flat5.usageLimit,
}) as unknown as BuiltOffer;
const order10Payload = buildOffer({
  code: order10.code,
  mechanic: order10.mechanic,
  value: order10.value,
  automatic: false,
  usageLimit: order10.usageLimit,
}) as unknown as BuiltOffer;

for (const payload of [flat5Payload, order10Payload]) {
  assert.equal(payload.status, "active", `${payload.code} must be created active`);
  assert.equal(payload.is_automatic, false, `${payload.code} must never be engine-automatic`);
  assert.equal(payload.application_method.type, "percentage");
  assert.equal(payload.application_method.target_type, "order");
  assert.equal(payload.rules, undefined, `${payload.code} must have no rule gate`);
  assert.equal(
    payload.application_method.target_rules,
    undefined,
    `${payload.code} must have no category/sales-channel target rule`,
  );
  assert.ok((payload.limit ?? 0) > 0, `${payload.code} must carry a usage limit`);
}

// Campaign shape: "Pilot Flat Offers", large spend budget, ends 2026-12-31 (D7).
assert.ok(OFFER_CAMPAIGNS.includes(PILOT_FLAT_OFFERS_CAMPAIGN));
assert.equal(PILOT_FLAT_OFFERS_CAMPAIGN.title, "Pilot Flat Offers");
assert.equal(PILOT_FLAT_OFFERS_CAMPAIGN.currencyCode, "inr");
assert.equal(PILOT_FLAT_OFFERS_CAMPAIGN.endsAt, "2026-12-31T23:59:59Z");
assert.ok(
  PILOT_FLAT_OFFERS_CAMPAIGN.budgetAmountMinor > 20_000_000,
  "the always-on campaign must out-budget the bounded offer lab",
);
for (const offer of PILOT_FLAT_OFFERS) {
  assert.equal(offer.campaignKey, PILOT_FLAT_OFFERS_CAMPAIGN.campaignKey);
}

console.log(
  "merchandising-pilot-flat-offers-test: PASS (FLAT5 5% + ORDER10 10% code-based order offers " +
    "in Pilot Flat Offers; PLY5 inactive and not automatic; ceiling respected)",
);
