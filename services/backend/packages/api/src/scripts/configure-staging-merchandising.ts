/**
 * CHG-029 — configure bounded-staging merchandising presets.
 *
 * Idempotent. Creates curated collection definitions, trade customer group, campaigns and
 * marketplace-funded promotions using the real Medusa discount engine. Because every preset is
 * marketplace-funded, no preset promotion is ever linked to a seller.
 *
 * Prohibited outside `BUILDKART_ENVIRONMENT=staging`.
 */
import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules, RuleType } from "@medusajs/framework/utils";
import {
  addOrRemoveCampaignPromotionsWorkflow,
  batchPromotionRulesWorkflow,
  createCampaignsWorkflow,
  createCustomerGroupsWorkflow,
  createPromotionsWorkflow,
  updateCampaignsWorkflow,
  updatePromotionsWorkflow,
} from "@medusajs/medusa/core-flows";
import {
  DISCOUNT_CEILING_PERCENT,
  MERCHANDISING_CAMPAIGN_PRESETS,
  MERCHANDISING_COLLECTION_PRESETS,
  MERCHANDISING_PROMOTION_PRESETS,
  TRADE_CUSTOMER_GROUP_NAME,
  assertPresetInvariants,
  budgetAmountMajor,
  type MerchandisingPromotionPreset,
} from "../staging-merchandising/presets";
import { isStagingMerchandisingEnabled } from "../staging-merchandising/runtime";
import {
  STAGING_OFFER_CAMPAIGN,
  STAGING_OFFERS,
  buildOffer,
} from "../staging-merchandising/offer-patterns";

interface CampaignRecord {
  id: string;
  campaign_identifier: string;
  budget?: { id: string; limit: number | null } | null;
}

interface PromotionRuleRecord {
  id: string;
  attribute: string;
  operator: string;
  values?: { value: string }[] | string[];
}

interface PromotionRecord {
  id: string;
  code: string;
  campaign_id: string | null;
  rules?: PromotionRuleRecord[];
}

/** Attributes this change owns. Operator-added rules on other attributes are left untouched. */
const MANAGED_RULE_ATTRIBUTES = new Set(["subtotal", "customer.groups.id"]);

interface PromotionRuleInput {
  attribute: string;
  operator: "gt" | "lt" | "eq" | "ne" | "in" | "lte" | "gte";
  values: string[];
  description?: string;
}

