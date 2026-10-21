import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { experienceAdminFetch } from "../../../../lib/experience-admin";
import type { AdminReturnListResponse } from "../../../admin/buildkart/returns/types";

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse<AdminReturnListResponse>,
): Promise<void> {
  const sellerId = req.auth_context?.actor_id;
  if (!sellerId) {
    res.status(401).json({ message: "Seller authentication required." } as never);
    return;
  }
  const result = await experienceAdminFetch("/v1/seller/returns", {
    actorId: sellerId,
    sellerId,
  });
  res.status(result.status).json(result.body as unknown as AdminReturnListResponse);
}
