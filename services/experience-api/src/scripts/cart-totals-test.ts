import assert from "node:assert/strict";
import { itemSubtotalMinor } from "../commerce/cart-totals.js";
import type { StoreCart } from "../medusa/store-client.js";

function cart(overrides: Partial<StoreCart>): StoreCart {
  return {
    id: "cart_test",
    currency_code: "inr",
    region_id: "reg_test",
    items: [],
    subtotal: 0,
    total: 0,
    ...overrides,
  };
}

assert.equal(
  itemSubtotalMinor(cart({ item_subtotal: 399000, subtotal: 408900, shipping_total: 9900 })),
  399000,
  "engine item_subtotal must exclude shipping",
);

assert.equal(
  itemSubtotalMinor(cart({
    subtotal: 408900,
    shipping_total: 9900,
    items: [{
      id: "line_1",
      title: "Socket set",
      product_title: "Socket set",
      quantity: 1,
      unit_price: 399000,
      subtotal: 399000,
      metadata: null,
    }],
  })),
  399000,
  "line subtotal is the compatibility fallback",
);

assert.equal(
  itemSubtotalMinor(cart({
    subtotal: 408900,
    items: [{
      id: "line_1",
      title: "Socket set",
      product_title: "Socket set",
      quantity: 2,
      unit_price: 399000,
      metadata: null,
    }],
  })),
  798000,
  "unit price times quantity is the final fallback",
);

assert.equal(
  itemSubtotalMinor(cart({
    item_subtotal: 399000,
    item_discount_total: 19950,
    shipping_total: 9900,
    shipping_discount_total: 9900,
    subtotal: 408900,
    total: 379050,
  })),
  399000,
  "item and free-shipping promotions never change the product subtotal mapping",
);

console.log("cart-totals-test: PASS");
