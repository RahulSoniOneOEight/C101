/**
 * Storefront layout projection — CHG-032.
 *
 * Editorial composition only. Modules carry labels, badges, media and scheduling; product or offer
 * membership is always a *reference* that commerce resolves at read time. This module must never
 * inline price, stock, seller or order data.
 *
 * The seed mirrors `contracts/fixtures/storefront-layout.json`; the fixture parity test keeps them
 * from drifting.
 */

import type { AppLocale } from "./app-content.js";
import type { StorefrontLayoutSection } from "./layout-sections.js";

export type StorefrontChannel = "b2c" | "b2b";

export type StorefrontModuleType =
  | "hero-banner"
  | "category-rail"
  | "product-carousel"
  | "product-composition"
  | "split-merchandising"
  | "offer-collection"
  | "rich-editorial"
  | "trust-row"
  | "category-banner";

export interface StorefrontModuleMembership {
  mode: "staged-ids" | "curated-collection" | "none";
  collection_key?: string;
  item_ids?: string[];
  item_limit?: number;
}

export interface StorefrontLayoutModule {
  type: StorefrontModuleType;
  module_key: string;
  title?: string;
  tag?: string;
  body?: string;
  presentation?: "grid" | "feature" | "compact";
  position?: "top" | "inline" | "bottom";
  priority?: number;
  image_uri?: string;
  image_alt?: string;
  action_label?: string;
  action_uri?: string;
  category_reference?: string;
  banner_reference?: string;
  starts_at?: string;
  ends_at?: string;
  membership?: StorefrontModuleMembership;
}

export interface StorefrontLayout {
  layout_key: string;
  channel: StorefrontChannel;
  locale: AppLocale;
  modules: StorefrontLayoutModule[];
  /**
   * Ordered merchandising sections. These are the authorable surface; `modules` remains as the raw
   * recovery format during the transition.
   */
  sections?: StorefrontLayoutSection[];
  starts_at?: string;
  ends_at?: string;
  fallback_layout_key: string | null;
  test_data: true;
}

export const storefrontLayouts: StorefrontLayout[] = [
  {
    layout_key: "b2c-home",
    channel: "b2c",
    locale: "en-IN",
    fallback_layout_key: null,
    test_data: true,
    starts_at: "2026-10-01T00:00:00Z",
    ends_at: "2026-12-31T23:59:59Z",
    modules: [
      {
        type: "hero-banner",
        module_key: "home-hero",
        banner_reference: "banner-welcome-en-in",
      },
      {
        type: "category-rail",
        module_key: "home-categories",
        title: "Shop by department",
        membership: {
          mode: "staged-ids",
          item_ids: ["pcat_construction", "pcat_bathroom-plumbing"],
          item_limit: 8,
        },
      },
      {
        // The merchandising label and badge are editorial; membership resolves through the
        // governed collection endpoint, never from an inlined product list.
        type: "offer-collection",
        module_key: "home-best-deals",
        title: "Best Deals",
        tag: "Up to 60% off",
        membership: {
          mode: "curated-collection",
          collection_key: "power-tool-week",
          item_limit: 10,
        },
        starts_at: "2026-10-10T00:00:00Z",
        ends_at: "2026-11-03T23:59:59Z",
      },
      {
        type: "product-carousel",
        module_key: "home-new-arrivals",
        title: "New arrivals",
        membership: {
          mode: "staged-ids",
          item_ids: ["BK-STG-ORDER-1001", "BK-STG-ORDER-1002"],
          item_limit: 10,
        },
      },
      {
        type: "trust-row",
        module_key: "home-trust",
        title: "Why BuildKart",
      },
      {
        type: "category-banner",
        module_key: "cat-construction-promo",
        category_reference: "pcat_construction",
        banner_reference: "content_campaign_site_ready_banner_en_in",
        position: "top",
        priority: 10,
      },
    ],
  },
];

/**
 * Resolve the approved layout for a channel and locale. Returns undefined when none exists —
 * absence omits the layout field and must never fail the request or block commerce.
 */
export function resolveLayout(
  channel: StorefrontChannel,
  locale: AppLocale,
  now: Date = new Date(),
): StorefrontLayout | undefined {
  const candidates = storefrontLayouts.filter((layout) => layout.channel === channel);
  const inWindow = candidates.filter((layout) => {
    const afterStart = !layout.starts_at || new Date(layout.starts_at) <= now;
    const beforeEnd = !layout.ends_at || new Date(layout.ends_at) > now;
    return afterStart && beforeEnd;
  });

  return (
    inWindow.find((layout) => layout.locale === locale) ??
    inWindow.find((layout) => layout.locale === "en-IN")
  );
}
