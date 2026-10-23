import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { experienceAdminFetch } from "../../../../lib/experience-admin";
import { vendorSellerId } from "../../../../lib/vendor-seller";
import type { AdminShipmentExceptionResponse } from "../../../admin/buildkart/shipments/types";

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse<AdminShipmentExceptionResponse>,
): Promise<void> {
  const sellerId = vendorSellerId(req);
  if (!sellerId) {
    res
      .status(401)
      .json({ message: "Seller authentication required." } as never);
    return;
  }
  const result = await experienceAdminFetch("/v1/seller/shipment-exceptions", {
    actorId: req.auth_context?.actor_id ?? sellerId,
    sellerId,
  });
  res
    .status(result.status)
    .json(result.body as unknown as AdminShipmentExceptionResponse);
}
