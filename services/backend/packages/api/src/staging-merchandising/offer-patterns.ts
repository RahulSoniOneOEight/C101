/**
 * CHG-030 — verified offer-pattern library.
 *
 * Every pattern here was proven against the installed promotion engine (promotion module 2.20.1)
 * by computing real cart actions. Do not add a pattern from documentation alone: several
 * commonly published configurations silently produce no discount.
 *
 * Verified facts:
 *  - Free shipping must be `percentage / 100` on `shipping_methods`. A `fixed / 0` value removes
 *    nothing.
 *  - SKU targeting resolves `items.variant.sku`. `items.product.variants.*` is not part of the
 *    cart context used for rule evaluation and never matches.
 *  - A quantity gate is evaluated **per line item** via a target rule. A promotion-level
 *    `items.quantity` rule fails outright and cannot express a cart-total unit count.
 *  - A campaign holds exactly one budget (DB unique on campaign_id). For a global cap plus a
 *    per-customer cap, use the promotion `limit` for the global cap and a `use_by_attribute`
 *    budget for the per-customer cap.
 *  - `use_by_attribute` requires the attribute in the compute context; `customer_id` is absent on
 *    guest carts, which raises an error rather than skipping the promotion.
 *  - Cart totals (`subtotal`) and campaign budgets are in currency major units.
 */

export const DISCOUNT_CEILING_PERCENT = 10;

export type OfferTrigger = "automatic" | "code";

export type OfferMechanic =
  | "order-percentage"
  | "items-percentage"
  | "items-fixed"
  | "free-shipping"
  | "shipping-percentage"
  | "buyget";

export interface OfferPatternDefinition {
  id: string;
  title: string;
  trigger: OfferTrigger;
  mechanic: OfferMechanic;
  summary: string;
  notes: string[];
}

export const OFFER_PATTERNS: OfferPatternDefinition[] = [
  {
    id: "order-percentage",
    title: "Percentage off the order",
    trigger: "code",
    mechanic: "order-percentage",
    summary: "application_method { type: percentage, target_type: order, value }",
    notes: ["Applies across eligible lines; allocation is forced to `across` for order targets."],
  },
  {
    id: "items-percentage",
    title: "Percentage off targeted items",
    trigger: "automatic",
    mechanic: "items-percentage",
    summary: "application_method { type: percentage, target_type: items, allocation: across }",
    notes: [
      "Line targeting uses target_rules on the application method.",
      "A quantity gate is a target rule, so it is evaluated per line item.",
    ],
  },
  {
    id: "items-fixed",
    title: "Fixed amount off targeted items",
    trigger: "code",
    mechanic: "items-fixed",
    summary: "application_method { type: fixed, target_type: items, value, currency_code }",
    notes: [
      "A fixed amount requires currency_code.",
      "SKU targeting must use `items.variant.sku`.",
    ],
  },
  {
    id: "free-shipping",
    title: "Free shipping (optionally above a cart value)",
    trigger: "automatic",
    mechanic: "free-shipping",
    summary: "application_method { type: percentage, target_type: shipping_methods, value: 100 }",
    notes: [
      "Never use a fixed zero value; it produces no adjustment.",
      "A cart-value gate is a promotion-level rule on `subtotal` (major units).",
      "Campaign spend budgets do apply to shipping adjustments.",
    ],
  },
  {
    id: "shipping-percentage",
    title: "Percentage off shipping",
    trigger: "automatic",
    mechanic: "shipping-percentage",
    summary: "application_method { type: percentage, target_type: shipping_methods, value }",
    notes: [
      "Use value 100 for free shipping; any lower value is a partial shipping discount.",
      "Usually combined with a customer-group rule.",
    ],
  },
  {
    id: "buyget",
    title: "Buy X get Y free",
    trigger: "code",
    mechanic: "buyget",
    summary: "type: buyget with buy_rules, target_rules, apply_to_quantity and max_quantity",
    notes: [
      "max_quantity is required when allocation is `each`.",
      "buyget promotions are applied before standard promotions.",
    ],
  },
];

