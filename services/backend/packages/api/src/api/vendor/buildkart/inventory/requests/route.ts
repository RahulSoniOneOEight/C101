import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { experienceAdminFetch } from "../../../../../lib/experience-admin";
import { vendorSellerId } from "../../../../../lib/vendor-seller";

type InventoryRequest = {
  offer_id?: string;
  quantity_delta?: number;
  reason?: string;
};

function canManageInventory(req: AuthenticatedMedusaRequest): boolean {
  const role = (
    req as AuthenticatedMedusaRequest & {
      seller_context?: { seller_member?: { role_id?: string | null } };
    }
  ).seller_context?.seller_member?.role_id;
  return role === "role_seller_administration";
}

export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const sellerId = vendorSellerId(req);
  if (!sellerId) {
    res.status(401).json({ message: "Seller authentication required." } as never);
    return;
  }
  if (!canManageInventory(req)) {
    res.status(403).json({
      message: "Only a seller administrator can request inventory adjustments.",
    } as never);
    return;
  }

  const body = (req.body ?? {}) as InventoryRequest;
  if (!body.offer_id || !Number.isInteger(body.quantity_delta) || !body.reason?.trim()) {
    res.status(422).json({
      message: "offer_id, non-zero integer quantity_delta and reason are required.",
    } as never);
    return;
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data: offers } = await query.graph({
    entity: "offer",
    fields: ["id", "seller_id", "variant_id", "product_id", "sku"],
    filters: { id: body.offer_id, seller_id: sellerId },
  });
  const offer = offers?.[0];
  if (!offer) {
    res.status(404).json({ message: "Offer not found." } as never);
    return;
  }

  const actorId =
    (req.auth_context as { actor_id?: string } | undefined)?.actor_id ?? sellerId;
  const result = await experienceAdminFetch("/v1/internal/inventory/request", {
    method: "POST",
    actorId,
    sellerId,
    body: {
      sku: offer.sku,
      quantity_delta: body.quantity_delta,
      reason: body.reason.trim(),
      seller_id: sellerId,
      offer_id: offer.id,
      product_id: offer.product_id ?? null,
      actor_role: "seller",
    },
  });
  res.status(result.status).json(result.body as never);
}
