import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import {
  loadOfferPricing,
  updateOfferPricing,
  type OfferPriceInput,
} from "../../../../../../lib/offer-pricing";

type PricingBody = {
  prices?: OfferPriceInput[];
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
    const pricing = await updateOfferPricing(
      req.scope,
      req.params.id,
      body.prices,
    );
    res.json({ pricing });
  } catch (error) {
    const candidate = error as { type?: string; message?: string };
    res
      .status(candidate.type === "not_found" ? 404 : 422)
      .json({ message: candidate.message ?? "Could not update pricing." } as never);
  }
}
