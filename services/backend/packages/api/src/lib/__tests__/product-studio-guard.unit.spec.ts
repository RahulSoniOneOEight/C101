import { sellerProvisionReasonRequired } from "../product-studio-guard";

describe("sellerProvisionReasonRequired", () => {
  it("requires a reason when an admin provisions a seller's offer", () => {
    expect(sellerProvisionReasonRequired("admin", "sel_123")).toBe(true);
  });

  it("does not require a reason when a seller saves their own product", () => {
    expect(sellerProvisionReasonRequired("vendor", "sel_123")).toBe(false);
  });

  it("does not require a reason when no seller is selected", () => {
    expect(sellerProvisionReasonRequired("admin", null)).toBe(false);
    expect(sellerProvisionReasonRequired("admin", "  ")).toBe(false);
  });
});