export interface OfferBuildInput {
  code: string;
  mechanic: OfferMechanic;
  value: number;
  automatic: boolean;
  usageLimit?: number;
  currencyCode?: string;
  /** Line targeting. */
  categoryId?: string;
  sku?: string;
  minQuantity?: number;
  /** Order-level gate in currency major units. */
  subtotalThreshold?: number;
  /** Promotion-level customer-group gate. */
  customerGroupId?: string;
  /** buyget only. */
  maxQuantity?: number;
  applyToQuantity?: number;
  buyRulesMinQuantity?: number;
}

interface Rule {
  attribute: string;
  operator: "gte" | "eq" | "in";
  values: string[];
}

/** Build a Medusa promotion payload, failing closed on configurations that produce no discount. */
export function buildOffer(input: OfferBuildInput) {
  // The ceiling is a percentage guard. A `fixed` value is an absolute currency amount, and
  // buyget's 100 means "100% off the free unit", so neither is a rate.
  const percentageMechanics: OfferMechanic[] = [
    "order-percentage",
    "items-percentage",
    "shipping-percentage",
  ];
  if (percentageMechanics.includes(input.mechanic) && input.value > DISCOUNT_CEILING_PERCENT) {
    throw new Error(
      `${input.code} exceeds the ${DISCOUNT_CEILING_PERCENT}% staging discount ceiling.`,
    );
  }

  const targetRule = (): Rule[] => {
    if (input.sku) {
      // Verified: `items.product.variants.sku` never matches the cart context.
      return [{ attribute: "items.variant.sku", operator: "eq", values: [input.sku] }];
    }
    if (input.categoryId) {
      return [
        { attribute: "items.product.categories.id", operator: "in", values: [input.categoryId] },
      ];
    }
    return [];
  };

  const quantityRule: Rule[] = input.minQuantity
    ? [{ attribute: "items.quantity", operator: "gte", values: [String(input.minQuantity)] }]
    : [];

  const rules: Rule[] = input.subtotalThreshold
    ? [
        {
          attribute: "subtotal",
          operator: "gte",
          values: [String(input.subtotalThreshold)],
        },
      ]
    : [];
  if (input.customerGroupId) {
    rules.push({
      attribute: "customer.groups.id",
      operator: "eq",
      values: [input.customerGroupId],
    });
  }

  const base = {
    code: input.code,
    status: "active" as const,
    is_automatic: input.automatic,
    ...(input.usageLimit ? { limit: input.usageLimit } : {}),
    ...(rules.length ? { rules } : {}),
  };

  switch (input.mechanic) {
    case "order-percentage":
      return {
        ...base,
        type: "standard" as const,
        application_method: {
          type: "percentage" as const,
          target_type: "order" as const,
          value: input.value,
        },
      };
    case "items-percentage":
      return {
        ...base,
        type: "standard" as const,
        application_method: {
          type: "percentage" as const,
          target_type: "items" as const,
          allocation: "across" as const,
          value: input.value,
          target_rules: [...targetRule(), ...quantityRule],
        },
      };
    case "items-fixed":
      return {
        ...base,
        type: "standard" as const,
        application_method: {
          type: "fixed" as const,
          target_type: "items" as const,
          allocation: "across" as const,
          value: input.value,
          currency_code: input.currencyCode ?? "inr",
          target_rules: [...targetRule(), ...quantityRule],
        },
      };
    case "free-shipping":
      if (input.value !== 100) {
        throw new Error(
          `${input.code}: free shipping must be value 100 (percentage on shipping_methods). ` +
            "A fixed zero value produces no discount.",
        );
      }
      return {
        ...base,
        type: "standard" as const,
        application_method: {
          type: "percentage" as const,
          target_type: "shipping_methods" as const,
          allocation: "across" as const,
          value: 100,
        },
      };
    case "shipping-percentage":
      return {
        ...base,
        type: "standard" as const,
        application_method: {
          type: "percentage" as const,
          target_type: "shipping_methods" as const,
          allocation: "across" as const,
          value: input.value,
        },
      };
    case "buyget":
      return {
        ...base,
        type: "buyget" as const,
        application_method: {
          type: "percentage" as const,
          target_type: "items" as const,
          allocation: "each" as const,
          value: 100,
          max_quantity: input.maxQuantity ?? 1,
          apply_to_quantity: input.applyToQuantity ?? 1,
          buy_rules_min_quantity: input.buyRulesMinQuantity ?? 2,
          buy_rules: targetRule(),
          target_rules: targetRule(),
        },
      };
    default: {
      const exhaustive: never = input.mechanic;
      throw new Error(`Unknown offer mechanic: ${String(exhaustive)}`);
    }
  }
}

