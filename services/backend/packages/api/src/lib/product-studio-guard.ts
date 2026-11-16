/**
 * Seller and admin share one Product Studio save path. The provisioning reason exists to justify an
 * admin placing a product under a seller's ownership; a seller saving their own product provisions
 * their own offer implicitly and has no reason to enter.
 */
export function sellerProvisionReasonRequired(
  mode: "admin" | "vendor",
  sellerId: string | null | undefined,
): boolean {
  return mode === "admin" && Boolean(sellerId?.trim());
}
