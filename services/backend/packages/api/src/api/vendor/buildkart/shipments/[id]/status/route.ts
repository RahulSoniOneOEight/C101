import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { experienceAdminFetch } from "../../../../../../lib/experience-admin";
import { vendorSellerId } from "../../../../../../lib/vendor-seller";
import type { AdminShipmentActionResponse } from "../../../../../admin/buildkart/shipments/types";

export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse<AdminShipmentActionResponse>,
): Promise<void> {
  const sellerId = vendorSellerId(req);
  if (!sellerId) {
    res
      .status(401)
      .json({ message: "Seller authentication required." } as never);
    return;
  }
  const result = await experienceAdminFetch(
    `/v1/seller/shipments/${encodeURIComponent(req.params.id)}/status`,
    {
      method: "POST",
      actorId: req.auth_context?.actor_id ?? sellerId,
      sellerId,
      body: req.body ?? {},
    },
  );
  res
    .status(result.status)
    .json(result.body as unknown as AdminShipmentActionResponse);
}
