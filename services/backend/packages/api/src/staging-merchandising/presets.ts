/**
 * CHG-029 bounded-staging merchandising presets — declarative and reviewable.
 *
 * Medusa owns promotions and campaigns; Mercur owns curated collections; the CMS or governed
 * editorial source owns campaign copy. Every preset is marketplace-funded, which means a preset
 * promotion is intentionally NOT linked to any seller (`promotion_seller`) and therefore applies
 * as a marketplace-wide cart adjustment.
 *
 * `target` holds only what the Medusa promotion engine can actually evaluate. Conditions that
 * policy intends but the engine cannot enforce are recorded in `deferredConditions` so they are
 * never mistaken for enforced behaviour.
 */

export const DISCOUNT_CEILING_PERCENT = 10;
export const MERCHANDISING_FUNDING_SOURCE = "marketplace";
export const TRADE_CUSTOMER_GROUP_NAME = "trade-verified";

export type MerchandisingApplicationMethod = "percentage" | "free_shipping";

export type MerchandisingPromotionTargetType =
  | "category"
  | "collection"
  | "product"
  | "product_type"
  | "seller"
  | "shipping_methods";

export interface MerchandisingPromotionTarget {
  type: MerchandisingPromotionTargetType;
  reference: string;
  customerGroup?: string;
}

export interface DeferredCondition {
  condition: string;
  value: string;
  reason: string;
}

export interface MerchandisingPromotionPreset {
  code: string;
  campaignKey: string;
  applicationMethod: MerchandisingApplicationMethod;
  /** Percent for `percentage`; ignored for `free_shipping`. */
  value: number;
  target: MerchandisingPromotionTarget;
  automatic: boolean;
  startsAt: string;
  endsAt: string;
  usageLimit: number;
  fundingSource: typeof MERCHANDISING_FUNDING_SOURCE;
  policyPending: true;
  testData: true;
  deferredConditions: DeferredCondition[];
}

export interface MerchandisingCampaignPreset {
  campaignKey: string;
  title: string;
  promotionCodes: string[];
  budgetAmountMinor: number;
  currencyCode: "inr";
  startsAt: string;
  endsAt: string;
  fundingSource: typeof MERCHANDISING_FUNDING_SOURCE;
  policyPending: true;
  testData: true;
}

export interface MerchandisingCollectionPreset {
  collectionKey: string;
  title: string;
  type: "manual";
  categories: string[];
  enabled: true;
  status: "enabled";
  testData: true;
}

export interface MerchandisingContentPreset {
  id: string;
  contentType: "banner" | "onboarding" | "campaign-copy";
  placement: string;
  locale: "en-IN" | "hi-IN";
  title: string;
  body: string;
  actionLabel: string | null;
  actionUri: string | null;
  version: string;
  campaignKey: string;
  testData: true;
}

export const MERCHANDISING_COLLECTION_PRESETS: MerchandisingCollectionPreset[] = [
  {
    collectionKey: "monsoon-site-essentials",
    title: "Monsoon Site Essentials",
    type: "manual",
    categories: ["Building Materials", "Safety Gear"],
    enabled: true,
    status: "enabled",
    testData: true,
  },
  {
    collectionKey: "power-tool-week",
    title: "Power Tool Week",
    type: "manual",
    categories: ["Power Tools"],
    enabled: true,
    status: "enabled",
    testData: true,
  },
  {
    collectionKey: "plumbing-refresh",
    title: "Plumbing Refresh",
    type: "manual",
    categories: ["Pipes & Fittings", "Faucets & Showers"],
    enabled: true,
    status: "enabled",
    testData: true,
  },
  {
    collectionKey: "electrical-safety",
    title: "Electrical Safety",
    type: "manual",
    categories: ["Wiring & Cables", "Lighting", "Switches & Sockets"],
    enabled: true,
    status: "enabled",
    testData: true,
  },
];

