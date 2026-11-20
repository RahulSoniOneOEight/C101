import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { replaceDraftCartLines } from "../lib/cart.ts";
import { replaceDraftTradeQuoteLines } from "../lib/trade-quote.ts";

let saved;
let writes;

beforeEach(() => {
  saved = new Map();
  writes = 0;
  globalThis.window = {
    localStorage: {
      getItem: (key) => saved.get(key) ?? null,
      setItem: (key, value) => {
        writes += 1;
        saved.set(key, value);
      },
    },
    dispatchEvent: () => {},
  };
});

const retail = (offerId, quantity, currency = "INR") => ({
  offerId,
  productId: "product-1",
  title: "Sample",
  sku: "SAMPLE",
  seller: "Seller",
  priceMinor: 40000,
  currency,
  quantity,
  channel: "b2c",
});
const trade = (offerId, quantity, currency = "INR") => ({
  productId: "product-1",
  offerId,
  title: "Sample",
  sku: "SAMPLE",
  seller: "Seller",
  moq: 5,
  basePriceMinor: 40000,
  tiers: [],
  currency,
  quantity,
});

test("retail build replaces matching quantities in a single write, even when repeated", () => {
  saved.set("bazarbee.cart.v1", JSON.stringify([retail("existing", 1)]));
  const lines = [retail("first", 3), retail("second", 2)];
  assert.deepEqual(replaceDraftCartLines(lines), { ok: true });
  assert.equal(writes, 1);
  assert.deepEqual(replaceDraftCartLines(lines), { ok: true });
  assert.equal(writes, 2);
  const cart = JSON.parse(saved.get("bazarbee.cart.v1"));
  assert.equal(cart.length, 3);
  assert.equal(cart.find((item) => item.offerId === "first").quantity, 3);
  assert.equal(cart.find((item) => item.offerId === "second").quantity, 2);
  assert.equal(cart.find((item) => item.offerId === "existing").quantity, 1);
});

test("retail build rejects mixed channels without a partial write", () => {
  saved.set("bazarbee.cart.v1", JSON.stringify([{ ...retail("trade", 2), channel: "b2b" }]));
  const original = saved.get("bazarbee.cart.v1");
  assert.equal(replaceDraftCartLines([retail("first", 3), retail("second", 2)]).ok, false);
  assert.equal(saved.get("bazarbee.cart.v1"), original);
  assert.equal(writes, 0);
});

test("retail build rejects bad quantities, duplicated offers and mixed currencies", () => {
  assert.deepEqual(replaceDraftCartLines([retail("first", 100)]), {
    ok: false,
    reason: "invalid-quantity",
  });
  assert.deepEqual(replaceDraftCartLines([retail("first", 2), retail("first", 3)]), {
    ok: false,
    reason: "duplicate-offer",
  });
  assert.deepEqual(replaceDraftCartLines([retail("first", 2), retail("second", 3, "USD")]), {
    ok: false,
    reason: "currency-conflict",
  });
  assert.equal(writes, 0);
});

test("trade build writes the quotation cart, replaces matching offers, and leaves retail untouched", () => {
  saved.set("bazarbee.cart.v1", JSON.stringify([retail("retail", 1)]));
  assert.deepEqual(replaceDraftTradeQuoteLines([trade("trade", 6)]), { ok: true });
  assert.deepEqual(replaceDraftTradeQuoteLines([trade("trade", 6)]), { ok: true });
  assert.equal(writes, 2);
  assert.equal(JSON.parse(saved.get("bazarbee.trade.quote.v1"))[0].quantity, 6);
  assert.equal(JSON.parse(saved.get("bazarbee.cart.v1"))[0].offerId, "retail");
});

test("trade build blocks below-MOQ, oversized, duplicate and mixed-currency lines", () => {
  assert.equal(replaceDraftTradeQuoteLines([trade("trade", 4)]).ok, false);
  assert.equal(replaceDraftTradeQuoteLines([trade("trade", 1000)]).ok, false);
  assert.equal(replaceDraftTradeQuoteLines([trade("trade", 5), trade("trade", 6)]).ok, false);
  assert.equal(replaceDraftTradeQuoteLines([trade("trade", 5), trade("other", 5, "USD")]).ok, false);
  assert.equal(writes, 0);
  assert.equal(saved.has("bazarbee.trade.quote.v1"), false);
});
