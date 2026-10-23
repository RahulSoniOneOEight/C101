import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { experienceAdminFetch } from "../../../../../../lib/experience-admin";
import { hasPermission } from "../../../../../../lib/rbac";
import { vendorSellerId } from "../../../../../../lib/vendor-seller";
import type { AdminReturnActionResponse } from "../../../../../admin/buildkart/returns/types";
import type { ManualReturnStatusType } from "../../../../../admin/buildkart/returns/[id]/status/validators";

export async function POST(
  req: AuthenticatedMedusaRequest<ManualReturnStatusType>,
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
    `/v1/seller/returns/${encodeURIComponent(req.params.id)}/status`,
    {
      method: "POST",
      actorId: req.auth_context?.actor_id ?? sellerId,
      sellerId,
      body: req.validatedBody,
    },
  );
  res.status(result.status).json(result.body as unknown as AdminReturnActionResponse);
}