export default async function configureStagingMerchandising({ container }: ExecArgs) {
  if (!isStagingMerchandisingEnabled()) {
    throw new Error(
      "CHG-029 staging merchandising presets are prohibited outside BUILDKART_ENVIRONMENT=staging.",
    );
  }

  assertPresetInvariants();

  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const productService = container.resolve(Modules.PRODUCT);
  const customerService = container.resolve(Modules.CUSTOMER);
  const promotionService = container.resolve(Modules.PROMOTION) as {
    listCampaigns(
      filters: Record<string, unknown>,
      config?: Record<string, unknown>,
    ): Promise<CampaignRecord[]>;
    listPromotions(
      filters: Record<string, unknown>,
      config?: Record<string, unknown>,
    ): Promise<PromotionRecord[]>;
  };

  // 1. Trade customer group used by the B2B promotion rule.
  let [tradeGroup] = await customerService.listCustomerGroups({
    name: TRADE_CUSTOMER_GROUP_NAME,
  });
  if (!tradeGroup) {
    const { result } = await createCustomerGroupsWorkflow(container).run({
      input: { customersData: [{ name: TRADE_CUSTOMER_GROUP_NAME }] },
    });
    tradeGroup = result[0];
    logger.info(`Created staging customer group '${TRADE_CUSTOMER_GROUP_NAME}'.`);
  }

  // 2. Categories referenced by presets and promotions must exist before we target them.
  const categoryNames = [
    ...new Set([
      ...MERCHANDISING_COLLECTION_PRESETS.flatMap((preset) => preset.categories),
      ...MERCHANDISING_PROMOTION_PRESETS.filter(
        (preset) => preset.target.type === "category",
      ).map((preset) => preset.target.reference),
      ...STAGING_OFFERS.map((offer) => offer.categoryReference).filter(
        (name): name is string => Boolean(name),
      ),
    ]),
  ];
  const categories = await productService.listProductCategories({ name: categoryNames });
  const categoryByName = new Map(categories.map((category) => [category.name, category]));
  const missingCategories = categoryNames.filter((name) => !categoryByName.has(name));
  if (missingCategories.length > 0) {
    throw new Error(
      `Missing seeded categories: ${missingCategories.join(", ")}. Run the catalog seed first.`,
    );
  }

  // 3. Campaigns. A campaign budget caps marketplace-funded spend in staging.
  const campaignIdByKey = new Map<string, string>();
  for (const preset of MERCHANDISING_CAMPAIGN_PRESETS) {
    const [existing] = await promotionService.listCampaigns(
      { campaign_identifier: preset.campaignKey },
      { relations: ["budget"] },
    );
    const budgetLimit = budgetAmountMajor(preset.budgetAmountMinor);
    const campaignsData = {
      name: preset.title,
      campaign_identifier: preset.campaignKey,
      starts_at: new Date(preset.startsAt),
      ends_at: new Date(preset.endsAt),
      budget: {
        type: "spend" as const,
        // Medusa compares spend budgets against discounted amounts in major units.
        limit: budgetLimit,
        currency_code: preset.currencyCode,
      },
    };

    if (existing) {
      // Budget type and currency are immutable after creation. `limit` is mutable, but must be
      // addressed through the budget's own id rather than re-declared inline.
      const budgetUpdate = existing.budget?.id
        ? { budget: { id: existing.budget.id, limit: budgetLimit } }
        : {};
      await updateCampaignsWorkflow(container).run({
        input: {
          campaignsData: [
            {
              id: existing.id,
              name: preset.title,
              starts_at: new Date(preset.startsAt),
              ends_at: new Date(preset.endsAt),
              ...budgetUpdate,
            },
          ],
        },
      });
      // A campaign created before the budget existed still needs one.
      if (!existing.budget?.id) {
        throw new Error(
          `Staging campaign ${preset.campaignKey} has no budget. Delete and reconfigure the campaign.`,
        );
      }
      campaignIdByKey.set(preset.campaignKey, existing.id);
      logger.info(`Updated staging campaign ${preset.campaignKey}.`);
    } else {
      const { result } = await createCampaignsWorkflow(container).run({
        input: { campaignsData: [campaignsData] },
      });
      campaignIdByKey.set(preset.campaignKey, result[0].id);
      logger.info(`Created staging campaign ${preset.campaignKey}.`);
    }
  }

  // 4. Promotions, evaluated by the real Medusa discount engine.
  for (const preset of MERCHANDISING_PROMOTION_PRESETS) {
    if (preset.value > DISCOUNT_CEILING_PERCENT) {
      throw new Error(`${preset.code} breaches the staging discount ceiling.`);
    }

    const campaignId = campaignIdByKey.get(preset.campaignKey);
    if (!campaignId) {
      throw new Error(`${preset.code} references an unconfigured campaign.`);
    }

    const [existing] = (await promotionService.listPromotions(
      { code: preset.code },
      { relations: ["rules", "rules.values"] },
    )) as PromotionRecord[];
    if (existing) {
      // Marketplace-funded presets must never carry a seller link.
      const { data: sellerLinks } = await query.graph({
        entity: "promotion_seller",
        fields: ["promotion_id"],
        filters: { promotion_id: existing.id },
      });
      if (sellerLinks.length > 0) {
        throw new Error(
          `${preset.code} is seller-linked but CHG-029 presets are marketplace-funded. ` +
            "Resolve the funding conflict before applying CHG-029.",
        );
      }

      await updatePromotionsWorkflow(container).run({
        input: {
          promotionsData: [
            {
              id: existing.id,
              status: "active",
              is_automatic: preset.automatic,
              limit: preset.usageLimit,
            },
          ],
        },
      });
      // Campaign association is a direct FK on the promotion, so only re-link when it drifted.
      if (existing.campaign_id !== campaignId) {
        await addOrRemoveCampaignPromotionsWorkflow(container).run({
          input: { id: campaignId, add: [existing.id] },
        });
      }
      await syncPromotionRules(
        container,
        promotionService,
        existing,
        desiredPromotionRules(preset, tradeGroup.id),
      );
      logger.info(`Updated staging promotion ${preset.code}.`);
      continue;
    }

    await createPromotionsWorkflow(container).run({
      input: {
        promotionsData: [
          {
            code: preset.code,
            type: "standard",
            status: "active",
            is_automatic: preset.automatic,
            limit: preset.usageLimit,
            campaign_id: campaignId,
            application_method: applicationMethodFor(preset, categoryByName),
            rules: desiredPromotionRules(preset, tradeGroup.id),
          },
        ],
      },
    });
    logger.info(`Created staging promotion ${preset.code}.`);
  }

  // 5. CHG-030 offer lab — one campaign plus engine-verified offer patterns.
  const [existingOfferCampaign] = await promotionService.listCampaigns(
    { campaign_identifier: STAGING_OFFER_CAMPAIGN.campaignKey },
    { relations: ["budget"] },
  );
  const offerBudgetLimit = budgetAmountMajor(STAGING_OFFER_CAMPAIGN.budgetAmountMinor);
  let offerCampaignId: string;

  if (existingOfferCampaign) {
    const budgetUpdate = existingOfferCampaign.budget?.id
      ? { budget: { id: existingOfferCampaign.budget.id, limit: offerBudgetLimit } }
      : {};
    if (!existingOfferCampaign.budget?.id) {
      throw new Error(
        `Staging campaign ${STAGING_OFFER_CAMPAIGN.campaignKey} has no budget. Delete and reconfigure it.`,
      );
    }
    await updateCampaignsWorkflow(container).run({
      input: {
        campaignsData: [
          {
            id: existingOfferCampaign.id,
            name: STAGING_OFFER_CAMPAIGN.title,
            starts_at: new Date(STAGING_OFFER_CAMPAIGN.startsAt),
            ends_at: new Date(STAGING_OFFER_CAMPAIGN.endsAt),
            ...budgetUpdate,
          },
        ],
      },
    });
    offerCampaignId = existingOfferCampaign.id;
    logger.info(`Updated staging campaign ${STAGING_OFFER_CAMPAIGN.campaignKey}.`);
  } else {
    const { result } = await createCampaignsWorkflow(container).run({
      input: {
        campaignsData: [
          {
            name: STAGING_OFFER_CAMPAIGN.title,
            campaign_identifier: STAGING_OFFER_CAMPAIGN.campaignKey,
            starts_at: new Date(STAGING_OFFER_CAMPAIGN.startsAt),
            ends_at: new Date(STAGING_OFFER_CAMPAIGN.endsAt),
            budget: {
              type: "spend" as const,
              limit: offerBudgetLimit,
              currency_code: STAGING_OFFER_CAMPAIGN.currencyCode,
            },
          },
        ],
      },
    });
    offerCampaignId = result[0].id;
    logger.info(`Created staging campaign ${STAGING_OFFER_CAMPAIGN.campaignKey}.`);
  }

  for (const offer of STAGING_OFFERS) {
    let categoryId: string | undefined;
    if (offer.categoryReference) {
      categoryId = categoryByName.get(offer.categoryReference)?.id;
      if (!categoryId) {
        throw new Error(
          `${offer.code} references unknown category '${offer.categoryReference}'.`,
        );
      }
    }

    const payload = buildOffer({
      code: offer.code,
      mechanic: offer.mechanic,
      value: offer.value,
      automatic: offer.trigger === "automatic",
      usageLimit: offer.usageLimit,
      categoryId,
      sku: offer.sku,
      minQuantity: offer.minQuantity,
      subtotalThreshold: offer.subtotalThreshold,
      customerGroupId: offer.customerGroup ? tradeGroup.id : undefined,
      maxQuantity: offer.maxQuantity,
      applyToQuantity: offer.applyToQuantity,
      buyRulesMinQuantity: offer.buyRulesMinQuantity,
    }) as Record<string, unknown> & {
      code: string;
      is_automatic: boolean;
      limit?: number;
      rules?: PromotionRuleInput[];
    };

    const [existingOffer] = (await promotionService.listPromotions(
      { code: offer.code },
      { relations: ["rules", "rules.values"] },
    )) as PromotionRecord[];

    if (existingOffer) {
      const { data: sellerLinks } = await query.graph({
        entity: "promotion_seller",
        fields: ["promotion_id"],
        filters: { promotion_id: existingOffer.id },
      });
      if (sellerLinks.length > 0) {
        throw new Error(
          `${offer.code} is seller-linked but CHG-030 offers are marketplace-funded.`,
        );
      }

      await updatePromotionsWorkflow(container).run({
        input: {
          promotionsData: [
            {
              id: existingOffer.id,
              status: "active",
              is_automatic: payload.is_automatic,
              limit: payload.limit,
            },
          ],
        },
      });
      if (existingOffer.campaign_id !== offerCampaignId) {
        await addOrRemoveCampaignPromotionsWorkflow(container).run({
          input: { id: offerCampaignId, add: [existingOffer.id] },
        });
      }
      await syncPromotionRules(
        container,
        promotionService,
        existingOffer,
        payload.rules ?? [],
      );
      logger.info(`Updated staging offer ${offer.code}.`);
      continue;
    }

    await createPromotionsWorkflow(container).run({
      input: {
        promotionsData: [
          { ...payload, campaign_id: offerCampaignId } as never,
        ],
      },
    });
    logger.info(`Created staging offer ${offer.code}.`);
  }

  logger.info(
    "CHG-029 merchandising presets configured; promotions are marketplace-funded and no seller link was created.",
  );
}

