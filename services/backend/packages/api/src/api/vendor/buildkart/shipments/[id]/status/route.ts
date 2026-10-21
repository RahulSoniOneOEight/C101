import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { experienceAdminFetch } from "../../../../../../lib/experience-admin";
import type { AdminShipmentActionResponse } from "../../../../../admin/buildkart/shipments/types";

export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse<AdminShipmentActionResponse>,
): Promise<void> {
  const sellerId = req.auth_context?.actor_id;
  if (!sellerId) {
    res.status(401).json({ message: "Seller authentication required." } as never);
    return;
  }
  const result = await experienceAdminFetch(
    `/v1/seller/shipments/${encodeURIComponent(req.params.id)}/status`,
    {
      method: "POST",
      actorId: sellerId,
      sellerId,
      body: req.body ?? {},
    },
  );
  res.status(result.status).json(result.body as unknown as AdminShipmentActionResponse);
}
