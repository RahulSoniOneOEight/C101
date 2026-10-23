import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { experienceAdminFetch } from "../../../../../../lib/experience-admin";
import { hasPermission } from "../../../../../../lib/rbac";
import { vendorSellerId } from "../../../../../../lib/vendor-seller";
import type { AdminShipmentActionResponse } from "../../../../../admin/buildkart/shipments/types";
import type { ManualShipmentStatusType } from "../../../../../admin/buildkart/shipments/[id]/status/validators";

export async function POST(
  req: AuthenticatedMedusaRequest<ManualShipmentStatusType>,
  res: MedusaResponse<AdminShipmentActionResponse>,
): Promise<void> {
  const sellerId = vendorSellerId(req);
  if (!sellerId) {
    res
      .status(401)
      .json({ message: "Seller authentication required." } as never);
    return;
  }
  if (!hasPermission(req, "delivery.update")) {
    res.status(403).json({ message: "Missing permission: delivery.update." } as never);
    return;
  }
  const result = await experienceAdminFetch(
    `/v1/seller/shipments/${encodeURIComponent(req.params.id)}/status`,
    {
      method: "POST",
      actorId: req.auth_context?.actor_id ?? sellerId,
      sellerId,
      body: req.validatedBody,
    },
  );
  res
    .status(result.status)
    .json(result.body as unknown as AdminShipmentActionResponse);
}