/** Concrete bounded-staging offers exercising each mechanic. */
export interface StagingOffer {
  code: string;
  title: string;
  campaignKey: string;
  mechanic: OfferMechanic;
  trigger: OfferTrigger;
  value: number;
  usageLimit: number;
  categoryReference?: string;
  sku?: string;
  minQuantity?: number;
  subtotalThreshold?: number;
  customerGroup?: string;
  maxQuantity?: number;
  applyToQuantity?: number;
  buyRulesMinQuantity?: number;
  fundingSource: "marketplace";
  testData: true;
}

export const STAGING_OFFERS: StagingOffer[] = [
  {
    code: "BK-STG-OFFER-ORDER10",
    title: "Staging order 10% off",
    campaignKey: "BK-STG-CAMP-OFFER-LAB",
    mechanic: "order-percentage",
    trigger: "code",
    value: 10,
    usageLimit: 300,
    fundingSource: "marketplace",
    testData: true,
  },
  {
    code: "BK-STG-OFFER-CART8",
    title: "Staging 8% off above INR 15,000",
    campaignKey: "BK-STG-CAMP-OFFER-LAB",
    mechanic: "order-percentage",
    trigger: "code",
    value: 8,
    usageLimit: 300,
    subtotalThreshold: 15000,
    fundingSource: "marketplace",
    testData: true,
  },
  {
    code: "BK-STG-OFFER-TOOLS-FIXED",
    title: "Staging INR 200 off Power Tools",
    campaignKey: "BK-STG-CAMP-OFFER-LAB",
    mechanic: "items-fixed",
    trigger: "code",
    value: 200,
    usageLimit: 300,
    categoryReference: "Power Tools",
    fundingSource: "marketplace",
    testData: true,
  },
  {
    code: "BK-STG-OFFER-QTY3",
    title: "Staging 8% off lines of 3 or more",
    campaignKey: "BK-STG-CAMP-OFFER-LAB",
    mechanic: "items-percentage",
    trigger: "automatic",
    value: 8,
    usageLimit: 300,
    categoryReference: "Building Materials",
    minQuantity: 3,
    fundingSource: "marketplace",
    testData: true,
  },
  {
    code: "BK-STG-OFFER-BOGO",
    title: "Staging buy 2 get 1 free (Safety Gear)",
    campaignKey: "BK-STG-CAMP-OFFER-LAB",
    mechanic: "buyget",
    trigger: "code",
    value: 100,
    usageLimit: 200,
    categoryReference: "Safety Gear",
    maxQuantity: 1,
    applyToQuantity: 1,
    buyRulesMinQuantity: 2,
    fundingSource: "marketplace",
    testData: true,
  },
  {
    code: "BK-STG-OFFER-VIPSHIP",
    title: "Staging 10% off shipping for trade accounts",
    campaignKey: "BK-STG-CAMP-OFFER-LAB",
    mechanic: "shipping-percentage",
    trigger: "automatic",
    value: 10,
    usageLimit: 300,
    customerGroup: "trade-verified",
    fundingSource: "marketplace",
    testData: true,
  },
];

export const STAGING_OFFER_CAMPAIGN = {
  campaignKey: "BK-STG-CAMP-OFFER-LAB",
  title: "Staging Offer Lab",
  budgetAmountMinor: 20_000_000,
  currencyCode: "inr" as const,
  startsAt: "2026-10-10T00:00:00Z",
  endsAt: "2026-12-31T23:59:59Z",
  fundingSource: "marketplace" as const,
  testData: true as const,
};

/**
 * Contract-shaped catalogue for the CHG-030 offer lab, returned by the read-only operator route.
 */