export const MERCHANDISING_PROMOTION_PRESETS: MerchandisingPromotionPreset[] = [
  {
    code: "BK-STG-PROMO-TOOLS10",
    campaignKey: "BK-STG-CAMP-POWER-TOOL-WEEK",
    applicationMethod: "percentage",
    value: 10,
    target: { type: "category", reference: "Power Tools" },
    automatic: false,
    startsAt: "2026-10-20T00:00:00Z",
    endsAt: "2026-11-03T23:59:59Z",
    usageLimit: 500,
    fundingSource: MERCHANDISING_FUNDING_SOURCE,
    policyPending: true,
    testData: true,
    deferredConditions: [],
  },
  {
    code: "BK-STG-PROMO-PLY-BULK",
    campaignKey: "BK-STG-CAMP-SITE-READY",
    applicationMethod: "percentage",
    value: 5,
    target: { type: "category", reference: "Plywood & Boards" },
    automatic: true,
    startsAt: "2026-10-15T00:00:00Z",
    endsAt: "2026-11-30T23:59:59Z",
    usageLimit: 200,
    fundingSource: MERCHANDISING_FUNDING_SOURCE,
    policyPending: true,
    testData: true,
    deferredConditions: [
      {
        condition: "min_quantity",
        value: "10",
        reason:
          "Medusa standard promotions expose no minimum-item-quantity rule attribute; only buyget supports buy_rules_min_quantity. The pilot applies the category discount without the quantity gate.",
      },
    ],
  },
  {
    code: "BK-STG-PROMO-FREESHIP",
    campaignKey: "BK-STG-CAMP-POWER-TOOL-WEEK",
    applicationMethod: "free_shipping",
    value: 0,
    target: { type: "shipping_methods", reference: "shipping_methods" },
    automatic: false,
    startsAt: "2026-10-20T00:00:00Z",
    endsAt: "2026-11-03T23:59:59Z",
    usageLimit: 500,
    fundingSource: MERCHANDISING_FUNDING_SOURCE,
    policyPending: true,
    testData: true,
    deferredConditions: [
      {
        condition: "min_subtotal_minor",
        value: "500000",
        reason:
          "No supported promotion rule attribute evaluates a cart subtotal threshold. The pilot applies free shipping without the minimum-order-value gate.",
      },
    ],
  },
  {
    code: "BK-STG-PROMO-SAFETY-B2B",
    campaignKey: "BK-STG-CAMP-SITE-READY",
    applicationMethod: "percentage",
    value: 7,
    target: {
      type: "category",
      reference: "Safety Gear",
      customerGroup: TRADE_CUSTOMER_GROUP_NAME,
    },
    automatic: false,
    startsAt: "2026-10-15T00:00:00Z",
    endsAt: "2026-11-30T23:59:59Z",
    usageLimit: 150,
    fundingSource: MERCHANDISING_FUNDING_SOURCE,
    policyPending: true,
    testData: true,
    deferredConditions: [],
  },
];

export const MERCHANDISING_CAMPAIGN_PRESETS: MerchandisingCampaignPreset[] = [
  {
    campaignKey: "BK-STG-CAMP-POWER-TOOL-WEEK",
    title: "Power Tool Week",
    promotionCodes: ["BK-STG-PROMO-TOOLS10", "BK-STG-PROMO-FREESHIP"],
    budgetAmountMinor: 50_000_000,
    currencyCode: "inr",
    startsAt: "2026-10-20T00:00:00Z",
    endsAt: "2026-11-03T23:59:59Z",
    fundingSource: MERCHANDISING_FUNDING_SOURCE,
    policyPending: true,
    testData: true,
  },
  {
    campaignKey: "BK-STG-CAMP-SITE-READY",
    title: "Site Ready",
    promotionCodes: ["BK-STG-PROMO-PLY-BULK", "BK-STG-PROMO-SAFETY-B2B"],
    budgetAmountMinor: 40_000_000,
    currencyCode: "inr",
    startsAt: "2026-10-15T00:00:00Z",
    endsAt: "2026-11-30T23:59:59Z",
    fundingSource: MERCHANDISING_FUNDING_SOURCE,
    policyPending: true,
    testData: true,
  },
];

export const MERCHANDISING_CONTENT_PRESETS: MerchandisingContentPreset[] = [
  {
    id: "content_campaign_power_tool_week_en_in",
    contentType: "campaign-copy",
    placement: "collection.power-tool-week.hero",
    locale: "en-IN",
    title: "Power Tool Week — 10% off",
    body: "Staging campaign. 10% off Power Tools and free shipping. Simulated discount, no real charge.",
    actionLabel: "Shop Power Tools",
    actionUri: "/collections/power-tool-week",
    version: "test-v1",
    campaignKey: "BK-STG-CAMP-POWER-TOOL-WEEK",
    testData: true,
  },
  {
    id: "content_campaign_site_ready_banner_en_in",
    contentType: "banner",
    placement: "home.campaign-strip",
    locale: "en-IN",
    title: "Site Ready savings",
    body: "Bulk plywood and verified-trade safety gear offers for staging review.",
    actionLabel: "View offers",
    actionUri: "/collections/monsoon-site-essentials",
    version: "test-v1",
    campaignKey: "BK-STG-CAMP-SITE-READY",
    testData: true,
  },
  {
    id: "content_campaign_site_ready_banner_hi_in",
    contentType: "banner",
    placement: "home.campaign-strip",
    locale: "hi-IN",
    title: "साइट रेडी बचत",
    body: "स्टेजिंग समीक्षा के लिए थोक प्लाईवुड और सत्यापित व्यापार सुरक्षा उपकरण ऑफ़र।",
    actionLabel: "ऑफ़र देखें",
    actionUri: "/collections/monsoon-site-essentials",
    version: "test-v1",
    campaignKey: "BK-STG-CAMP-SITE-READY",
    testData: true,
  },
  {
    id: "content_onboarding_trade_program_en_in",
    contentType: "onboarding",
    placement: "onboarding.trade-program",
    locale: "en-IN",
    title: "Join the BuildKart trade program",
    body: "Add your GSTIN and delivery sites to unlock trade pricing and campaign eligibility in staging.",
    actionLabel: "Start",
    actionUri: "/onboarding/business",
    version: "test-v1",
    campaignKey: "BK-STG-CAMP-SITE-READY",
    testData: true,
  },
];

