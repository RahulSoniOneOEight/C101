/**
 * B2B storefront read-path assertions.
 *
 * The B2B app reads the composed product payload without a Medusa customer-group pricing context.
 * These checks protect the contract that a saved B2B snapshot reaches the catalogue, PDP and RFQ
 * consumers as selling price, list price, MOQ and quantity tiers, while B2C keeps its own price.
 */
import assert from "node:assert/strict";
import {
  composeOffers,
  composeVariantPrices,
  type B2bPricingSnapshot,
} from "../commerce/offer-composition.js";
import type { StoreOffer } from "../medusa/store-client.js";

function offer(overrides: Partial<StoreOffer> & Pick<StoreOffer, "id">): StoreOffer {
  return {
    id: overrides.id,
    seller_id: overrides.seller_id ?? "sel_test",
    variant_id: overrides.variant_id ?? "var_test",
    product_id: overrides.product_id ?? "prod_test",
    sku: overrides.sku ?? "SKU-TEST",
    seller: overrides.seller ?? { id: "sel_test", name: "Test Seller" },
    calculated_price: overrides.calculated_price ?? {
      calculated_amount: 100000,
      original_amount: 120000,
      currency_code: "inr",
      calculated_amount_with_tax: 100000,
      calculated_amount_without_tax: 100000,
    },
    inventory_quantity: overrides.inventory_quantity ?? 50,
    in_stock: overrides.in_stock ?? true,
    metadata: overrides.metadata ?? { list_price_minor: 120000 },
  };
}

const b2bSnapshot: B2bPricingSnapshot = {
  configured: true,
  amount: 90000,
  list_price_minor: 110000,
  moq: 6,
  gst_inclusive: true,
  starts_at: "2026-10-01T00:00:00.000Z",
  ends_at: null,
  tiers: [
    { min_quantity: 6, max_quantity: 11, amount: 88000 },
    { min_quantity: 12, max_quantity: null, amount: 85000 },
  ],
};

// --- B2C never reads the B2B snapshot ---------------------------------------------------------
const b2c = composeOffers([offer({ id: "offer_b2c" })], {
  channel: "b2c",
  b2bPricing: { offer_b2c: b2bSnapshot },
});
assert.equal(b2c.selected?.unit_amount_minor, 100000, "B2C must keep the calculated selling price");
assert.equal(b2c.selected?.list_amount_minor, 120000, "B2C must keep the fixture list price");
assert.equal(b2c.selected?.price_source, "price_list", "B2C must keep its price source");
assert.equal(b2c.selected?.b2b_configured, false, "B2C must not claim a B2B price");
assert.equal(b2c.selected?.b2b_moq, null, "B2C must not expose a B2B MOQ");
assert.deepEqual(b2c.selected?.b2b_tiers, [], "B2C must not expose B2B tiers");

// --- B2B reads the saved snapshot --------------------------------------------------------------
const b2b = composeOffers([offer({ id: "offer_b2b" })], {
  channel: "b2b",
  b2bPricing: { offer_b2b: b2bSnapshot },
});
assert.equal(b2b.selected?.unit_amount_minor, 90000, "B2B selling price must come from the snapshot");
assert.equal(b2b.selected?.list_amount_minor, 110000, "B2B list price must come from the snapshot");
assert.equal(b2b.selected?.price_source, "b2b_price_list", "B2B price must be attributed to the B2B list");
assert.equal(b2b.selected?.b2b_configured, true, "B2B offer must be marked configured");
assert.equal(b2b.selected?.b2b_moq, 6, "B2B MOQ must survive composition");
assert.deepEqual(b2b.selected?.b2b_tiers, b2bSnapshot.tiers, "B2B tiers must survive composition");

// --- Selection uses the B2B price, not the B2C price -------------------------------------------
const offers = [
  offer({
    id: "offer_a",
    seller_id: "sel_a",
    calculated_price: {
      calculated_amount: 100000,
      original_amount: 120000,
      currency_code: "inr",
      calculated_amount_with_tax: 100000,
      calculated_amount_without_tax: 100000,
    },
  }),
  offer({
    id: "offer_b",
    seller_id: "sel_b",
    calculated_price: {
      calculated_amount: 200000,
      original_amount: 220000,
      currency_code: "inr",
      calculated_amount_with_tax: 200000,
      calculated_amount_without_tax: 200000,
    },
    metadata: { list_price_minor: 220000 },
  }),
];
const b2bWinner = composeOffers(offers, {
  channel: "b2b",
  b2bPricing: {
    offer_a: { configured: true, amount: 180000, list_price_minor: 200000, moq: 1, tiers: [] },
    offer_b: { configured: true, amount: 150000, list_price_minor: 180000, moq: 1, tiers: [] },
  },
});
assert.equal(b2bWinner.selected?.id, "offer_b", "B2B selection must compare B2B prices");
assert.equal(b2bWinner.selected?.unit_amount_minor, 150000);
const b2cWinner = composeOffers(offers, { channel: "b2c" });
assert.equal(b2cWinner.selected?.id, "offer_a", "B2C selection must still compare B2C prices");

