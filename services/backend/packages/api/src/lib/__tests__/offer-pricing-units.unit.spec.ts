import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { majorToMinor, minorToMajor } from "../offer-pricing";

/**
 * U-013 — the Product Studio price boundary.
 *
 * The pricing endpoint speaks minor units and converts to Medusa major units.
 * The studio forms must therefore send `rupees × 100`, and must convert the
 * response back before feeding the editor. These tests pin both halves and the
 * exact 1/100 slip that published IPHONE 17 at ₹1,850 instead of ₹1,85,000.
 */
describe("offer pricing units (U-013)", () => {
  it("round-trips a base selling price of ₹1,85,000", () => {
    const minor = majorToMinor(185000);
    expect(minor).toBe(18_500_000);
    expect(minorToMajor(minor)).toBe(185000);
  });

  it("round-trips a ₹1,70,000 quantity tier", () => {
    const minor = majorToMinor(170000);
    expect(minor).toBe(17_000_000);
    expect(minorToMajor(minor)).toBe(170000);
  });

  it("keeps the ₹2,00,000 list price in minor units", () => {
    expect(majorToMinor(200000)).toBe(20_000_000);
  });

  it("shows what a major-for-minor slip does (₹1,85,000 → ₹1,850)", () => {
    // The old save sent 185000 into a minor-unit field.
    expect(minorToMajor(185000)).toBe(1850);
    // The correct boundary conversion does not.
    expect(minorToMajor(majorToMinor(185000))).toBe(185000);
    // 1/100 of the real amount is exactly the published defect.
    expect(minorToMajor(majorToMinor(185000)) / minorToMajor(185000)).toBe(100);
  });
});

describe("studio forms send minor units (U-013 source contract)", () => {
  const workspace = resolve(__dirname, "../../../../..");
  const forms = ["apps/admin", "apps/vendor"].map((app) => ({
    app,
    source: readFileSync(
      resolve(
        workspace,
        app,
        "src/routes/product-studio/studio-form.tsx",
      ),
      "utf8",
    ),
  }));

  it.each(forms)("$app sends base and tiers in minor units", ({ source }) => {
    expect(source).toContain("amount: baseMinor");
    expect(source).toMatch(/amount: Math\.round\(Number\(tier\.amount\) \* 100\)/);
    expect(source).not.toContain("amount: Number(base),");
  });

  it.each(forms)("$app converts the pricing response back to major", ({ source }) => {
    expect(source).toContain("Number(price.amount) / 100");
    expect(source).not.toContain("prices: result.pricing.prices,");
  });

  it.each(forms)("$app guards a <10% selling price before saving", ({ source }) => {
    expect(source).toContain("priceUnitWarning(baseMinor, listMinor)");
    expect(source).toContain("window.confirm(unitWarning)");
  });
});
