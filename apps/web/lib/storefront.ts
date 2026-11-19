import type {
  ComposedProduct,
  StorefrontBanner,
  StorefrontCategory,
  StorefrontLayoutSection,
} from "./experience-api";

/** The web store does not use the app's route names. Resolve editorial targets before rendering. */
export function webHrefForAction(
  uri: string | undefined,
  channel: "b2c" | "b2b",
): string | null {
  if (!uri) return null;
  const value = uri.trim();
  if (!value) return null;
  if (/^https:\/\//i.test(value)) return value;
  if (!value.startsWith("/")) return null;
  if (value.startsWith("/product/")) return `/products/${value.slice("/product/".length)}`;
  if (value.startsWith("/products") || value.startsWith("/browse")) return "/search";
  if (value.startsWith("/collections/")) {
    const key = value.slice("/collections/".length).split("?")[0];
    return `/search?campaign=${encodeURIComponent(key)}`;
  }
  if (value.startsWith("/category/")) {
    return `/search?cat=${encodeURIComponent(value.slice("/category/".length))}`;
  }
  if (value.startsWith("/b2b/catalogue")) return "/trade/catalogue";
  if (value.startsWith("/b2b")) return "/trade";
  if (value === "/products") return "/search";
  return value;
}

/**
 * A banner's web destination: the authored web path wins, then the canonical action. Campaign
 * attribution is appended only to web-store links so the app and web remain separable in reporting.
 */
export function bannerHref(
  banner: StorefrontBanner,
  channel: "b2c" | "b2b",
): string | null {
  const href = webHrefForAction(banner.action_web_path ?? banner.action_uri, channel);
  if (!href) return null;
  return withAttribution(href, banner.content_key);
}

export function withAttribution(href: string, campaign: string): string {
  if (!href.startsWith("/")) return href;
  const [path, query = ""] = href.split("?");
  const params = new URLSearchParams(query);
  if (!params.has("utm_source")) params.set("utm_source", "web");
  if (!params.has("utm_medium")) params.set("utm_medium", "banner");
  if (!params.has("utm_campaign")) params.set("utm_campaign", campaign);
  const next = params.toString();
  return next ? `${path}?${next}` : path;
}

/** Web-store copy overrides win; the app copy remains the fallback. */
export function bannerTitle(banner: StorefrontBanner): string {
  return banner.web_title?.trim() || banner.title;
}

export function bannerBody(banner: StorefrontBanner): string | undefined {
  return banner.web_subtitle?.trim() || banner.body;
}

export function bannerCtaLabel(banner: StorefrontBanner): string | undefined {
  return banner.web_cta_label?.trim() || banner.action_label;
}

const FOCAL_POSITIONS: Record<string, string> = {
  center: "center center",
  top: "center top",
  bottom: "center bottom",
  left: "left center",
  right: "right center",
  "top-left": "left top",
  "top-right": "right top",
  "bottom-left": "left bottom",
  "bottom-right": "right bottom",
};

/** CSS object-position for a CMS-authored focal point. */
export function imageObjectPosition(banner?: StorefrontBanner | null): string {
  return FOCAL_POSITIONS[banner?.image_focal_point ?? "center"] ?? "center center";
}

export function sortedBanners(
  banners: StorefrontBanner[],
  placement: string,
): StorefrontBanner[] {
  return banners
    .filter((banner) => banner.placement === placement)
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
}

export function firstBanner(
  banners: StorefrontBanner[],
  placement: string,
): StorefrontBanner | null {
  return sortedBanners(banners, placement)[0] ?? null;
}

/**
 * Pexels supports width variants. Use them for a real srcset while CMS records still carry a single
 * image URL; GitHub/raw and other hosts keep the single source.
 */
export function imageSources(
  url: string | undefined,
  width = 1600,
): { src: string; srcSet?: string } {
  if (!url) return { src: "" };
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "images.pexels.com") {
      const make = (widthValue: number) => {
        const next = new URL(parsed.toString());
        next.searchParams.set("auto", "compress");
        next.searchParams.set("cs", "tinysrgb");
        next.searchParams.set("w", String(widthValue));
        return next.toString();
      };
      return {
        src: make(width),
        srcSet: `${make(640)} 640w, ${make(960)} 960w, ${make(1600)} 1600w`,
      };
    }
  } catch {
    // Fall through to the single URL.
  }
  return { src: url };
}

export function productRootCategoryId(
  product: ComposedProduct,
  rootIds: Set<string>,
): string | null {
  for (const category of product.categories ?? []) {
    if (rootIds.has(category.id)) return category.id;
    if (category.parent_category_id && rootIds.has(category.parent_category_id)) {
      return category.parent_category_id;
    }
  }
  return null;
}

export function productsInStorefrontCategory(
  products: ComposedProduct[],
  category: StorefrontCategory,
): ComposedProduct[] {
  return products.filter(
    (product) => productRootCategoryId(product, new Set([category.category_id])) === category.category_id,
  );
}

export function categoryCount(
  products: ComposedProduct[],
  categories: StorefrontCategory[],
): Map<string, number> {
  const rootIds = new Set(categories.map((category) => category.category_id));
  const counts = new Map<string, number>();
  for (const product of products) {
    const root = productRootCategoryId(product, rootIds);
    if (root) counts.set(root, (counts.get(root) ?? 0) + 1);
  }
  return counts;
}

export function sectionProducts(
  section: StorefrontLayoutSection,
  productsById: Map<string, ComposedProduct>,
): ComposedProduct[] {
  const out: ComposedProduct[] = [];
  for (const reference of section.products ?? []) {
    const product = productsById.get(reference.id);
    if (product) out.push(product);
  }
  return out;
}

export function sectionHref(section: StorefrontLayoutSection, channel: "b2c" | "b2b"): string | null {
  return webHrefForAction(section.see_all_uri, channel);
}

const ICONS: Record<string, string> = {
  electrical: "⚡",
  "bathroom-plumbing": "◉",
  "paints-finishes": "◐",
  agriculture: "🌱",
  "pumps-machines": "⚙",
  construction: "▦",
  "tiles-plywood": "◫",
  "tools-hardware": "✦",
  automotive: "◎",
  miscellaneous: "◇",
};

export function categoryIcon(category: StorefrontCategory): string {
  // Labels are the customer-visible source of truth. CMS icon keys can lag a category relabel.
  const label = `${category.label} ${category.name}`.toLowerCase();
  if (label.includes("electric")) return ICONS.electrical;
  if (label.includes("bath") || label.includes("plumb")) return ICONS["bathroom-plumbing"];
  if (label.includes("paint")) return ICONS["paints-finishes"];
  if (label.includes("agric") || label.includes("seed")) return ICONS.agriculture;
  if (label.includes("pump") || label.includes("machine")) return ICONS["pumps-machines"];
  if (label.includes("construct")) return ICONS.construction;
  if (label.includes("tile") || label.includes("plywood")) return ICONS["tiles-plywood"];
  if (label.includes("tool") || label.includes("hardware")) return ICONS["tools-hardware"];
  if (label.includes("auto") || label.includes("tyre")) return ICONS.automotive;
  if (category.icon_key && ICONS[category.icon_key]) return ICONS[category.icon_key];
  return ICONS.miscellaneous;
}

const TONES = ["tile-indigo", "tile-aqua", "tile-honey", "tile-leaf", "tile-lavender", "tile-night"];

export function categoryTone(index: number): string {
  return TONES[index % TONES.length];
}
