/**
 * Governed storefront presentation seed — CHG-035.
 *
 * These values mirror the hero banners, category labels and category imagery currently shipped in
 * the Flutter app. They are the fallback when no published CMS presentation exists, and the parity
 * reference that keeps the app and the editorial source from drifting.
 *
 * Presentation only. Category identity, hierarchy and product membership remain commerce-owned and
 * are never defined here; `categoryName` is a match key against the Medusa category name.
 */

import type { AppLocale } from "./app-content.js";
import { homeBannerPlacements } from "./placement-registry.js";
import type { StorefrontChannel } from "./storefront-layout.js";
import type {
  StorefrontBannerPresentation,
  StorefrontBannerTheme,
  StorefrontCategoryEditorial,
} from "./cms-adapter.js";

/** A root category, composed from commerce identity and editorial presentation. */
export interface ComposedCategory {
  category_id: string;
  slug: string | null;
  name: string;
  label: string;
  short_text?: string;
  icon_key: string;
  banner_image_uri?: string;
  banner_image_alt?: string;
  /** Whether the presentation came from CMS or the governed fallback. */
  presentation_source: "cms" | "governed-editorial-seed";
}

export interface CategoryIdentity {
  id: string;
  name: string;
  handle?: string | null;
}

export interface CategoryPresentationSeed {
  category_name: string;
  label: string;
  short_text: string;
  icon_key: string;
  banner_image_uri?: string;
}

/** Hero, campaign-strip and secondary banners, mirroring the shipped app creative. */
export const storefrontBannerSeed: StorefrontBannerPresentation[] = [
  {
    content_key: "hero-monsoon-ready",
    placement: "b2c.home.hero",
    title: "Monsoon Ready",
    body: "Up to 40% off waterproofing",
    image_alt: "Waterproofing supplies for monsoon preparation",
    action_label: "Shop now",
    action_uri: "/browse?tag=Flash%20Deals",
    theme_key: "primary",
    priority: 30,
  },
  {
    content_key: "hero-bulk-savings",
    placement: "b2c.home.hero",
    title: "Bulk Savings",
    body: "Dealer pricing on 10,000+ SKUs",
    image_alt: "Stacked bulk building materials",
    action_label: "Shop now",
    action_uri: "/browse?tag=Best%20Sellers",
    theme_key: "trust",
    priority: 20,
  },
  {
    content_key: "hero-free-delivery",
    placement: "b2c.home.hero",
    title: "Free Delivery",
    body: "On orders above ₹2,000",
    image_alt: "Delivery van at a construction site",
    action_label: "Shop now",
    action_uri: "/browse?tag=Clearance%20Sale",
    theme_key: "promotion",
    priority: 10,
  },
  {
    content_key: "secondary-clearance-sale",
    placement: "b2c.home.campaign-strip",
    title: "Clearance Sale",
    body: "Up to 70% off select items",
    image_uri:
      "https://images.pexels.com/photos/10284048/pexels-photo-10284048.jpeg?auto=compress&cs=tinysrgb&h=650&w=940",
    image_alt: "Discounted tools and hardware on display",
    action_label: "Shop Now",
    action_uri: "/browse?tag=Clearance%20Sale",
    theme_key: "promotion",
    priority: 10,
  },
];

/** Root category presentation, keyed by the Medusa category name. */
export const categoryPresentationSeed: CategoryPresentationSeed[] = [
  {
    category_name: "Bathroom & Plumbing",
    label: "Bathroom & Plumbing",
    short_text: "Fittings, sanitaryware and pipes",
    icon_key: "bathroom-plumbing",
    banner_image_uri:
      "https://images.pexels.com/photos/2062426/pexels-photo-2062426.jpeg?auto=compress&cs=tinysrgb&w=940",
  },
  {
    category_name: "Tiles & Plywood",
    label: "Tiles & Plywood",
    short_text: "Flooring, boards and finishes",
    icon_key: "tiles-plywood",
    banner_image_uri:
      "https://images.pexels.com/photos/276724/pexels-photo-276724.jpeg?auto=compress&cs=tinysrgb&w=940",
  },
  {
    category_name: "Electrical",
    label: "Electrical",
    short_text: "Wiring, lighting and switchgear",
    icon_key: "electrical",
    banner_image_uri:
      "https://images.pexels.com/photos/257736/pexels-photo-257736.jpeg?auto=compress&cs=tinysrgb&w=940",
  },
  {
    category_name: "Agriculture & Seeds",
    label: "Agriculture & Seeds",
    short_text: "Seeds, soil and garden tools",
    icon_key: "agriculture",
    banner_image_uri:
      "https://images.pexels.com/photos/265216/pexels-photo-265216.jpeg?auto=compress&cs=tinysrgb&w=940",
  },
  {
    category_name: "Pumps & Machines",
    label: "Pumps & Machines",
    short_text: "Water pumps, generators and machinery",
    icon_key: "pumps-machines",
    banner_image_uri:
      "https://images.pexels.com/photos/175709/pexels-photo-175709.jpeg?auto=compress&cs=tinysrgb&w=940",
  },
  {
    // Matches the deployed Medusa root category name; the app-facing label stays "Construction".
    category_name: "Building & Construction",
    label: "Construction",
    short_text: "Cement, steel, tools and site supplies",
    icon_key: "construction",
    banner_image_uri:
      "https://images.pexels.com/photos/1216589/pexels-photo-1216589.jpeg?auto=compress&cs=tinysrgb&w=940",
  },
];

