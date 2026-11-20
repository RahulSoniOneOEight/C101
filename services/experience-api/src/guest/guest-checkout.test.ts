import { describe, expect, test } from "bun:test";
import {
  normalizeIndianMobile,
  parseGuestCheckoutBody,
  parseGuestQuoteBody,
} from "./guest-checkout.js";

const valid = {
  lines: [{ offerId: "offer_1", quantity: 2 }],
  email: "Guest@Example.com",
  mobile: "+91 98765 43210",
  firstName: "Guest",
  lastName: "Buyer",
  address1: "101 Test Yard",
  city: "Jaipur",
  postalCode: "302001",
  channel: "b2c",
};

describe("normalizeIndianMobile", () => {
  test("accepts the common Indian formats and stores E.164", () => {
    expect(normalizeIndianMobile("9876543210")).toBe("+919876543210");
    expect(normalizeIndianMobile("+91 98765 43210")).toBe("+919876543210");
    expect(normalizeIndianMobile("09876543210")).toBe("+919876543210");
    expect(normalizeIndianMobile("91-98765-43210")).toBe("+919876543210");
  });

  test("rejects invalid numbers", () => {
    expect(normalizeIndianMobile("5876543210")).toBeNull();
    expect(normalizeIndianMobile("98765")).toBeNull();
    expect(normalizeIndianMobile("not a number")).toBeNull();
    expect(normalizeIndianMobile("")).toBeNull();
  });
});

describe("parseGuestCheckoutBody", () => {
  test("normalizes a valid guest checkout", () => {
    const parsed = parseGuestCheckoutBody(valid);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.email).toBe("guest@example.com");
    expect(parsed.value.mobile).toBe("+919876543210");
    expect(parsed.value.lines).toEqual([{ offerId: "offer_1", quantity: 2 }]);
  });

  test("rejects trade checkout, bad postal codes and duplicate offers", () => {
    expect(parseGuestCheckoutBody({ ...valid, channel: "b2b" }).ok).toBe(false);
    expect(parseGuestCheckoutBody({ ...valid, postalCode: "123" }).ok).toBe(false);
    expect(
      parseGuestCheckoutBody({
        ...valid,
        lines: [
          { offerId: "offer_1", quantity: 1 },
          { offerId: "offer_1", quantity: 2 },
        ],
      }).ok,
    ).toBe(false);
    expect(parseGuestCheckoutBody({ ...valid, mobile: "12345" }).ok).toBe(false);
  });
});

describe("parseGuestQuoteBody", () => {
  test("accepts a B2C quote without contact details", () => {
    const parsed = parseGuestQuoteBody({
      lines: [{ offerId: "offer_1", quantity: 1 }],
      postalCode: "302001",
      channel: "b2c",
    });
    expect(parsed.ok).toBe(true);
  });

  test("rejects trade quotes and invalid pincodes", () => {
    expect(
      parseGuestQuoteBody({
        lines: [{ offerId: "offer_1", quantity: 1 }],
        postalCode: "302001",
        channel: "b2b",
      }).ok,
    ).toBe(false);
    expect(
      parseGuestQuoteBody({
        lines: [{ offerId: "offer_1", quantity: 1 }],
        postalCode: "30200",
      }).ok,
    ).toBe(false);
  });
});
