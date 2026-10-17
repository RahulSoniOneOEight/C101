import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { MedusaError, Modules } from "@medusajs/framework/utils";
import { merchandisingOfferCatalogue } from "../../../../staging-merchandising/offer-patterns";
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

export async function resolveMerchandisingOfferCatalogue(req: AuthenticatedMedusaRequest) {
  const catalogue = merchandisingOfferCatalogue();
  const promotionService = req.scope.resolve(Modules.PROMOTION) as {
    listPromotions(filters: Record<string, unknown>): Promise<LivePromotionRecord[]>;
    listCampaigns(filters: Record<string, unknown>): Promise<LiveCampaignRecord[]>;
  };
  const [livePromotions, liveCampaigns] = await Promise.all([
    promotionService.listPromotions({ code: catalogue.offers.map((item) => item.code) }),
    promotionService.listCampaigns({
      campaign_identifier: catalogue.campaign.campaign_key,
    }),
  ]);
  const promotionByCode = new Map(livePromotions.map((item) => [item.code, item]));
  const liveCampaign = liveCampaigns.find(
    (item) => item.campaign_identifier === catalogue.campaign.campaign_key,
  );

  return {
    ...catalogue,
    campaign: {
      ...catalogue.campaign,
      live: liveCampaign
        ? { id: liveCampaign.id, updated_at: liveCampaign.updated_at ?? null }
        : null,
    },
    offers: catalogue.offers.map((item) => {
      const live = promotionByCode.get(item.code);
      return {
        ...item,
        live: live
          ? { id: live.id, status: live.status, updated_at: live.updated_at ?? null }
          : null,
      };
    }),
  };
}

export type MerchandisingOfferCatalogueResponse = Awaited<
  ReturnType<typeof resolveMerchandisingOfferCatalogue>
>;

/**
 * CHG-030 read-only operator catalogue of the bounded-staging offer lab.
 *
 * Returns the declared offer patterns and their engine-verified configuration. It cannot create,
 * activate or discount anything, and is unavailable outside `BUILDKART_ENVIRONMENT=staging`.
 */
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse<MerchandisingOfferCatalogueResponse>,
): Promise<void> {
  if (!isStagingMerchandisingEnabled()) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Not found");
  }

  res.json(await resolveMerchandisingOfferCatalogue(req));
}
