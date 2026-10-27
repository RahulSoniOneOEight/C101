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
    // The only order-wide offer. Its value and the item-percentage values below are reserved so
    // their worst-case sum never exceeds DISCOUNT_CEILING_PERCENT.
    code: "ORDER5",
    title: "Staging order 5% off",
    campaignKey: "BK-STG-CAMP-OFFER-LAB",
    mechanic: "order-percentage",
    trigger: "code",
    value: 5,
    usageLimit: 300,
    fundingSource: "marketplace",
    testData: true,
  },
  {
    // Item-scoped rather than order-scoped: a second order-wide offer would consume the whole
    // ceiling and leave no room for the line-level offers.
    code: "PIPES5",
    title: "Staging 5% off Pipes & Tanks above INR 15,000",
    campaignKey: "BK-STG-CAMP-OFFER-LAB",
    mechanic: "items-percentage",
    trigger: "code",
    value: 5,
    usageLimit: 300,
    categoryReference: "Pipes & Tanks",
    subtotalThreshold: 15000,
    fundingSource: "marketplace",
    testData: true,
  },
  {
    code: "TOOLS200",
    title: "Staging INR 200 off Pliers & Cutters",
    campaignKey: "BK-STG-CAMP-OFFER-LAB",
    mechanic: "items-fixed",
    trigger: "code",
    value: 200,
    usageLimit: 300,
    categoryReference: "Pliers & Cutters",
    fundingSource: "marketplace",
    testData: true,
  },
  {
    code: "QTY3",
    title: "Staging 5% off General Building Materials lines of 3 or more",
    campaignKey: "BK-STG-CAMP-OFFER-LAB",
    mechanic: "items-percentage",
    trigger: "code",
    value: 5,
    usageLimit: 300,
    categoryReference: "General Building Materials",
    minQuantity: 3,
    fundingSource: "marketplace",
    testData: true,
  },
  {
    code: "BOGO",
    title: "Staging buy 2 get 1 free (Adhesives)",
    campaignKey: "BK-STG-CAMP-OFFER-LAB",
    mechanic: "buyget",
    trigger: "code",
    value: 100,
    usageLimit: 200,
    categoryReference: "Adhesives",
    maxQuantity: 1,
    applyToQuantity: 1,
    buyRulesMinQuantity: 2,
    fundingSource: "marketplace",
    testData: true,
  },
  {
    code: "TRADEVIP",
    title: "Staging free shipping for trade accounts",
    campaignKey: "BK-STG-CAMP-OFFER-LAB",
    mechanic: "free-shipping",
    trigger: "code",
    value: 100,
    usageLimit: 300,
    customerGroup: "B2B Trade Customers",
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
 * U-003 — pilot flat offers.
 *
 * The always-on 5% offer and the 10% order code live in their own campaign so a bounded offer
 * lab cannot exhaust their budget mid-QC. Both are **code** promotions, never engine-automatic:
 * the Experience API applies FLAT5 itself and must be able to remove it. A true automatic
 * promotion is re-applied by the engine on every cart recalculation, which is the defect U-003
 * has to fix.
 */
export const PILOT_FLAT_OFFERS: StagingOffer[] = [
  {
    code: "FLAT5",
    title: "Pilot 5% off the order",
    campaignKey: "BK-STG-CAMP-PILOT-FLAT",
    mechanic: "order-percentage",
    trigger: "code",
    value: 5,
    // Applied by the Experience API on the first line; a large limit keeps it always-on in
    // staging without consuming the bounded offer lab.
    usageLimit: 10_000,
    fundingSource: "marketplace",
    testData: true,
  },
  {
    code: "ORDER10",
    title: "Pilot order 10% off (code)",
    campaignKey: "BK-STG-CAMP-PILOT-FLAT",
    mechanic: "order-percentage",
    trigger: "code",
    value: 10,
    usageLimit: 5_000,
    fundingSource: "marketplace",
    testData: true,
  },
];

export const PILOT_FLAT_OFFERS_CAMPAIGN = {
  campaignKey: "BK-STG-CAMP-PILOT-FLAT",
  title: "Pilot Flat Offers",
  // INR 500,000 of marketplace-funded spend; deliberately larger than the bounded offer lab
  // so an always-on offer cannot stop mid-QC.
  budgetAmountMinor: 50_000_000,
  currencyCode: "inr" as const,
  startsAt: "2026-10-01T00:00:00Z",
  endsAt: "2026-12-31T23:59:59Z",
  fundingSource: "marketplace" as const,
  testData: true as const,
};

/** Campaigns configured by the governed staging script, in declaration order. */
export const OFFER_CAMPAIGNS = [STAGING_OFFER_CAMPAIGN, PILOT_FLAT_OFFERS_CAMPAIGN];

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

  // The offer lab must not auto-apply discounts to live pilot carts.
  const automatic = STAGING_OFFERS.filter((offer) => offer.trigger === "automatic");
  if (automatic.length) {
    throw new Error(
      `Offer lab must be code-triggered while the pilot is live: ${automatic
        .map((offer) => offer.code)
        .join(", ")}`,
    );
  }
  if (!STAGING_OFFERS.some((offer) => offer.trigger === "code")) {
    throw new Error("The offer lab must include at least one code-triggered offer.");
  }
  if (!OFFER_PATTERNS.some((pattern) => pattern.id === "buyget")) {
    throw new Error("The pattern catalogue must document the buyget pattern.");
  }

  assertPilotFlatOfferInvariants();

  assertDiscountCeilingInvariant();
}

