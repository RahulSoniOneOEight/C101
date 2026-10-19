import type { Core } from "@strapi/strapi";

/**
 * CHG-035 — idempotent storefront presentation seed.
 *
 * Creates the hero/campaign banners and root category presentation that the customer app currently
 * renders, so an operator can edit them through the common console instead of a code change. Each
 * record is only created when its key is absent; an operator edit is never overwritten.
 *
 * `categoryId` is seeded with the commerce category *name* because Medusa ids are generated at
 * catalog seed time. The Experience API resolves a category editorial by commerce id first and by
 * category name second, so this resolves immediately and can be replaced with the real id later.
 *
 * Editorial only. Nothing here may carry price, stock, seller, order, payment or commission data.
 */

interface BannerSeed {
  contentKey: string;
  placement: string;
  title: string;
  subtitle?: string;
  ctaLabel?: string;
  ctaTargetType?: "route" | "product" | "category" | "collection" | "url";
  ctaTargetId?: string;
  externalImageUrl?: string;
  imageAltText: string;
  themeKey: "primary" | "trust" | "promotion" | "neutral";
  priority: number;
}

interface CategorySeed {
  categoryId: string;
  displayLabel: string;
  shortText: string;
  iconKey: string;
  externalBannerImageUrl: string;
  bannerImageAltText: string;
  heading: string;
}

export const bannerSeed: BannerSeed[] = [
  // Seed copy states no quantified claim — no saving, no catalogue size, no delivery threshold — so a
  // fresh environment never shows a shopper an unevidenced offer before an operator authors one.
  {
    contentKey: "hero-monsoon-ready",
    placement: "b2c.home.hero",
    title: "Monsoon Ready",
    ctaLabel: "Shop now",
    ctaTargetType: "route",
    ctaTargetId: "/browse?tag=Flash%20Deals",
    imageAltText: "Waterproofing supplies for monsoon preparation",
    themeKey: "primary",
    priority: 30,
  },
  {
    contentKey: "hero-bulk-savings",
    placement: "b2c.home.hero",
    title: "Bulk Savings",
    ctaLabel: "Shop now",
    ctaTargetType: "route",
    ctaTargetId: "/browse?tag=Best%20Sellers",
    imageAltText: "Stacked bulk building materials",
    themeKey: "trust",
    priority: 20,
  },
  {
    contentKey: "hero-free-delivery",
    placement: "b2c.home.hero",
    title: "Free Delivery",
    ctaLabel: "Shop now",
    ctaTargetType: "route",
    ctaTargetId: "/browse?tag=Clearance%20Sale",
    imageAltText: "Delivery van at a construction site",
    themeKey: "promotion",
    priority: 10,
  },
  {
    contentKey: "secondary-clearance-sale",
    placement: "b2c.home.campaign-strip",
    title: "Clearance Sale",
    ctaLabel: "Shop Now",
    ctaTargetType: "route",
    ctaTargetId: "/browse?tag=Clearance%20Sale",
    externalImageUrl:
      "https://images.pexels.com/photos/10284048/pexels-photo-10284048.jpeg?auto=compress&cs=tinysrgb&h=650&w=940",
    imageAltText: "Tools and hardware on display",
    themeKey: "promotion",
    priority: 10,
  },
];

