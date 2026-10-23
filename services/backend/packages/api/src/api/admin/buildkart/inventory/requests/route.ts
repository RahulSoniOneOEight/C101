import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { experienceAdminFetch } from "../../../../../lib/experience-admin";

type InventoryRequest = {
  offer_id?: string;
  quantity_delta?: number;
  reason?: string;
};

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const actorId =
    (req.auth_context as { actor_id?: string } | undefined)?.actor_id ??
    "admin_console";
  const query = new URLSearchParams();
  if (typeof req.query.status === "string" && req.query.status) {
    query.set("status", req.query.status);
  }
  if (typeof req.query.limit === "string" && req.query.limit) {
    query.set("limit", req.query.limit);
  }
  const result = await experienceAdminFetch("/v1/internal/inventory/requests", {
    method: "GET",
    actorId,
    query: query.toString(),
  });
  res.status(result.status).json(result.body as never);
}

export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
): Promise<void> {
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
    filters: { id: body.offer_id },
  });
  const offer = offers?.[0];
  if (!offer) {
    res.status(404).json({ message: "Offer not found." } as never);
    return;
  }

  const actorId =
    (req.auth_context as { actor_id?: string } | undefined)?.actor_id ??
    "admin_console";
  const result = await experienceAdminFetch("/v1/internal/inventory/request", {
    method: "POST",
    actorId,
    body: {
      sku: offer.sku,
      quantity_delta: body.quantity_delta,
      reason: body.reason.trim(),
      seller_id: offer.seller_id,
      offer_id: offer.id,
      product_id: offer.product_id ?? null,
      actor_role: "admin",
    },
  });
  res.status(result.status).json(result.body as never);
}
