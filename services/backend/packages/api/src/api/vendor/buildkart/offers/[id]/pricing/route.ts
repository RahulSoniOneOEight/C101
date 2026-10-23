import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import {
  loadOfferPricing,
  updateOfferPricing,
  type OfferPriceInput,
} from "../../../../../../lib/offer-pricing";
import { vendorSellerId } from "../../../../../../lib/vendor-seller";
import { recordSellerPriceActivity } from "../../../../../../lib/seller-activity";
import type { MedusaContainer } from "@medusajs/framework";
import { hasPermission } from "../../../../../../lib/rbac";

type PricingBody = {
  prices?: OfferPriceInput[];
  reason?: string;
  list_price_minor?: number | null;
  gst_inclusive?: boolean;
  enforce_policy?: boolean;
};

async function loadForSeller(
  scope: MedusaContainer,
  sellerId: string,
  offerId: string,
) {
  const pricing = await loadOfferPricing(scope, offerId);
  if (pricing.seller_id !== sellerId) {
    return null;
  }
  return pricing;
}

function canManagePricing(req: AuthenticatedMedusaRequest): boolean {
  return hasPermission(req, "price.update");
}

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const sellerId = vendorSellerId(req);
  if (!sellerId) {
    res.status(401).json({ message: "Seller authentication required." } as never);
    return;
  }
  const pricing = await loadForSeller(req.scope, sellerId, req.params.id);
  if (!pricing) {
    res.status(404).json({ message: "Offer not found." } as never);
    return;
  }
  res.json({ pricing });
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
  if (!canManagePricing(req)) {
    res.status(403).json({
      message: "Only a seller administrator can change pricing.",
    } as never);
    return;
  }
  const body = (req.body ?? {}) as PricingBody;
  if (!Array.isArray(body.prices)) {
    res.status(422).json({ message: "prices must be an array." } as never);
    return;
  }
  const current = await loadForSeller(req.scope, sellerId, req.params.id);
  if (!current) {
    res.status(404).json({ message: "Offer not found." } as never);
    return;
  }
  try {
    const pricing = await updateOfferPricing(
      req.scope,
      req.params.id,
      body.prices,
      {
        list_price_minor: body.list_price_minor,
        gst_inclusive: body.gst_inclusive,
        reason: body.reason ?? null,
        enforce_policy: body.enforce_policy,
      },
    );
    const audit = await recordSellerPriceActivity({
      sellerId,
      offerId: pricing.offer_id,
      productId: pricing.product_id,
      actorUserId: req.auth_context?.actor_id ?? sellerId,
      actorRole: "seller",
      source: "seller_portal",
      reason: body.reason ?? null,
      before: {
        prices: current.prices,
        list_price_minor: current.list_price_minor,
        gst_inclusive: current.gst_inclusive,
      },
      after: {
        prices: pricing.prices,
        list_price_minor: pricing.list_price_minor,
        gst_inclusive: pricing.gst_inclusive,
      },
    });
    res.json({ pricing, audit });
  } catch (error) {
    const candidate = error as { type?: string; message?: string };
    const status = candidate.type === "not_found" ? 404 : 422;
    res
      .status(status)
      .json({ message: candidate.message ?? "Could not update pricing." } as never);
  }
}