export const categorySeed: CategorySeed[] = [
  {
    categoryId: "Bathroom & Plumbing",
    displayLabel: "Bathroom & Plumbing",
    shortText: "Fittings, sanitaryware and pipes",
    iconKey: "bathroom-plumbing",
    externalBannerImageUrl:
      "https://images.pexels.com/photos/2062426/pexels-photo-2062426.jpeg?auto=compress&cs=tinysrgb&w=940",
    bannerImageAltText: "Bathroom fittings and plumbing supplies",
    heading: "Bathroom & Plumbing",
  },
  {
    categoryId: "Tiles & Plywood",
    displayLabel: "Tiles & Plywood",
    shortText: "Flooring, boards and finishes",
    iconKey: "tiles-plywood",
    externalBannerImageUrl:
      "https://images.pexels.com/photos/276724/pexels-photo-276724.jpeg?auto=compress&cs=tinysrgb&w=940",
    bannerImageAltText: "Tiles and plywood boards",
    heading: "Tiles & Plywood",
  },
  {
    categoryId: "Electrical",
    displayLabel: "Electrical",
    shortText: "Wiring, lighting and switchgear",
    iconKey: "electrical",
    externalBannerImageUrl:
      "https://images.pexels.com/photos/257736/pexels-photo-257736.jpeg?auto=compress&cs=tinysrgb&w=940",
    bannerImageAltText: "Electrical wiring and switchgear",
    heading: "Electrical",
  },
  {
    categoryId: "Agriculture & Seeds",
    displayLabel: "Agriculture & Seeds",
    shortText: "Seeds, soil and garden tools",
    iconKey: "agriculture",
    externalBannerImageUrl:
      "https://images.pexels.com/photos/265216/pexels-photo-265216.jpeg?auto=compress&cs=tinysrgb&w=940",
    bannerImageAltText: "Seeds and garden tools",
    heading: "Agriculture & Seeds",
  },
  {
    categoryId: "Pumps & Machines",
    displayLabel: "Pumps & Machines",
    shortText: "Water pumps, generators and machinery",
    iconKey: "pumps-machines",
    externalBannerImageUrl:
      "https://images.pexels.com/photos/175709/pexels-photo-175709.jpeg?auto=compress&cs=tinysrgb&w=940",
    bannerImageAltText: "Water pumps and machinery",
    heading: "Pumps & Machines",
  },
  {
    // The deployed Medusa root is named "Building & Construction"; the app-facing label is
    // "Construction". Replace categoryId with the commerce id once it is captured.
    categoryId: "Building & Construction",
    displayLabel: "Construction",
    shortText: "Cement, steel, tools and site supplies",
    iconKey: "construction",
    externalBannerImageUrl:
      "https://images.pexels.com/photos/1216589/pexels-photo-1216589.jpeg?auto=compress&cs=tinysrgb&w=940",
    bannerImageAltText: "Construction materials and site equipment",
    heading: "Construction",
  },
];

/**
 * CHG-062 — B2B quick-order lists and trade-offer collection properties.
 *
 * Category rules, not product ids: the storefront resolves live catalogue
 * products, and an operator can retitle, reorder, re-cap or re-target every
 * record without an app release.
 */
const curatedCollectionSeed = [
  {
    collectionKey: "b2b_trade_seasonal",
    audience: "b2b",
    placement: "b2b.trade_offers",
    title: "Seasonal",
    description: "Lighting & electrical",
    categoryLabels: ["Lighting & Electrical"],
    limit: 8,
    displayOrder: 1,
    iconKey: "wb-sunny",
    accent: "trust",
    dealType: "seasonal",
    selectionRule: "category:Lighting & Electrical;limit:8",
  },
  {
    collectionKey: "b2b_trade_best_deals",
    audience: "b2b",
    placement: "b2b.trade_offers",
    title: "Best Deals",
    description: "Bathroom & plumbing",
    categoryLabels: ["Bathroom & Plumbing"],
    limit: 8,
    displayOrder: 2,
    iconKey: "local-offer",
    accent: "promotion",
    dealType: "best-deals",
    selectionRule: "category:Bathroom & Plumbing;limit:8",
  },
  {
    collectionKey: "b2b_trade_schemes",
    audience: "b2b",
    placement: "b2b.trade_offers",
    title: "Schemes",
    description: "Paints & finishes",
    categoryLabels: ["Paints & Finishes", "Tiles & Building Materials"],
    limit: 8,
    displayOrder: 3,
    iconKey: "card-giftcard",
    accent: "primary",
    dealType: "schemes",
    schemeLabel: "Buy 100 Get 5 Free",
    selectionRule: "category:Paints & Finishes,Tiles & Building Materials;limit:8",
  },
  {
    collectionKey: "b2b_quick_electrical",
    audience: "b2b",
    placement: "b2b.quick_order",
    title: "Electrical Essentials",
    description: "Lighting, wiring and switchgear",
    categoryLabels: ["Lighting & Electrical"],
    limit: 20,
    defaultQuantity: 5,
    displayOrder: 1,
    iconKey: "bolt",
    accent: "primary",
    dealType: "quick-order",
  },
  {
    collectionKey: "b2b_quick_bathroom",
    audience: "b2b",
    placement: "b2b.quick_order",
    title: "Bathroom & Plumbing",
    description: "Fittings, sanitaryware and pipes",
    categoryLabels: ["Bathroom & Plumbing"],
    limit: 20,
    defaultQuantity: 4,
    displayOrder: 2,
    iconKey: "water-drop",
    accent: "primary",
    dealType: "quick-order",
  },
  {
    collectionKey: "b2b_quick_finishes",
    audience: "b2b",
    placement: "b2b.quick_order",
    title: "Paints & Finishes",
    description: "Paints, boards and surface finishes",
    categoryLabels: ["Paints & Finishes", "Tiles & Building Materials"],
    limit: 18,
    defaultQuantity: 4,
    displayOrder: 3,
    iconKey: "format-paint",
    accent: "primary",
    dealType: "quick-order",
  },
  {
    collectionKey: "b2b_quick_tools",
    audience: "b2b",
    placement: "b2b.quick_order",
    title: "Tools & Hardware",
    description: "Hand tools, power tools and fasteners",
    categoryLabels: ["Tools & Hardware"],
    limit: 20,
    defaultQuantity: 5,
    displayOrder: 4,
    iconKey: "handyman",
    accent: "primary",
    dealType: "quick-order",
  },
];

