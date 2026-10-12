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
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import {
  addOrRemoveCampaignPromotionsWorkflow,
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
  type MerchandisingPromotionPreset,
} from "../staging-merchandising/presets";
import { isStagingMerchandisingEnabled } from "../staging-merchandising/runtime";

interface CampaignRecord {
  id: string;
  campaign_identifier: string;
}

interface PromotionRecord {
  id: string;
  code: string;
  campaign_id: string | null;
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
    listCampaigns(filters: Record<string, unknown>): Promise<CampaignRecord[]>;
    listPromotions(filters: Record<string, unknown>): Promise<PromotionRecord[]>;
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
    const [existing] = await promotionService.listCampaigns({
      campaign_identifier: preset.campaignKey,
    });
    const campaignsData = {
      name: preset.title,
      campaign_identifier: preset.campaignKey,
      starts_at: new Date(preset.startsAt),
      ends_at: new Date(preset.endsAt),
      budget: {
        type: "spend" as const,
        limit: preset.budgetAmountMinor,
        currency_code: preset.currencyCode,
      },
    };

    if (existing) {
      // Budget type and currency are immutable after creation, so update only mutable fields.
      await updateCampaignsWorkflow(container).run({
        input: {
          campaignsData: [
            {
              id: existing.id,
              name: preset.title,
              starts_at: new Date(preset.startsAt),
              ends_at: new Date(preset.endsAt),
            },
          ],
        },
      });
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

    const [existing] = await promotionService.listPromotions({ code: preset.code });
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
            rules: promotionRulesFor(preset, tradeGroup.id),
          },
        ],
      },
    });
    logger.info(`Created staging promotion ${preset.code}.`);
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

/** Promotion-level rules; the B2B preset is restricted to the trade customer group. */
function promotionRulesFor(
  preset: MerchandisingPromotionPreset,
  tradeGroupId: string,
) {
  if (!preset.target.customerGroup) {
    return [];
  }
  return [
    {
      attribute: "customer.groups.id",
      operator: "in" as const,
      values: [tradeGroupId],
    },
  ];
}
