import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { experienceAdminFetch } from "../../../../../lib/experience-admin";
import { vendorSellerId } from "../../../../../lib/vendor-seller";
import type { AdminReturnActionResponse } from "../../../../admin/buildkart/returns/types";

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse<AdminReturnActionResponse>,
): Promise<void> {
  const sellerId = vendorSellerId(req);
  if (!sellerId) {
    res
      .status(401)
      .json({ message: "Seller authentication required." } as never);
    return;
  }
  const result = await experienceAdminFetch(
    `/v1/seller/returns/${encodeURIComponent(req.params.id)}`,
    { actorId: req.auth_context?.actor_id ?? sellerId, sellerId },
  );
  res
    .status(result.status)
    .json(result.body as unknown as AdminReturnActionResponse);
}
