import { Modules } from "@medusajs/framework/utils";
import { resolveMerchandisingOfferCatalogue } from "../../api/admin/buildkart/merchandising-offers/route";
import { resolveMerchandisingPresetCatalogue } from "../../api/admin/buildkart/merchandising-presets/route";
import { merchandisingOfferCatalogue } from "../offer-patterns";
import { merchandisingPresetCatalogue } from "../presets";

const requestWithPromotionService = (
  promotions: Array<{ id: string; code: string; status: string; updated_at?: string }> = [],
  campaigns: Array<{ id: string; campaign_identifier: string; updated_at?: string }> = [],
) => ({
  scope: {
    resolve: jest.fn((key: string) => {
      expect(key).toBe(Modules.PROMOTION);
      return {
        listPromotions: jest.fn(async () => promotions),
        listCampaigns: jest.fn(async () => campaigns),
      };
    }),
  },
}) as never;

describe("live merchandising catalogue resolution", () => {
  it("attaches live Medusa ids to matching governed presets", async () => {
    const declared = merchandisingPresetCatalogue();
    const promotion = declared.promotions[0];
    const campaign = declared.campaigns[0];
    const result = await resolveMerchandisingPresetCatalogue(requestWithPromotionService(
      [{ id: "promo_live", code: promotion.code, status: "active" }],
      [{ id: "campaign_live", campaign_identifier: campaign.campaign_key }],
    ));

    expect(result.promotions.find((item) => item.code === promotion.code)?.live).toEqual({
      id: "promo_live",
      status: "active",
      updated_at: null,
    });
    expect(result.campaigns.find((item) => item.campaign_key === campaign.campaign_key)?.live).toEqual({
      id: "campaign_live",
      updated_at: null,
    });
  });

  it("marks undeployed offer patterns as missing without changing their baseline", async () => {
    const declared = merchandisingOfferCatalogue();
    const result = await resolveMerchandisingOfferCatalogue(requestWithPromotionService());

    expect(result.offers).toHaveLength(declared.offers.length);
    expect(result.offers.every((item) => item.live === null)).toBe(true);
    expect(result.campaign.live).toBeNull();
    expect(result.offers.map((item) => item.code)).toEqual(declared.offers.map((item) => item.code));
  });
});