/**
 * U-003 pilot offers: code-triggered order percentages, marketplace-funded, in their own
 * campaign, never above the ceiling. Multiple order offers may coexist in the catalogue because
 * the storefront keeps exactly one offer applied per cart (that rule is runtime, not declarative).
 */
export function assertPilotFlatOfferInvariants(): void {
  const campaignKeys = new Set([PILOT_FLAT_OFFERS_CAMPAIGN.campaignKey]);
  const codes = new Set<string>();

  for (const offer of PILOT_FLAT_OFFERS) {
    if (codes.has(offer.code)) {
      throw new Error(`Duplicate pilot flat offer code: ${offer.code}`);
    }
    codes.add(offer.code);

    if (offer.fundingSource !== "marketplace") {
      throw new Error(`${offer.code} must be marketplace-funded.`);
    }
    if (!campaignKeys.has(offer.campaignKey)) {
      throw new Error(`${offer.code} references unknown campaign ${offer.campaignKey}.`);
    }
    if (offer.mechanic !== "order-percentage") {
      throw new Error(`${offer.code} must be an order-percentage offer.`);
    }
    if (offer.trigger !== "code") {
      throw new Error(`${offer.code} must be code-triggered, never engine-automatic.`);
    }

    // Building the payload surfaces ceiling and mechanic errors at declaration time.
    buildOffer({
      code: offer.code,
      mechanic: offer.mechanic,
      value: offer.value,
      automatic: false,
      usageLimit: offer.usageLimit,
    });
  }

  const highest = Math.max(...PILOT_FLAT_OFFERS.map((offer) => offer.value));
  if (highest > DISCOUNT_CEILING_PERCENT) {
    throw new Error(
      `Pilot flat offers exceed the ${DISCOUNT_CEILING_PERCENT}% staging discount ceiling.`,
    );
  }
}

/**
 * De-overlap guarantee: the ceiling is enforced per promotion, so the seeded set must be arranged
 * such that the worst-case cumulative rate on any line cannot exceed the ceiling.
 *
 *  - at most one order-wide percentage offer,
 *  - line-item percentage offers target distinct categories,
 *  - order-wide + the largest line-item percentage never exceed the ceiling.
 *
 * Fixed-amount and buyget offers are excluded: they are bounded by the line amount and the free
 * unit quantity respectively, not by a rate.
 */
export function assertDiscountCeilingInvariant(): void {
  const orderOffers = STAGING_OFFERS.filter(
    (offer) => offer.mechanic === "order-percentage",
  );
  if (orderOffers.length > 1) {
    throw new Error(
      `At most one order-wide percentage offer is allowed; found ${orderOffers
        .map((offer) => offer.code)
        .join(", ")}`,
    );
  }

  const lineOffers = STAGING_OFFERS.filter(
    (offer) => offer.mechanic === "items-percentage" || offer.mechanic === "items-fixed",
  );
  const scopes = lineOffers.map((offer) => offer.categoryReference ?? "unscoped");
  if (new Set(scopes).size !== scopes.length) {
    throw new Error(
      `Line-item offers must target distinct categories: ${scopes.join(", ")}`,
    );
  }

  const orderRate = orderOffers[0]?.value ?? 0;
  const maxLineRate = STAGING_OFFERS.filter(
    (offer) => offer.mechanic === "items-percentage",
  ).reduce((max, offer) => Math.max(max, offer.value), 0);

  if (orderRate + maxLineRate > DISCOUNT_CEILING_PERCENT) {
    throw new Error(
      `Worst-case cumulative discount ${orderRate}% + ${maxLineRate}% exceeds the ` +
        `${DISCOUNT_CEILING_PERCENT}% ceiling.`,
    );
  }
}
