import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { experienceAdminFetch } from "../../../../../lib/experience-admin";
import type { AdminShipmentDetailResponse } from "../../../../admin/buildkart/shipments/types";

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse<AdminShipmentDetailResponse>,
): Promise<void> {
  const sellerId = req.auth_context?.actor_id;
  if (!sellerId) {
    res.status(401).json({ message: "Seller authentication required." } as never);
    return;
  }
  const result = await experienceAdminFetch(
    `/v1/seller/shipments/${encodeURIComponent(req.params.id)}`,
    { actorId: sellerId, sellerId },
  );
  res.status(result.status).json(result.body as unknown as AdminShipmentDetailResponse);
}
