import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import {
  loadB2bPricing,
  saveB2bPricing,
  type B2bPricingInput,
} from "../../../../../../lib/b2b-pricing";
import { loadOfferPricing } from "../../../../../../lib/offer-pricing";
import { hasPermission } from "../../../../../../lib/rbac";
import { vendorSellerId } from "../../../../../../lib/vendor-seller";
import { recordSellerPriceActivity } from "../../../../../../lib/seller-activity";

type Body = B2bPricingInput & { correlation_id?: string | null };

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const sellerId = vendorSellerId(req);
  if (!sellerId) {
    res.status(401).json({ message: "Seller authentication required." } as never);
    return;
  }
  if (!hasPermission(req, "price.read")) {
    res.status(403).json({ message: "Missing permission: price.read." } as never);
    return;
  }
  try {
    const offer = await loadOfferPricing(req.scope, req.params.id);
    if (offer.seller_id !== sellerId) {
      res.status(404).json({ message: "Offer not found." } as never);
      return;
    }
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
  const sellerId = vendorSellerId(req);
  if (!sellerId) {
    res.status(401).json({ message: "Seller authentication required." } as never);
    return;
  }
  if (!hasPermission(req, "b2b-price.update")) {
    res.status(403).json({ message: "Missing permission: b2b-price.update." } as never);
    return;
  }
  const body = (req.body ?? {}) as Body;
  try {
    const offer = await loadOfferPricing(req.scope, req.params.id);
    if (offer.seller_id !== sellerId) {
      res.status(404).json({ message: "Offer not found." } as never);
      return;
    }
    const before = await loadB2bPricing(req.scope, req.params.id);
    const pricing = await saveB2bPricing(req.scope, req.params.id, body);
    const audit = await recordSellerPriceActivity({
      sellerId,
      offerId: req.params.id,
      productId: offer.product_id,
      actorUserId: req.auth_context?.actor_id ?? sellerId,
      actorRole: "seller",
      channel: "b2b",
      source: "seller_portal",
      reason: body.reason ?? null,
      correlationId: body.correlation_id ?? null,
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