/** Map a preset to the Medusa application method the engine evaluates. */
function applicationMethodFor(
  preset: MerchandisingPromotionPreset,
  categoryByName: Map<string, { id: string }>,
) {
  if (preset.applicationMethod === "free_shipping") {
    // Free shipping is expressed as a 100% percentage discount on shipping methods.
    return {
      type: "percentage" as const,
      target_type: "shipping_methods" as const,
      allocation: "across" as const,
      value: 100,
    };
  }

  const targetRules =
    preset.target.type === "category"
      ? [
          {
            attribute: "items.product.categories.id",
            operator: "in" as const,
            values: [categoryByName.get(preset.target.reference)!.id],
          },
        ]
      : [];

  return {
    type: "percentage" as const,
    target_type: "items" as const,
    allocation: "across" as const,
    value: preset.value,
    target_rules: targetRules,
  };
}

/** Promotion-level rules the engine enforces: preset gates plus the optional trade group gate. */
function desiredPromotionRules(
  preset: MerchandisingPromotionPreset,
  tradeGroupId: string,
): PromotionRuleInput[] {
  const rules: PromotionRuleInput[] = preset.rules.map((rule) => ({
    attribute: rule.attribute,
    operator: rule.operator,
    values: rule.values,
    description: rule.description,
  }));

  if (preset.target.customerGroup) {
    rules.push({
      attribute: "customer.groups.id",
      operator: "in",
      values: [tradeGroupId],
      description: `Restricted to the ${preset.target.customerGroup} customer group.`,
    });
  }

  return rules;
}

