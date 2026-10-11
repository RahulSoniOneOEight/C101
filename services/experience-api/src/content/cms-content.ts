import { appContent, resolveContent, type AppContent, type AppLocale } from "./app-content.js";

export type ContentAudience = "b2c" | "b2b" | "both";

interface CmsBanner {
  documentId: string;
  locale?: string;
  contentKey?: string;
  audience?: ContentAudience;
  placement?: string;
  title?: string;
  subtitle?: string;
  ctaLabel?: string | null;
  ctaTargetType?: "route" | "product" | "category" | "collection" | "url";
  ctaTargetId?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  priority?: number;
  version?: number;
  updatedAt?: string;
}

interface CmsListResponse {
  data: CmsBanner[];
}

export interface ContentProjection {
  items: AppContent[];
  source: "strapi" | "strapi-last-valid" | "governed-editorial-seed";
  observedAt: string;
  stale: boolean;
}

function actionUri(banner: CmsBanner): string | null {
  const target = banner.ctaTargetId?.trim();
  if (!target) return null;
  switch (banner.ctaTargetType) {
    case "product": return `/products/${encodeURIComponent(target)}`;
    case "category": return `/categories/${encodeURIComponent(target)}`;
    case "collection": return `/collections/${encodeURIComponent(target)}`;
    case "url": return /^https:\/\//i.test(target) ? target : null;
    case "route":
    default: return target.startsWith("/") ? target : null;
  }
}

function isLive(banner: CmsBanner, now = Date.now()): boolean {
  const startsAt = banner.startsAt ? Date.parse(banner.startsAt) : Number.NEGATIVE_INFINITY;
  const endsAt = banner.endsAt ? Date.parse(banner.endsAt) : Number.POSITIVE_INFINITY;
  return startsAt <= now && endsAt > now;
}

function mapsToAudience(banner: CmsBanner, audience: ContentAudience): boolean {
  return audience === "both" ? banner.audience === "both" : banner.audience === "both" || banner.audience === audience;
}

function toAppContent(banner: CmsBanner): AppContent | null {
  if (!banner.documentId || !banner.title || !banner.placement) return null;
  return {
    id: banner.documentId,
    content_type: "banner",
    placement: banner.placement,
    locale: banner.locale === "hi-IN" ? "hi-IN" : "en-IN",
    title: banner.title,
    body: banner.subtitle ?? "",
    action_label: banner.ctaLabel ?? null,
    action_uri: actionUri(banner),
    version: Number.isInteger(banner.version) ? Number(banner.version) : 1,
    test_data: true,
  };
}

export class CmsContentProvider {
  private readonly baseUrl: string;
  private readonly internalKey: string;
  private readonly lastValid = new Map<string, { items: AppContent[]; observedAt: string }>();

  constructor(input: { baseUrl: string; internalKey?: string }) {
    this.baseUrl = input.baseUrl.replace(/\/$/, "");
    this.internalKey = input.internalKey?.trim() ?? "";
  }

  private cacheKey(locale: AppLocale, placement: string | null, audience: ContentAudience): string {
    return `${locale}|${placement ?? "*"}|${audience}`;
  }

  private fallback(locale: AppLocale, placement: string | null, observedAt: string): ContentProjection {
    return {
      items: placement ? resolveContent(placement, locale) : appContent.filter((item) => item.locale === locale),
      source: "governed-editorial-seed",
      observedAt,
      stale: true,
    };
  }

  async resolve(input: {
    locale: AppLocale;
    placement: string | null;
    audience: ContentAudience;
  }): Promise<ContentProjection> {
    const key = this.cacheKey(input.locale, input.placement, input.audience);
    const now = new Date().toISOString();
    if (!this.internalKey) return this.fallback(input.locale, input.placement, now);

    try {
      const response = await fetch(`${this.baseUrl}/api/buildkart/content/banners?status=published`, {
        headers: { accept: "application/json", "x-buildkart-cms-key": this.internalKey },
        signal: AbortSignal.timeout(3000),
      });
      if (!response.ok) throw new Error(`CMS HTTP ${response.status}`);
      const body = await response.json() as CmsListResponse;
      const localeMatches = body.data.filter((banner) => banner.locale === input.locale);
      const localized = localeMatches.length
        ? localeMatches
        : body.data.filter((banner) => banner.locale === "en-IN");
      const items = localized
        .filter((banner) => isLive(banner))
        .filter((banner) => mapsToAudience(banner, input.audience))
        .filter((banner) => !input.placement || banner.placement === input.placement)
        .sort((left, right) => Number(right.priority ?? 0) - Number(left.priority ?? 0))
        .map((banner) => toAppContent(banner))
        .filter((item): item is AppContent => item !== null);
      this.lastValid.set(key, { items, observedAt: now });
      return { items, source: "strapi", observedAt: now, stale: false };
    } catch (error) {
      const cached = this.lastValid.get(key);
      if (cached) {
        console.warn("[experience-api] serving last-valid CMS content:", (error as Error).message);
        return { items: cached.items, source: "strapi-last-valid", observedAt: cached.observedAt, stale: true };
      }
      console.warn("[experience-api] serving governed content fallback:", (error as Error).message);
      return this.fallback(input.locale, input.placement, now);
    }
  }
}
