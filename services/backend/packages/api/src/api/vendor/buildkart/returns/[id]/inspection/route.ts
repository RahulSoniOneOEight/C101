import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { experienceAdminFetch } from "../../../../../../lib/experience-admin";
import { hasPermission } from "../../../../../../lib/rbac";
import { vendorSellerId } from "../../../../../../lib/vendor-seller";
import type { AdminReturnActionResponse } from "../../../../../admin/buildkart/returns/types";
import type { ReturnInspectionType } from "../../../../../admin/buildkart/returns/[id]/inspection/validators";

/**
 * Seller inspection. The Experience API scope-checks the return against the seller's shipment
 * lines; this route forwards the seller identity and never exposes marketplace decision/refund.
 */
export async function POST(
  req: AuthenticatedMedusaRequest<ReturnInspectionType>,
  res: MedusaResponse<AdminReturnActionResponse>,
): Promise<void> {
  const sellerId = vendorSellerId(req);
  if (!sellerId) {
    res.status(401).json({ message: "Seller authentication required." } as never);
    return;
  }
  if (!hasPermission(req, "return.respond")) {
    res.status(403).json({ message: "Missing permission: return.respond." } as never);
    return;
  }
  const result = await experienceAdminFetch(
    `/v1/seller/returns/${encodeURIComponent(req.params.id)}/inspection`,
    {
      method: "POST",
      actorId: req.auth_context?.actor_id ?? sellerId,
      sellerId,
      body: req.validatedBody,
    },
  );
  res.status(result.status).json(result.body as unknown as AdminReturnActionResponse);
}
