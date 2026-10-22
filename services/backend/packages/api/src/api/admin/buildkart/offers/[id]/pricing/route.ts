import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import {
  loadOfferPricing,
  updateOfferPricing,
  type OfferPriceInput,
} from "../../../../../../lib/offer-pricing";
import { recordSellerPriceActivity } from "../../../../../../lib/seller-activity";

type PricingBody = {
  prices?: OfferPriceInput[];
  reason?: string;
};

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  try {
    const pricing = await loadOfferPricing(req.scope, req.params.id);
    res.json({ pricing });
  } catch (error) {
    const candidate = error as { type?: string; message?: string };
    res
      .status(candidate.type === "not_found" ? 404 : 422)
      .json({ message: candidate.message ?? "Could not load pricing." } as never);
  }
}

export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const body = (req.body ?? {}) as PricingBody;
  if (!Array.isArray(body.prices)) {
    res.status(422).json({ message: "prices must be an array." } as never);
    return;
  }
  try {
    const current = await loadOfferPricing(req.scope, req.params.id);
    const pricing = await updateOfferPricing(
      req.scope,
      req.params.id,
      body.prices,
    );
    const audit = await recordSellerPriceActivity({
      sellerId: pricing.seller_id,
      offerId: pricing.offer_id,
      productId: pricing.product_id,
      actorUserId: req.auth_context?.actor_id ?? "admin_console",
      actorRole: "admin",
      source: "admin_console",
      reason: body.reason ?? null,
      before: { prices: current.prices },
      after: { prices: pricing.prices },
    });
    res.json({ pricing, audit });
  } catch (error) {
    const candidate = error as { type?: string; message?: string };
    res
      .status(candidate.type === "not_found" ? 404 : 422)
      .json({ message: candidate.message ?? "Could not update pricing." } as never);
  }
}
