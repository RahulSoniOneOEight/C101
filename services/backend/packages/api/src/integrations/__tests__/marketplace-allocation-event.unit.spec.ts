import { buildMarketplaceAllocationEvents } from "../marketplace-allocation-event";

const source = () => ({
  orderGroupId: "og_01TESTGROUP",
  cartId: "cart_01TEST",
  destinationPostcode: "560001",
  environment: "staging" as const,
  cartLines: [
    {
      id: "cali_seller_a",
      quantity: 2,
      variant_id: "variant_a",
      variant: { id: "variant_a", sku: "SKU-A" },
      offer: { id: "offer_a", seller_id: "seller_a" },
    },
    {
      id: "cali_seller_b",
      quantity: 1,
      variant_id: "variant_b",
      variant: { id: "variant_b", sku: "SKU-B" },
      offer: { id: "offer_b", seller_id: "seller_b" },
    },
  ],
  sellerOrders: [
    {
      id: "order_01SELLERA",
      sellerId: "seller_a",
      createdAt: "2026-10-21T10:00:00.000Z",
      lines: [
        {
          id: "ordli_a",
          quantity: 2,
          variant_id: "variant_a",
          variant_sku: "SKU-A",
        },
      ],
    },
    {
      id: "order_01SELLERB",
      sellerId: "seller_b",
      createdAt: "2026-10-21T10:00:00.000Z",
      lines: [
        {
          id: "ordli_b",
          quantity: 1,
          variant_id: "variant_b",
          variant_sku: "SKU-B",
        },
      ],
    },
  ],
});

describe("buildMarketplaceAllocationEvents", () => {
  it("creates one deterministic governed event per Mercur seller order", () => {
    const first = buildMarketplaceAllocationEvents(source());
    const replay = buildMarketplaceAllocationEvents(source());

    expect(first).toHaveLength(2);
    expect(first.map((event) => event.id)).toEqual(
      replay.map((event) => event.id),
    );
    expect(first[0]).toMatchObject({
      id: expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      ),
      event_type: "marketplace-allocation.created",
      producer: "mercur",
      aggregate_type: "marketplace-allocation",
      aggregate_id: "alloc_01SELLERA",
      environment: "staging",
      test_data: true,
      data: {
        allocation_id: "alloc_01SELLERA",
        order_id: "order_01SELLERA",
        order_group_id: "og_01TESTGROUP",
        seller_order_id: "order_01SELLERA",
        seller_id: "seller_a",
        order_line_ids: ["ordli_a"],
        status: "confirmed",
        destination_postcode: "560001",
        lines: [
          {
            line_key: "cali_seller_a",
            order_line_id: "ordli_a",
            sku: "SKU-A",
            variant_id: "variant_a",
            offer_id: "offer_a",
            quantity: 2,
            ordered_qty: 2,
          },
        ],
      },
    });
    expect(first[0].payload).toEqual(first[0].data);
  });

  it("fails closed when a seller order cannot be traced to source cart lines", () => {
    const invalid = source();
    invalid.cartLines = invalid.cartLines.filter(
      (line) => line.offer.seller_id !== "seller_b",
    );
    expect(() => buildMarketplaceAllocationEvents(invalid)).toThrow(
      "Seller order order_01SELLERB has no seller-scoped source cart lines.",
    );
  });

  it("fails closed outside staging", () => {
    expect(() =>
      buildMarketplaceAllocationEvents({
        ...source(),
        environment: "production" as never,
      }),
    ).toThrow("authorized for staging only");
  });
});
