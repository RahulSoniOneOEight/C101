import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { experienceAdminFetch } from "../../../../../lib/experience-admin";
import { vendorSellerId } from "../../../../../lib/vendor-seller";

export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const sellerId = vendorSellerId(req);
  if (!sellerId) {
    res.status(401).json({ message: "Seller authentication required." } as never);
    return;
  }
  const body = (req.body ?? {}) as { skus?: string[] };
  const requested = Array.isArray(body.skus)
    ? Array.from(new Set(body.skus.map((sku) => String(sku ?? "").trim()).filter(Boolean)))
    : [];
  if (requested.length === 0) {
    res.json({ items: [] });
    return;
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data: offers } = await query.graph({
    entity: "offer",
    fields: ["id", "sku"],
    filters: { seller_id: sellerId, sku: requested },
    pagination: { take: 200, skip: 0 },
  });
  const allowed = Array.from(
    new Set((offers ?? []).map((offer: { sku?: string }) => offer.sku).filter(Boolean)),
  );
  if (allowed.length === 0) {
    res.json({ items: [] });
    return;
  }

  const actorId =
    (req.auth_context as { actor_id?: string } | undefined)?.actor_id ?? sellerId;
  const result = await experienceAdminFetch("/v1/internal/inventory/summary", {
    method: "POST",
    actorId,
    sellerId,
    body: { skus: allowed },
  });
  res.status(result.status).json(result.body as never);
}
