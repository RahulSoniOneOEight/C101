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
import type { MedusaContainer } from "@medusajs/framework";

type PricingBody = {
  prices?: OfferPriceInput[];
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
    );
    res.json({ pricing });
  } catch (error) {
    const candidate = error as { type?: string; message?: string };
    const status = candidate.type === "not_found" ? 404 : 422;
    res
      .status(status)
      .json({ message: candidate.message ?? "Could not update pricing." } as never);
  }
}
