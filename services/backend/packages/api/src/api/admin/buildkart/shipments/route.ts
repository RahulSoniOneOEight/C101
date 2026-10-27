import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { experienceAdminFetch } from "../../../../lib/experience-admin";
import { loadSellerNames, sellerDisplayName } from "../../../../lib/seller-names";
import type { AdminShipmentListResponse } from "./types";

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse<AdminShipmentListResponse>,
): Promise<void> {
  const limit = typeof req.query.limit === "string" ? req.query.limit : "100";
  const result = await experienceAdminFetch("/v1/admin/shipments", {
    actorId: req.auth_context?.actor_id,
    query: `limit=${encodeURIComponent(limit)}`,
  });
  if (result.status >= 400) {
    res.status(result.status).json(result.body as never);
    return;
  }
  const body = result.body as unknown as AdminShipmentListResponse;
  const sellerNames = await loadSellerNames(
    req.scope,
    (body.items ?? []).map((shipment) => shipment.sellerId),
  );
  res.status(result.status).json({
    ...body,
    items: (body.items ?? []).map((shipment) => ({
      ...shipment,
      seller_name: sellerDisplayName(sellerNames, shipment.sellerId),
    })),
  });
}
