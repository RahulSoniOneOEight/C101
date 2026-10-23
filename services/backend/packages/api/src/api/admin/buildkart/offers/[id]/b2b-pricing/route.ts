import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import {
  loadB2bPricing,
  saveB2bPricing,
  type B2bPricingInput,
} from "../../../../../../lib/b2b-pricing";
import { resolveActingFor } from "../../../../../../lib/acting-for";
import { hasPermission } from "../../../../../../lib/rbac";
import { recordSellerPriceActivity } from "../../../../../../lib/seller-activity";
import { loadOfferPricing } from "../../../../../../lib/offer-pricing";

type Body = B2bPricingInput & {
  acting_for_seller_id?: string | null;
  reference?: string | null;
  correlation_id?: string | null;
};

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  if (!hasPermission(req, "price.read")) {
    res.status(403).json({ message: "Missing permission: price.read." } as never);
    return;
  }
  try {
    res.json({ pricing: await loadB2bPricing(req.scope, req.params.id) });
  } catch (error) {
    const candidate = error as { type?: string; message?: string };
    res.status(candidate.type === "not_found" ? 404 : 422).json({
      message: candidate.message ?? "Could not load B2B pricing.",
    } as never);
  }
}

export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  if (!hasPermission(req, "b2b-price.update")) {
    res.status(403).json({ message: "Missing permission: b2b-price.update." } as never);
    return;
  }
  const body = (req.body ?? {}) as Body;
  try {
    const acting = await resolveActingFor(req.scope, req, body);
    const offer = await loadOfferPricing(req.scope, req.params.id);
    if (acting && acting.sellerId !== offer.seller_id) {
      res.status(403).json({
        message: "The acting-for seller does not own this offer.",
      } as never);
      return;
    }
    const before = await loadB2bPricing(req.scope, req.params.id);
    const pricing = await saveB2bPricing(req.scope, req.params.id, body);
    const audit = await recordSellerPriceActivity({
      sellerId: offer.seller_id,
      offerId: req.params.id,
      actorUserId: acting?.actorUserId ?? req.auth_context?.actor_id ?? "admin_console",
      actorRole: "admin",
      source: "admin_console",
      reason: acting?.reason ?? body.reason ?? null,
      actingForSellerId: acting?.sellerId ?? null,
      reference: acting?.reference ?? null,
      correlationId: acting?.correlationId ?? null,
      before,
      after: pricing,
    });
    res.json({ pricing, audit });
  } catch (error) {
    const candidate = error as { type?: string; message?: string };
    res.status(candidate.type === "not_found" ? 404 : 422).json({
      message: candidate.message ?? "Could not update B2B pricing.",
    } as never);
  }
}
