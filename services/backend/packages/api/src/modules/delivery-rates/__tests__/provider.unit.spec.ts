import PincodeDeliveryProviderService from "../provider";

const providerWith = (resolveFee: jest.Mock) =>
  new PincodeDeliveryProviderService({
    delivery_rates: { resolveFee } as never,
  });

describe("Pincode delivery provider", () => {
  it("reads the seller from optionData and the pincode from the cart context", async () => {
    const resolveFee = jest.fn().mockResolvedValue(2900);
    const provider = providerWith(resolveFee);

    const price = await provider.calculatePrice(
      { seller_id: "sel_123" },
      {},
      {
        id: "cart_123",
        shipping_address: { postal_code: "302001" },
        items: [],
      },
    );

    expect(resolveFee).toHaveBeenCalledWith("sel_123", "302001");
    expect(price).toEqual({
      calculated_amount: 2900,
      is_calculated_price_tax_inclusive: false,
    });
  });

  it("fails closed when the shipping option has no seller", async () => {
    const provider = providerWith(jest.fn());

    await expect(
      provider.calculatePrice({}, {}, {
        shipping_address: { postal_code: "302001" },
      }),
    ).rejects.toThrow("missing its seller_id");
  });

  it("is a calculated provider with one delivery option", async () => {
    const provider = providerWith(jest.fn());

    await expect(provider.canCalculate()).resolves.toBe(true);
    await expect(provider.getFulfillmentOptions()).resolves.toEqual([
      { id: "pincode-delivery", seller_id_required: true },
    ]);
  });
});
