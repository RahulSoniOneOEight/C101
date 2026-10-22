import type { MedusaContainer } from "@medusajs/framework";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import { updateOffersWorkflow } from "@mercurjs/core/workflows";

export interface OfferPriceInput {
  id?: string;
  amount: number;
  currency_code: string;
  min_quantity?: number | null;
  max_quantity?: number | null;
  rules?: Record<string, string>;
}

export interface OfferPriceRow extends OfferPriceInput {
  id: string;
}

export interface OfferPricing {
  offer_id: string;
  seller_id: string;
  product_id: string | null;
  variant_id: string;
  sku: string;
  prices: OfferPriceRow[];
}

const MAX_TIERS = 10;

/**
 * Validates the offer price ladder before it reaches the canonical Mercur
 * update workflow. This is deliberately a guard around the existing engine,
 * not a second pricing evaluator.
 */
export function validateOfferPrices(prices: OfferPriceInput[]): string[] {
  const errors: string[] = [];
  if (!Array.isArray(prices) || prices.length === 0) {
    return ["At least one price is required."];
  }

  const ids = new Set<string>();
  const byCurrency = new Map<string, OfferPriceInput[]>();
  for (const [index, price] of prices.entries()) {
    if (!price || typeof price !== "object") {
      errors.push(`Price row ${index + 1} is invalid.`);
      continue;
    }
    if (price.id) {
      if (ids.has(price.id)) errors.push(`Price row ${index + 1} is duplicated.`);
      ids.add(price.id);
    }
    if (!Number.isFinite(price.amount) || !Number.isInteger(price.amount) || price.amount <= 0) {
      errors.push(`Price row ${index + 1} must be a positive amount in minor units.`);
    }
    if (typeof price.currency_code !== "string" || !/^[a-z]{3}$/.test(price.currency_code)) {
      errors.push(`Price row ${index + 1} must have a three-letter currency code.`);
      continue;
    }
    const list = byCurrency.get(price.currency_code) ?? [];
    list.push(price);
    byCurrency.set(price.currency_code, list);
  }

  for (const [currency, rows] of byCurrency) {
    const base = rows.filter(
      (row) => row.min_quantity === undefined || row.min_quantity === null,
    );
    if (base.length !== 1) {
      errors.push(`${currency.toUpperCase()} must have exactly one base price.`);
    }
    const baseAmount = base[0]?.amount ?? 0;
    const tiers = rows
      .filter((row) => row.min_quantity !== undefined && row.min_quantity !== null)
      .map((row) => ({
        min: Number(row.min_quantity),
        max:
          row.max_quantity === undefined || row.max_quantity === null
            ? null
            : Number(row.max_quantity),
        amount: Number(row.amount),
        index: rows.indexOf(row) + 1,
      }))
      .sort((left, right) => left.min - right.min);

    if (tiers.length > MAX_TIERS) {
      errors.push(`${currency.toUpperCase()} supports at most ${MAX_TIERS} quantity tiers.`);
    }

    for (const [index, tier] of tiers.entries()) {
      if (!Number.isInteger(tier.min) || tier.min < 2) {
        errors.push(`${currency.toUpperCase()} tier ${index + 1} must start at quantity 2 or more.`);
      }
      if (tier.max !== null && (!Number.isInteger(tier.max) || tier.max < tier.min)) {
        errors.push(`${currency.toUpperCase()} tier ${index + 1} has an invalid maximum quantity.`);
      }
      if (!Number.isFinite(tier.amount) || tier.amount > baseAmount) {
        errors.push(`${currency.toUpperCase()} tier ${index + 1} cannot cost more than the base price.`);
      }
      if (index > 0) {
        const previous = tiers[index - 1];
        if (previous.max === null || tier.min <= previous.max) {
          errors.push(`${currency.toUpperCase()} tier ${index + 1} overlaps the previous tier.`);
        }
        if (tier.amount > previous.amount) {
          errors.push(`${currency.toUpperCase()} tier ${index + 1} cannot cost more than a lower quantity tier.`);
        }
      }
    }
  }

  return [...new Set(errors)];
}

export async function loadOfferPricing(
  scope: MedusaContainer,
  offerId: string,
): Promise<OfferPricing> {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({
    entity: "offer",
    fields: [
      "id",
      "seller_id",
      "product_id",
      "variant_id",
      "sku",
      "prices.id",
      "prices.amount",
      "prices.currency_code",
      "prices.min_quantity",
      "prices.max_quantity",
      "prices.price_rules.attribute",
      "prices.price_rules.value",
    ],
    filters: { id: offerId },
  });
  const offer = data[0] as
    | {
        id: string;
        seller_id: string;
        product_id?: string | null;
        variant_id: string;
        sku: string;
        prices?: Array<{
          id: string;
          amount: number;
          currency_code: string;
          min_quantity?: number | null;
          max_quantity?: number | null;
          price_rules?: Array<{ attribute: string; value: string }>;
        }>;
      }
    | undefined;
  if (!offer) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Offer ${offerId} was not found.`);
  }
  return {
    offer_id: offer.id,
    seller_id: offer.seller_id,
    product_id: offer.product_id ?? null,
    variant_id: offer.variant_id,
    sku: offer.sku,
    prices: (offer.prices ?? []).map((price) => ({
      id: price.id,
      amount: Number(price.amount),
      currency_code: price.currency_code,
      min_quantity: price.min_quantity ?? null,
      max_quantity: price.max_quantity ?? null,
      rules: Object.fromEntries(
        (price.price_rules ?? [])
          .filter((rule) => rule.attribute !== "offer_id")
          .map((rule) => [rule.attribute, rule.value]),
      ),
    })),
  };
}

export async function updateOfferPricing(
  scope: MedusaContainer,
  offerId: string,
  prices: OfferPriceInput[],
): Promise<OfferPricing> {
  const errors = validateOfferPrices(prices);
  if (errors.length > 0) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, errors.join(" "));
  }
  await updateOffersWorkflow(scope as never).run({
    input: {
      offers: [
        {
          id: offerId,
          prices: prices.map((price) => ({
            ...(price.id ? { id: price.id } : {}),
            amount: price.amount,
            currency_code: price.currency_code,
            min_quantity: price.min_quantity ?? null,
            max_quantity: price.max_quantity ?? null,
            ...(price.rules && Object.keys(price.rules).length > 0
              ? { rules: price.rules }
              : {}),
          })),
        },
      ],
    },
  });
  return loadOfferPricing(scope, offerId);
}
