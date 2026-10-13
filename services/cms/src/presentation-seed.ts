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
  audience: "b2c" | "b2b" | "both";
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
  {
    contentKey: "hero-monsoon-ready",
    audience: "both",
    placement: "home.hero",
    title: "Monsoon Ready",
    subtitle: "Up to 40% off waterproofing",
    ctaLabel: "Shop now",
    ctaTargetType: "route",
    ctaTargetId: "/browse?tag=Flash%20Deals",
    imageAltText: "Waterproofing supplies for monsoon preparation",
    themeKey: "primary",
    priority: 30,
  },
  {
    contentKey: "hero-bulk-savings",
    audience: "both",
    placement: "home.hero",
    title: "Bulk Savings",
    subtitle: "Dealer pricing on 10,000+ SKUs",
    ctaLabel: "Shop now",
    ctaTargetType: "route",
    ctaTargetId: "/browse?tag=Best%20Sellers",
    imageAltText: "Stacked bulk building materials",
    themeKey: "trust",
    priority: 20,
  },
  {
    contentKey: "hero-free-delivery",
    audience: "both",
    placement: "home.hero",
    title: "Free Delivery",
    subtitle: "On orders above ₹2,000",
    ctaLabel: "Shop now",
    ctaTargetType: "route",
    ctaTargetId: "/browse?tag=Clearance%20Sale",
    imageAltText: "Delivery van at a construction site",
    themeKey: "promotion",
    priority: 10,
  },
  {
    contentKey: "secondary-clearance-sale",
    audience: "both",
    placement: "home.campaign-strip",
    title: "Clearance Sale",
    subtitle: "Up to 70% off select items",
    ctaLabel: "Shop Now",
    ctaTargetType: "route",
    ctaTargetId: "/browse?tag=Clearance%20Sale",
    externalImageUrl:
      "https://images.pexels.com/photos/10284048/pexels-photo-10284048.jpeg?auto=compress&cs=tinysrgb&h=650&w=940",
    imageAltText: "Discounted tools and hardware on display",
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
    categoryId: "Construction",
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
 * Create missing presentation records and publish them. Never overwrites an existing record, so an
 * operator edit always wins. Fail-soft: a seeding error is logged and never blocks startup.
 */
export async function seedStorefrontPresentation(strapi: Core.Strapi): Promise<void> {
  if (process.env.NODE_ENV === "production") return;
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
        filters: { categoryId: seed.categoryId },
        locale: "en-IN",
        limit: 1,
      } as never);
      if (existing.length) continue;
      const created = await categories.create({
        locale: "en-IN",
        status: "draft",
        data: seed,
      } as never);
      const documentId = (created as { documentId?: string }).documentId;
      if (documentId) {
        await categories.publish({ documentId, locale: "en-IN" } as never);
      }
    }
    strapi.log.info("[cms-seed] storefront presentation seed ensured");
  } catch (error) {
    strapi.log.warn(`[cms-seed] storefront presentation seed skipped: ${(error as Error).message}`);
  }
}
