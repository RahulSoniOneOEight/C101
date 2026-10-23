import assert from "node:assert/strict";
import { validateB2bPricing } from "../lib/b2b-pricing";

const valid = {
  amount: 9000,
  list_price_minor: 10000,
  moq: 5,
  tiers: [
    { min_quantity: 10, max_quantity: 19, amount: 8500 },
    { min_quantity: 20, max_quantity: null, amount: 8000 },
  ],
  starts_at: "2026-11-01T00:00:00Z",
  ends_at: "2026-12-01T00:00:00Z",
  gst_inclusive: true,
};
assert.doesNotThrow(() => validateB2bPricing(valid));
assert.throws(() => validateB2bPricing({ ...valid, amount: 11000 }), /exceed/);
assert.throws(
  () =>
    validateB2bPricing({
      ...valid,
      tiers: [
        { min_quantity: 10, max_quantity: 20, amount: 8500 },
        { min_quantity: 15, max_quantity: 30, amount: 8000 },
      ],
    }),
  /overlap/,
);
assert.throws(
  () =>
    validateB2bPricing({
      ...valid,
      tiers: [{ min_quantity: 10, amount: 9500 }],
    }),
  /higher unit price/,
);
assert.throws(
  () =>
    validateB2bPricing({
      ...valid,
      starts_at: "2026-12-01T00:00:00Z",
      ends_at: "2026-11-01T00:00:00Z",
    }),
  /after its start/,
);
assert.throws(() => validateB2bPricing({ ...valid, moq: 0 }), /MOQ/);
console.log("B2B pricing validation tests passed");