/**
 * Create missing presentation records and publish them. Never overwrites an existing record, so an
 * operator edit always wins. Fail-soft: a seeding error is logged and never blocks startup.
 */
export async function seedStorefrontPresentation(strapi: Core.Strapi): Promise<void> {
  // The CMS image runs with NODE_ENV=production for its runtime shape, so the environment marker
  // (not NODE_ENV) decides whether the governed staging seed runs. Absent marker = seed.
  if (process.env.BUILDKART_ENVIRONMENT === "production") return;
  try {
    const banners = strapi.documents("api::banner.banner" as never);
    for (const seed of bannerSeed) {
      const existing = await banners.findMany({
        filters: { contentKey: seed.contentKey },
        locale: "en-IN",
        limit: 1,
      } as never);
      if (existing.length) continue;
      const created = await banners.create({
        locale: "en-IN",
        status: "draft",
        data: seed,
      } as never);
      const documentId = (created as { documentId?: string }).documentId;
      if (documentId) {
        await banners.publish({ documentId, locale: "en-IN" } as never);
      }
    }

    const categories = strapi.documents("api::category-editorial.category-editorial" as never);
    for (const seed of categorySeed) {
      const existing = await categories.findMany({
        filters: { categoryId: seed.categoryId, channel: "b2c" },
        locale: "en-IN",
        limit: 1,
      } as never);
      if (!existing.length) {
        // The banner image is no longer a category attribute; only the presentation fields are stored
        // here, and the image is seeded as a banner record below.
        const { externalBannerImageUrl: _image, bannerImageAltText: _alt, ...editorial } = seed;
        const created = await categories.create({
          locale: "en-IN",
          status: "draft",
          data: { ...editorial, channel: "b2c" },
        } as never);
        const documentId = (created as { documentId?: string }).documentId;
        if (documentId) {
          await categories.publish({ documentId, locale: "en-IN" } as never);
        }
      }

      const contentKey = `category-banner-${seed.categoryId
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60)}`;
      const existingBanner = await banners.findMany({
        filters: { contentKey },
        locale: "en-IN",
        limit: 1,
      } as never);
      if (existingBanner.length || !seed.externalBannerImageUrl) continue;
      const createdBanner = await banners.create({
        locale: "en-IN",
        status: "draft",
        data: {
          contentKey,
          name: `${seed.displayLabel} category banner`,
          placement: "b2c.category.banner",
          categoryId: seed.categoryId,
          title: seed.heading,
          externalImageUrl: seed.externalBannerImageUrl,
          imageAltText: seed.bannerImageAltText || seed.heading,
          themeKey: "primary",
          priority: 10,
        },
      } as never);
      const bannerDocumentId = (createdBanner as { documentId?: string }).documentId;
      if (bannerDocumentId) {
        await banners.publish({ documentId: bannerDocumentId, locale: "en-IN" } as never);
      }
    }
    const curated = strapi.documents("api::curated-collection.curated-collection" as never);
    for (const seed of curatedCollectionSeed) {
      const existing = await curated.findMany({
        filters: { collectionKey: seed.collectionKey },
        locale: "en-IN",
        limit: 1,
      } as never);
      if (existing.length) continue;
      const created = await curated.create({
        locale: "en-IN",
        status: "draft",
        data: seed,
      } as never);
      const documentId = (created as { documentId?: string }).documentId;
      if (documentId) {
        await curated.publish({ documentId, locale: "en-IN" } as never);
      }
    }

    strapi.log.info("[cms-seed] storefront presentation seed ensured");
  } catch (error) {
    strapi.log.warn(`[cms-seed] storefront presentation seed skipped: ${(error as Error).message}`);
  }
}