// A cheaper B2C-only offer must not win over an offer with published B2B terms.
const mixed = composeOffers(
  [
    offer({
      id: "offer_b2c_only",
      calculated_price: {
        calculated_amount: 50000,
        original_amount: 60000,
        currency_code: "inr",
        calculated_amount_with_tax: 50000,
        calculated_amount_without_tax: 50000,
      },
    }),
    offer({
      id: "offer_b2b_terms",
      calculated_price: {
        calculated_amount: 90000,
        original_amount: 100000,
        currency_code: "inr",
        calculated_amount_with_tax: 90000,
        calculated_amount_without_tax: 90000,
      },
    }),
  ],
  {
    channel: "b2b",
    b2bPricing: {
      offer_b2b_terms: {
        configured: true,
        amount: 90000,
        list_price_minor: 100000,
        moq: 5,
        tiers: [],
      },
    },
  },
);
assert.equal(
  mixed.selected?.id,
  "offer_b2b_terms",
  "B2B selection must prefer an offer with published B2B terms over a cheaper B2C-only offer",
);
assert.equal(mixed.selected?.b2b_moq, 5);

// --- An unconfigured B2B offer is not commercially ready in the B2B channel --------------------
// CHG-086: channel pricing is independent. A B2C offer price never makes a B2B offer visible.
const unconfigured = composeOffers([offer({ id: "offer_plain" })], {
  channel: "b2b",
  b2bPricing: { offer_plain: { configured: false } },
});
assert.equal(unconfigured.selected, null, "unconfigured B2B must not select a B2C price");
assert.equal(unconfigured.offerViews[0]?.b2b_configured, false);
assert.equal(unconfigured.offerViews[0]?.b2b_moq, null, "unconfigured B2B must not invent an MOQ");
assert.equal(unconfigured.offerViews[0]?.unit_amount_minor, null);

// The same offer remains fully visible to B2C, so the gate is per channel rather than global.
const b2cView = composeOffers([offer({ id: "offer_plain" })], { channel: "b2c" });
assert.equal(b2cView.selected?.unit_amount_minor, 100000, "B2C keeps the offer price");
assert.equal(b2cView.selected?.b2b_configured, false);

// --- A snapshot outside its effective window is not applied -----------------------------------
const future = composeOffers([offer({ id: "offer_future" })], {
  channel: "b2b",
  b2bPricing: {
    offer_future: {
      configured: true,
      amount: 50000,
      list_price_minor: 60000,
      moq: 1,
      starts_at: "2099-01-01T00:00:00.000Z",
    },
  },
});
assert.equal(future.selected, null, "a future B2B price must not make the offer ready yet");
assert.equal(future.offerViews[0]?.b2b_configured, false);
const expired = composeOffers([offer({ id: "offer_expired" })], {
  channel: "b2b",
  b2bPricing: {
    offer_expired: {
      configured: true,
      amount: 50000,
      list_price_minor: 60000,
      moq: 1,
      ends_at: "2000-01-01T00:00:00.000Z",
    },
  },
});
assert.equal(expired.selected, null, "an expired B2B price must not make the offer ready");
assert.equal(expired.offerViews[0]?.b2b_configured, false);

// --- Out-of-stock offers cannot win even with a lower B2B price --------------------------------
const outOfStock = composeOffers(
  [
    offer({ id: "offer_oos", in_stock: false }),
    offer({ id: "offer_live", calculated_price: {
      calculated_amount: 150000,
      original_amount: 150000,
      currency_code: "inr",
      calculated_amount_with_tax: 150000,
      calculated_amount_without_tax: 150000,
    } }),
  ],
  {
    channel: "b2b",
    b2bPricing: {
      offer_oos: { configured: true, amount: 50000, list_price_minor: 60000, moq: 1, tiers: [] },
      offer_live: { configured: true, amount: 150000, list_price_minor: 150000, moq: 1, tiers: [] },
    },
  },
);
assert.equal(outOfStock.selected?.id, "offer_live", "an out-of-stock offer must not win");

// --- Variant best_price carries the B2B fields ------------------------------------------------
const variants = composeVariantPrices(
  [{ id: "var_test", title: "Default", sku: "SKU-TEST" }],
  [offer({ id: "offer_variant" })],
  { channel: "b2b", b2bPricing: { offer_variant: b2bSnapshot } },
);
assert.equal(variants[0]?.best_price?.unit_amount_minor, 90000);
assert.equal(variants[0]?.best_price?.b2b_moq, 6);
assert.equal(variants[0]?.best_price?.b2b_tiers?.length, 2);

console.log(
  "b2b-pricing-read-test: PASS (B2B snapshot drives selling/list/MOQ/tiers, channels isolated, selection and readiness correct)",
);