/**
 * Fail closed when a preset would breach the discount ceiling, declare a non-marketplace funding
 * source, or reference a campaign that does not exist.
 */
export function assertPresetInvariants(): void {
  const campaignKeys = new Set(MERCHANDISING_CAMPAIGN_PRESETS.map((c) => c.campaignKey));
  const promotionCodes = new Set(MERCHANDISING_PROMOTION_PRESETS.map((p) => p.code));

  if (campaignKeys.size !== MERCHANDISING_CAMPAIGN_PRESETS.length) {
    throw new Error("Duplicate merchandising campaign key.");
  }
  if (promotionCodes.size !== MERCHANDISING_PROMOTION_PRESETS.length) {
    throw new Error("Duplicate merchandising promotion code.");
  }

  for (const promotion of MERCHANDISING_PROMOTION_PRESETS) {
    if (promotion.fundingSource !== MERCHANDISING_FUNDING_SOURCE) {
      throw new Error(`${promotion.code} must be marketplace-funded.`);
    }
    if (promotion.value > DISCOUNT_CEILING_PERCENT) {
      throw new Error(
        `${promotion.code} exceeds the ${DISCOUNT_CEILING_PERCENT}% staging discount ceiling.`,
      );
    }
    if (promotion.applicationMethod === "percentage" && promotion.value <= 0) {
      throw new Error(`${promotion.code} must have a positive percentage value.`);
    }
    if (!campaignKeys.has(promotion.campaignKey)) {
      throw new Error(
        `${promotion.code} references unknown campaign ${promotion.campaignKey}.`,
      );
    }
  }

  for (const campaign of MERCHANDISING_CAMPAIGN_PRESETS) {
    if (campaign.fundingSource !== MERCHANDISING_FUNDING_SOURCE) {
      throw new Error(`${campaign.campaignKey} must be marketplace-funded.`);
    }
    for (const code of campaign.promotionCodes) {
      if (!promotionCodes.has(code)) {
        throw new Error(`${campaign.campaignKey} references unknown promotion ${code}.`);
      }
    }
  }

  for (const collection of MERCHANDISING_COLLECTION_PRESETS) {
    if (collection.categories.length === 0) {
      throw new Error(`${collection.collectionKey} must reference at least one category.`);
    }
  }
}

/** Contract-shaped catalogue returned by the read-only operator route. */
export function merchandisingPresetCatalogue() {
  return {
    change_id: "CHG-029" as const,
    environment: "staging" as const,
    generated_at: new Date().toISOString(),
    funding_source: MERCHANDISING_FUNDING_SOURCE,
    discount_ceiling_percent: DISCOUNT_CEILING_PERCENT,
    test_data: true as const,
    payment_mode: "simulated" as const,
    collections: MERCHANDISING_COLLECTION_PRESETS.map((collection) => ({
      collection_key: collection.collectionKey,
      title: collection.title,
      type: collection.type,
      categories: collection.categories,
      enabled: collection.enabled,
      status: collection.status,
      test_data: true as const,
    })),
    promotions: MERCHANDISING_PROMOTION_PRESETS.map((promotion) => ({
      code: promotion.code,
      campaign_key: promotion.campaignKey,
      application_method: promotion.applicationMethod,
      value: promotion.value,
      target: {
        type: promotion.target.type,
        reference: promotion.target.reference,
        ...(promotion.target.customerGroup
          ? { customer_group: promotion.target.customerGroup }
          : {}),
      },
      automatic: promotion.automatic,
      starts_at: promotion.startsAt,
      ends_at: promotion.endsAt,
      usage_limit: promotion.usageLimit,
      funding_source: promotion.fundingSource,
      policy_pending: promotion.policyPending,
      test_data: true as const,
      deferred_conditions: promotion.deferredConditions,
    })),
    campaigns: MERCHANDISING_CAMPAIGN_PRESETS.map((campaign) => ({
      campaign_key: campaign.campaignKey,
      title: campaign.title,
      promotion_codes: campaign.promotionCodes,
      budget_amount_minor: campaign.budgetAmountMinor,
      currency_code: campaign.currencyCode,
      starts_at: campaign.startsAt,
      ends_at: campaign.endsAt,
      funding_source: campaign.fundingSource,
      policy_pending: campaign.policyPending,
      test_data: true as const,
    })),
    content: MERCHANDISING_CONTENT_PRESETS.map((element) => ({
      id: element.id,
      content_type: element.contentType,
      placement: element.placement,
      locale: element.locale,
      title: element.title,
      body: element.body,
      action_label: element.actionLabel,
      action_uri: element.actionUri,
      version: element.version,
      campaign_key: element.campaignKey,
      test_data: true as const,
    })),
  };
}
