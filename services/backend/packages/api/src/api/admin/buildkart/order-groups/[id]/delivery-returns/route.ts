import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { experienceAdminFetch } from "../../../../../../lib/experience-admin";
import { hasPermission } from "../../../../../../lib/rbac";
import { loadSellerNames, sellerDisplayName } from "../../../../../../lib/seller-names";
import type { AdminOrderGroupDeliveryReturnsResponse } from "./types";

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse<AdminOrderGroupDeliveryReturnsResponse>,
): Promise<void> {
  if (!hasPermission(req, "order.read")) {
    res.status(403).json({ message: "Missing permission: order.read." } as never);
    return;
  }
  const result = await experienceAdminFetch(
    `/v1/admin/order-groups/${encodeURIComponent(req.params.id)}/delivery-returns`,
    { actorId: req.auth_context?.actor_id },
  );
  if (result.status >= 400) {
    res.status(result.status).json(result.body as never);
    return;
  }
  const body = result.body as unknown as AdminOrderGroupDeliveryReturnsResponse;
  const sellerNames = await loadSellerNames(
    req.scope,
    (body.shipments ?? []).map((shipment) => shipment.sellerId),
  );
  const shipments = (body.shipments ?? []).map((shipment) => ({
    ...shipment,
    seller_name: sellerDisplayName(sellerNames, shipment.sellerId),
  }));
  res.status(result.status).json({
    ...body,
    shipments,
    capabilities: {
      can_update_delivery: hasPermission(req, "delivery.update"),
      can_update_return: hasPermission(req, "return.respond"),
      can_decide_return: hasPermission(req, "return.respond"),
      can_view_payment: hasPermission(req, "payment.read"),
      can_manage_refund:
        hasPermission(req, "refund.approve") || hasPermission(req, "refund.execute"),
      can_view_technical: hasPermission(req, "reconciliation.read"),
    },
  });
}
