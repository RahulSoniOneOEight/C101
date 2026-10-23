import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { experienceAdminFetch } from "../../../../../lib/experience-admin";
import { resolveActingFor } from "../../../../../lib/acting-for";
import { hasPermission } from "../../../../../lib/rbac";

type InventoryRequest = {
  offer_id?: string;
  quantity_delta?: number;
  reason?: string;
  acting_for_seller_id?: string | null;
  reference?: string | null;
  correlation_id?: string | null;
  expected_version?: string | null;
};

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  if (!hasPermission(req, "inventory-adjustment.read")) {
    res.status(403).json({
      message: "Missing permission: inventory-adjustment.read.",
    } as never);
    return;
  }
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
  if (!hasPermission(req, "inventory-adjustment.submit")) {
    res.status(403).json({
      message: "Missing permission: inventory-adjustment.submit.",
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
    filters: { id: body.offer_id },
  });
  const offer = offers?.[0];
  if (!offer) {
    res.status(404).json({ message: "Offer not found." } as never);
    return;
  }

  try {
    const acting = await resolveActingFor(req.scope, req, body);
    if (acting && acting.sellerId !== offer.seller_id) {
      res.status(403).json({
        message: "The acting-for seller does not own this offer.",
      } as never);
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
        reason: acting ? `${body.reason.trim()} [acting_for=${acting.sellerId}]` : body.reason.trim(),
        seller_id: offer.seller_id,
        offer_id: offer.id,
        product_id: offer.product_id ?? null,
        actor_role: "admin",
        acting_for_seller_id: acting?.sellerId ?? null,
        reference: acting?.reference ?? null,
        correlation_id: acting?.correlationId ?? null,
      },
    });
    res.status(result.status).json(result.body as never);
  } catch (error) {
    const candidate = error as { type?: string; message?: string };
    res
      .status(candidate.type === "not_found" ? 404 : 422)
      .json({ message: candidate.message ?? "Could not create request." } as never);
  }
}
