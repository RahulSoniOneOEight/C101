import { expect, test } from "bun:test";
import { orderChannelLabel } from "../src/lib/order-channel";

test("labels a B2B order from checkout metadata, not the shared Medusa sales channel", () => {
  expect(orderChannelLabel({ channel: "b2b" })).toBe("B2B");
});

test("labels a B2C order from checkout metadata", () => {
  expect(orderChannelLabel({ channel: "b2c" })).toBe("B2C");
});

test("does not infer an order type when checkout metadata is absent or unrecognized", () => {
  expect(orderChannelLabel(undefined)).toBeNull();
  expect(orderChannelLabel({})).toBeNull();
  expect(orderChannelLabel({ channel: "unknown" })).toBeNull();
});
