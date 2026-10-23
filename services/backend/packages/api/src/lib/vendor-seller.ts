import type { AuthenticatedMedusaRequest } from "@medusajs/framework/http";

/**
 * Mercur authenticates a vendor request as a member (`mem_...`). The selected seller
 * (`sel_...`) is resolved by the vendor middleware from the `x-seller-id` header after it
 * verifies membership. Never use the member actor as a seller ID.
 */
export function vendorSellerId(req: AuthenticatedMedusaRequest): string | null {
  const context = (
    req as AuthenticatedMedusaRequest & {
      seller_context?: { seller_id?: string | null };
    }
  ).seller_context;
  return context?.seller_id ?? null;
}
