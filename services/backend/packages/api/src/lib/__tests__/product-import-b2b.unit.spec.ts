import { parseImportB2bPricing, parseImportTiers } from "../product-import-b2b";

describe("parseImportB2bPricing", () => {
  it("treats an absent B2B price as no B2B pricing", () => {
    expect(parseImportB2bPricing({})).toEqual({ pricing: null, errors: [] });
  });

  it("rejects B2B fields without a selling price", () => {
    const result = parseImportB2bPricing({ b2b_tiers: "10:95" });
    expect(result.pricing).toBeNull();
    expect(result.errors[0]).toContain("b2b_selling_price is required");
  });

  it("parses a valid price and tier schedule", () => {
    const result = parseImportB2bPricing({
      b2b_list_price: "140",
      b2b_selling_price: "110",
      b2b_moq: "5",
      b2b_tiers: "10:105|20:100",
    });
    expect(result.errors).toEqual([]);
    expect(result.pricing).toMatchObject({
      amount: 11000,
      list_price_minor: 14000,
      moq: 5,
      tiers: [
        { min_quantity: 10, max_quantity: 19, amount: 10500 },
        { min_quantity: 20, max_quantity: null, amount: 10000 },
      ],
    });
  });

  it("defaults list price to the selling price and MOQ to 1", () => {
    const result = parseImportB2bPricing({ b2b_selling_price: "100" });
    expect(result.errors).toEqual([]);
    expect(result.pricing).toMatchObject({
      amount: 10000,
      list_price_minor: 10000,
      moq: 1,
      tiers: [],
    });
  });

  it("rejects a selling price above the list price", () => {
    const result = parseImportB2bPricing({
      b2b_list_price: "100",
      b2b_selling_price: "120",
    });
    expect(result.errors.join(" ")).toContain("cannot exceed");
  });

  it("rejects invalid money values", () => {
    expect(parseImportB2bPricing({ b2b_selling_price: "abc" }).errors).toHaveLength(1);
    expect(
      parseImportB2bPricing({ b2b_selling_price: "100", b2b_list_price: "0" }).errors,
    ).toHaveLength(1);
  });

  it("rejects a tier above the B2B selling price", () => {
    const result = parseImportB2bPricing({
      b2b_selling_price: "100",
      b2b_tiers: "10:150",
    });
    expect(result.errors.join(" ")).toContain("higher quantity");
  });

  it("rejects a tier below the MOQ", () => {
    const result = parseImportB2bPricing({
      b2b_selling_price: "100",
      b2b_moq: "5",
      b2b_tiers: "3:95",
    });
    expect(result.errors.join(" ")).toContain("at least the MOQ");
  });

  it("rejects overlapping tier ranges", () => {
    const result = parseImportB2bPricing({
      b2b_selling_price: "100",
      b2b_tiers: "10:95|10:90",
    });
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rejects malformed tier entries instead of silently dropping them", () => {
    expect(parseImportTiers("ten:95").errors[0]).toContain("must start at quantity");
    expect(parseImportTiers("10").errors[0]).toContain("positive price");
    expect(parseImportTiers("10:95|").errors).toEqual([]);
  });
});