export function merchandisingOfferCatalogue() {
  const targetTypeFor = (offer: StagingOffer): "order" | "items" | "shipping_methods" => {
    switch (offer.mechanic) {
      case "order-percentage":
        return "order";
      case "free-shipping":
      case "shipping-percentage":
        return "shipping_methods";
      default:
        return "items";
    }
  };

  return {
    change_id: "CHG-030" as const,
    environment: "staging" as const,
    generated_at: new Date().toISOString(),
    funding_source: "marketplace" as const,
    discount_ceiling_percent: DISCOUNT_CEILING_PERCENT,
    test_data: true as const,
    payment_mode: "simulated" as const,
    campaign: {
      campaign_key: STAGING_OFFER_CAMPAIGN.campaignKey,
      title: STAGING_OFFER_CAMPAIGN.title,
      budget_amount_minor: STAGING_OFFER_CAMPAIGN.budgetAmountMinor,
      currency_code: STAGING_OFFER_CAMPAIGN.currencyCode,
      starts_at: STAGING_OFFER_CAMPAIGN.startsAt,
      ends_at: STAGING_OFFER_CAMPAIGN.endsAt,
      funding_source: STAGING_OFFER_CAMPAIGN.fundingSource,
      policy_pending: true as const,
      test_data: true as const,
    },
    offers: STAGING_OFFERS.map((offer) => ({
      code: offer.code,
      title: offer.title,
      mechanic: offer.mechanic,
      trigger: offer.trigger,
      value: offer.value,
      usage_limit: offer.usageLimit,
      target: {
        type: targetTypeFor(offer),
        reference: offer.categoryReference ?? offer.sku ?? null,
      },
      subtotal_threshold: offer.subtotalThreshold ?? null,
      min_quantity: offer.minQuantity ?? null,
      customer_group: offer.customerGroup ?? null,
      max_quantity: offer.maxQuantity ?? null,
      apply_to_quantity: offer.applyToQuantity ?? null,
      buy_rules_min_quantity: offer.buyRulesMinQuantity ?? null,
      funding_source: offer.fundingSource,
      policy_pending: true as const,
      test_data: true as const,
    })),
  };
}

/**
 * Fail closed if any declared offer is marketplace-unfunded, references an unknown campaign,
 * duplicates a code, or cannot be built into a valid engine payload.
 */
export function assertOfferInvariants(): void {
  const codes = new Set<string>();
  const campaignKeys = new Set([STAGING_OFFER_CAMPAIGN.campaignKey]);

  for (const offer of STAGING_OFFERS) {
    if (codes.has(offer.code)) {
      throw new Error(`Duplicate offer code: ${offer.code}`);
    }
    codes.add(offer.code);

    if (offer.fundingSource !== "marketplace") {
      throw new Error(`${offer.code} must be marketplace-funded.`);
    }
    if (!campaignKeys.has(offer.campaignKey)) {
      throw new Error(`${offer.code} references unknown campaign ${offer.campaignKey}.`);
    }
    if (offer.mechanic === "free-shipping" && offer.value !== 100) {
      throw new Error(
        `${offer.code}: free shipping must be value 100, never a fixed zero discount.`,
      );
    }

    // Building the payload surfaces ceiling and mechanic errors at declaration time.
    buildOffer({
      code: offer.code,
      mechanic: offer.mechanic,
      value: offer.value,
      automatic: offer.trigger === "automatic",
      usageLimit: offer.usageLimit,
      categoryId: offer.categoryReference ? "pcat_declared" : undefined,
      sku: offer.sku,
      minQuantity: offer.minQuantity,
      subtotalThreshold: offer.subtotalThreshold,
      customerGroupId: offer.customerGroup ? "cusgroup_declared" : undefined,
      maxQuantity: offer.maxQuantity,
      applyToQuantity: offer.applyToQuantity,
      buyRulesMinQuantity: offer.buyRulesMinQuantity,
    });
  }

  if (!STAGING_OFFERS.some((offer) => offer.trigger === "automatic")) {
    throw new Error("The offer lab must include at least one automatic offer.");
  }
  if (!STAGING_OFFERS.some((offer) => offer.trigger === "code")) {
    throw new Error("The offer lab must include at least one code-triggered offer.");
  }
  if (!OFFER_PATTERNS.some((pattern) => pattern.id === "buyget")) {
    throw new Error("The pattern catalogue must document the buyget pattern.");
  }
}
