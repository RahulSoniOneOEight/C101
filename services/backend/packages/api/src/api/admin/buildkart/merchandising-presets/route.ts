import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { MedusaError, Modules } from "@medusajs/framework/utils";
import { merchandisingPresetCatalogue } from "../../../../staging-merchandising/presets";
import { isStagingMerchandisingEnabled } from "../../../../staging-merchandising/runtime";

interface LivePromotionRecord {
  id: string;
  code: string;
  status: string;
  updated_at?: Date | string;
}

interface LiveCampaignRecord {
  id: string;
  campaign_identifier: string;
  updated_at?: Date | string;
}

export async function resolveMerchandisingPresetCatalogue(req: AuthenticatedMedusaRequest) {
  const catalogue = merchandisingPresetCatalogue();
  const promotionService = req.scope.resolve(Modules.PROMOTION) as {
    listPromotions(filters: Record<string, unknown>): Promise<LivePromotionRecord[]>;
    listCampaigns(filters: Record<string, unknown>): Promise<LiveCampaignRecord[]>;
  };
  const [livePromotions, liveCampaigns] = await Promise.all([
    promotionService.listPromotions({ code: catalogue.promotions.map((item) => item.code) }),
    promotionService.listCampaigns({
      campaign_identifier: catalogue.campaigns.map((item) => item.campaign_key),
    }),
  ]);
  const promotionByCode = new Map(livePromotions.map((item) => [item.code, item]));
  const campaignByKey = new Map(liveCampaigns.map((item) => [item.campaign_identifier, item]));

  return {
    ...catalogue,
    promotions: catalogue.promotions.map((item) => {
      const live = promotionByCode.get(item.code);
      return {
        ...item,
        live: live
          ? { id: live.id, status: live.status, updated_at: live.updated_at ?? null }
          : null,
      };
    }),
    campaigns: catalogue.campaigns.map((item) => {
      const live = campaignByKey.get(item.campaign_key);
      return {
        ...item,
        live: live ? { id: live.id, updated_at: live.updated_at ?? null } : null,
      };
    }),
  };
}

export type MerchandisingPresetCatalogueResponse = Awaited<
  ReturnType<typeof resolveMerchandisingPresetCatalogue>
>;

/**
 * CHG-029 read-only operator catalogue of bounded-staging merchandising presets.
 *
 * Returns the reviewed preset pack verbatim. It cannot create, activate or discount anything, and
 * is unavailable outside `BUILDKART_ENVIRONMENT=staging`.
 */
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse<MerchandisingPresetCatalogueResponse>,
): Promise<void> {
  if (!isStagingMerchandisingEnabled()) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Not found");
  }

  res.json(await resolveMerchandisingPresetCatalogue(req));
}