const DEFAULT_BANNER_ALT = "Promotional banner";

/** Approved icon keys the app resolves to a design-system icon. */
export const ALLOWED_ICON_KEYS = new Set(categoryPresentationSeed.map((item) => item.icon_key));

const THEME_KEYS: StorefrontBannerTheme[] = ["primary", "trust", "promotion", "neutral"];

export function normalizeIconKey(value: string | undefined): string {
  return value && ALLOWED_ICON_KEYS.has(value) ? value : "category";
}

export function normalizeThemeKey(value: string | undefined): StorefrontBannerTheme {
  return THEME_KEYS.includes(value as StorefrontBannerTheme)
    ? (value as StorefrontBannerTheme)
    : "primary";
}

export function seedBannerAlt(value: string | undefined): string {
  return value && value.trim() ? value.trim() : DEFAULT_BANNER_ALT;
}

/**
 * Published fallback banners for a channel, ordered by descending priority.
 *
 * The fallback now uses the same channel-prefixed types as the CMS, so a banner served from the seed
 * is addressed exactly like one served from content. A channel with no home type (B2B) yields no seed
 * banners, which is the honest result: the CMS has no B2B home surface either.
 */
export function resolveSeedBanners(
  channel: StorefrontChannel,
  _locale: AppLocale,
): StorefrontBannerPresentation[] {
  const placements = homeBannerPlacements(channel);
  return storefrontBannerSeed
    .filter((banner) => placements.has(banner.placement))
    .sort((left, right) => right.priority - left.priority);
}

export function seedCategoryPresentation(categoryName: string): CategoryPresentationSeed | undefined {
  const target = categoryName.trim().toLowerCase();
  return categoryPresentationSeed.find((item) => item.category_name.toLowerCase() === target);
}

/**
 * Compose commerce-owned category identity with published editorial presentation.
 *
 * CMS presentation is matched on `category_id` first, then on category name, so the governed
 * fallback keeps working before an operator has saved an editorial record. A category is never
 * dropped because presentation is missing; it falls back to the commerce name and a default icon.
 */
export function composeStorefrontCategories(
  categories: CategoryIdentity[],
  editorials: StorefrontCategoryEditorial[],
): ComposedCategory[] {
  const byId = new Map<string, StorefrontCategoryEditorial>();
  editorials.forEach((item) => {
    byId.set(item.category_id.toLowerCase(), item);
  });

  return categories.map((category) => {
    const seed = seedCategoryPresentation(category.name);
    // Match on the commerce category id; tolerate an editorial record keyed by name so the
    // governed fallback and an operator-saved record resolve to the same category.
    const editorial =
      byId.get(category.id.toLowerCase()) ??
      editorials.find((item) => item.category_id.toLowerCase() === category.name.toLowerCase());
    const label = editorial?.label ?? seed?.label ?? category.name;
    const iconKey = normalizeIconKey(editorial?.icon_key ?? seed?.icon_key);
    const shortText = editorial?.short_text ?? seed?.short_text;
    const bannerImage = editorial?.banner_image_uri ?? seed?.banner_image_uri;
    const bannerAlt = editorial?.banner_image_alt;
    return {
      category_id: category.id,
      slug: category.handle ?? null,
      name: category.name,
      label,
      ...(shortText ? { short_text: shortText } : {}),
      icon_key: iconKey,
      ...(bannerImage ? { banner_image_uri: bannerImage } : {}),
      ...(bannerAlt ? { banner_image_alt: bannerAlt } : {}),
      presentation_source: editorial ? "cms" : "governed-editorial-seed",
    };
  });
}