/** Reconcile only the rules CHG-029 owns, leaving operator-added rules on other attributes intact. */
async function syncPromotionRules(
  container: ExecArgs["container"],
  promotionService: {
    listPromotions(
      filters: Record<string, unknown>,
      config?: Record<string, unknown>,
    ): Promise<PromotionRecord[]>;
  },
  existing: PromotionRecord,
  desired: PromotionRuleInput[],
): Promise<void> {
  const [, refreshed] = (await promotionService.listPromotions(
    { id: existing.id },
    { relations: ["rules", "rules.values"] },
  )) as PromotionRecord[];

  const currentRules = refreshed?.rules ?? existing.rules ?? [];
  const valuesOf = (rule: PromotionRuleRecord): string[] =>
    (rule.values ?? []).map((value) =>
      typeof value === "string" ? value : value.value,
    );
  const sameRule = (a: PromotionRuleInput, b: PromotionRuleRecord) =>
    a.attribute === b.attribute &&
    a.operator === b.operator &&
    JSON.stringify(a.values) === JSON.stringify(valuesOf(b));

  const managedExisting = currentRules.filter((rule) =>
    MANAGED_RULE_ATTRIBUTES.has(rule.attribute),
  );
  const deleteIds = managedExisting
    .filter((rule) => !desired.some((want) => sameRule(want, rule)))
    .map((rule) => rule.id);
  const create = desired.filter(
    (want) => !managedExisting.some((rule) => sameRule(want, rule)),
  );

  if (!deleteIds.length && !create.length) {
    return;
  }

  await batchPromotionRulesWorkflow(container).run({
    input: {
      id: existing.id,
      // Required: without `rule_type` the rule step is a no-op.
      rule_type: RuleType.RULES,
      create,
      delete: deleteIds,
    },
  });
}
