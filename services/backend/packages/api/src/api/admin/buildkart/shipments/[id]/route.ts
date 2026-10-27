import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { experienceAdminFetch } from "../../../../../lib/experience-admin";
import { loadSellerNames, sellerDisplayName } from "../../../../../lib/seller-names";
import type { AdminShipmentDetailResponse } from "../types";

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse<AdminShipmentDetailResponse>,
): Promise<void> {
  const result = await experienceAdminFetch(
    `/v1/admin/shipments/${encodeURIComponent(req.params.id)}`,
    { actorId: req.auth_context?.actor_id },
  );
  if (result.status >= 400) {
    res.status(result.status).json(result.body as never);
    return;
  }
  const body = result.body as unknown as AdminShipmentDetailResponse;
  if (!body.shipment) {
    res.status(result.status).json(body as never);
    return;
  }
  const sellerNames = await loadSellerNames(req.scope, [body.shipment.sellerId]);
  res.status(result.status).json({
    ...body,
    shipment: {
      ...body.shipment,
      seller_name: sellerDisplayName(sellerNames, body.shipment.sellerId),
    },
  });
}
