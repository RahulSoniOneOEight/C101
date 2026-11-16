import {
  validateB2bPricing,
  type B2bPricingInput,
  type B2bTierInput,
} from "./b2b-pricing";

/**
 * Parse and validate the optional B2B columns of one product-import row.
 *
 * All validation happens before any product, offer, price or stock write, so an invalid tier or
 * price fails the row in both validate and apply mode instead of leaving a partially created
 * product behind.
 */

const clean = (value: unknown) => String(value ?? "").trim();

const moneyMinor = (value: string) => {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : null;
};

/** "5:950|10:900" -> tiers with computed ranges; malformed entries are errors, never silently dropped. */
export function parseImportTiers(raw: string): {
  tiers: B2bTierInput[];
  errors: string[];
} {
  const tiers: B2bTierInput[] = [];
  const errors: string[] = [];
  for (const entry of raw.split("|").map((value) => value.trim()).filter(Boolean)) {
    const [minRaw, amountRaw] = entry.split(":");
    const min = Number(clean(minRaw));
    const amount = Number(clean(amountRaw));
    if (!Number.isInteger(min) || min < 2) {
      errors.push(`B2B tier "${entry}" must start at quantity 2 or more.`);
      continue;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      errors.push(`B2B tier "${entry}" must have a positive price.`);
      continue;
    }
    tiers.push({ min_quantity: min, max_quantity: null, amount: Math.round(amount * 100) });
  }
  tiers.sort((left, right) => left.min_quantity - right.min_quantity);
  tiers.forEach((tier, index, all) => {
    tier.max_quantity = index < all.length - 1 ? all[index + 1].min_quantity - 1 : null;
  });
  return { tiers, errors };
}

export function parseImportB2bPricing(row: {
  b2b_list_price?: unknown;
  b2b_selling_price?: unknown;
  b2b_moq?: unknown;
  b2b_tiers?: unknown;
}): { pricing: B2bPricingInput | null; errors: string[] } {
  const errors: string[] = [];
  const sellingRaw = clean(row.b2b_selling_price);
  const listRaw = clean(row.b2b_list_price);
  const moqRaw = clean(row.b2b_moq);
  const tiersRaw = clean(row.b2b_tiers);

  if (!sellingRaw) {
    if (listRaw || moqRaw || tiersRaw) {
      errors.push(
        "b2b_selling_price is required when B2B list price, MOQ or tiers are provided.",
      );
    }
    return { pricing: null, errors };
  }

  const amount = moneyMinor(sellingRaw);
  if (amount === null) {
    errors.push("b2b_selling_price must be a positive number.");
    return { pricing: null, errors };
  }
  const list = listRaw ? moneyMinor(listRaw) : amount;
  if (list === null) {
    errors.push("b2b_list_price must be a positive number.");
    return { pricing: null, errors };
  }
  const moq = moqRaw ? Number(moqRaw) : 1;
  const parsed = parseImportTiers(tiersRaw);
  errors.push(...parsed.errors);

  const pricing: B2bPricingInput = {
    amount,
    list_price_minor: list,
    moq,
    tiers: parsed.tiers,
  };
  try {
    validateB2bPricing(pricing);
  } catch (error) {
    const message = (error as Error).message;
    if (!errors.includes(message)) errors.push(message);
  }
  return { pricing, errors };
}
