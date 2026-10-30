import {
  PINCODE_DELIVERY_CONTEXT_KEY,
} from "../constants";
import { PincodeDeliveryProviderService } from "../provider";

const provider = () => new PincodeDeliveryProviderService();

const contextWith = (fees: Record<string, number>, pincode = "302001") => ({
  [PINCODE_DELIVERY_CONTEXT_KEY]: { pincode, fees },
});

describe("Pincode delivery provider", () => {
  it("charges the fee the pricing hook resolved for the option's seller", async () => {
    const price = await provider().calculatePrice(
      { seller_id: "sel_123" },
      {},
      contextWith({ sel_123: 2900, sel_other: 4900 }),
    );

    expect(price).toEqual({
      calculated_amount: 29,
      is_calculated_price_tax_inclusive: false,
    });
  });

  it("falls back to the Rs 99 default when the seller has no rate at the pincode", async () => {
    const price = await provider().calculatePrice(
      { seller_id: "sel_missing" },
      {},
      contextWith({ sel_123: 2900 }),
    );

    expect(price.calculated_amount).toBe(99);
  });

  it("fails closed when the shipping option has no seller", async () => {
    await expect(
      provider().calculatePrice({}, {}, contextWith({ sel_123: 2900 })),
    ).rejects.toThrow("missing its seller_id");
  });

  it("fails closed when the pricing hook did not provide the context", async () => {
    await expect(
      provider().calculatePrice(
        { seller_id: "sel_123" },
        {},
        { shipping_address: { postal_code: "302001" } },
      ),
    ).rejects.toThrow("pricing hook is not registered");
  });

  it("is a calculated provider with one delivery option", async () => {
    await expect(provider().canCalculate()).resolves.toBe(true);
    await expect(provider().getFulfillmentOptions()).resolves.toEqual([
      { id: "pincode-delivery" },
    ]);
  });
});
