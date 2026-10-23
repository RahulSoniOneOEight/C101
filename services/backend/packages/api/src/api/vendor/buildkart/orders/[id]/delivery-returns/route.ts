import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { experienceAdminFetch } from "../../../../../../lib/experience-admin";
import { hasPermission } from "../../../../../../lib/rbac";
import { vendorSellerId } from "../../../../../../lib/vendor-seller";
import type { VendorOrderDeliveryReturnsResponse } from "./types";

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse<VendorOrderDeliveryReturnsResponse>,
): Promise<void> {
  const sellerId = vendorSellerId(req);
  if (!sellerId) {
    res.status(401).json({ message: "Seller authentication required." } as never);
    return;
  }
  if (!hasPermission(req, "order.read")) {
    res.status(403).json({ message: "Missing permission: order.read." } as never);
    return;
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data: sellerLinks } = await query.graph({
    entity: "order_seller",
    fields: ["order_id", "seller_id"],
    filters: { order_id: req.params.id },
  });
  if (
    !sellerLinks.some(
      (link) =>
        String(link.order_id) === req.params.id &&
        String(link.seller_id) === sellerId,
    )
  ) {
    res.status(404).json({ message: "Order not found." } as never);
    return;
  }

  const { data: groupLinks } = await query.graph({
    entity: "order_group_order",
    fields: ["order_group_id", "order_id"],
    filters: { order_id: req.params.id },
  });
  const orderGroupId = groupLinks
    .map((link) => String(link.order_group_id ?? ""))
    .find(Boolean);
  if (!orderGroupId) {
    res.status(404).json({ message: "No order group is linked." } as never);
    return;
  }

  const result = await experienceAdminFetch(
    `/v1/seller/order-groups/${encodeURIComponent(orderGroupId)}/delivery-returns`,
    {
      actorId: req.auth_context?.actor_id ?? sellerId,
      sellerId,
    },
  );
  if (result.status >= 400) {
    res.status(result.status).json(result.body as never);
    return;
  }
  const body = result.body as unknown as VendorOrderDeliveryReturnsResponse;
  res.status(result.status).json({
    ...body,
    capabilities: {
      can_update_delivery: hasPermission(req, "delivery.update"),
      can_update_return: hasPermission(req, "return.respond"),
      can_decide_return: false,
      can_view_payment: hasPermission(req, "payment.read"),
      can_manage_refund: false,
      can_view_technical: false,
    },
  });
}
