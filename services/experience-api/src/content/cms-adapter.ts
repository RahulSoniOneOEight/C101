import type { AppLocale } from "./app-content.js";
import {
  resolveLayout as resolveSeedLayout,
  type StorefrontChannel,
  type StorefrontLayout,
  type StorefrontLayoutModule,
  type StorefrontModuleMembership,
  type StorefrontModuleType,
} from "./storefront-layout.js";
import {
  normaliseLayoutSections,
  type StorefrontLayoutSection,
} from "./layout-sections.js";
import type { StoredCmsProjection } from "../store/cms-content-store.js";
import {
  categoryBannerPlacement,
  homeBannerPlacements,
} from "./placement-registry.js";

type JsonRecord = Record<string, unknown>;

interface CmsProjectionPayload {
  layout: StorefrontLayout | null;
}

interface CmsCollectionProjectionPayload<T> {
  items: T[];
}

interface CmsContentPersistence {
  get<T>(projectionKey: string): Promise<StoredCmsProjection<T> | undefined>;
  put<T>(input: StoredCmsProjection<T>): Promise<void>;
  clear(projectionKey: string): Promise<void>;
}

export interface CmsAdapterConfig {
  baseUrl?: string;
  apiToken?: string;
  cacheTtlSeconds: number;
  requestTimeoutMs?: number;
}

export interface CmsLayoutResolution {
  layout?: StorefrontLayout;
  source: "cms-strapi" | "cms-strapi-last-valid" | "governed-editorial-seed";
  observedAt: string;
  stale: boolean;
}

interface CachedProjection {
  payload: CmsProjectionPayload;
  cmsDocumentId: string;
  version: string;
  observedAt: string;
  expiresAt: number;
}

interface CachedCollectionProjection<T> {
  items: T[];
  observedAt: string;
  expiresAt: number;
}

export type StorefrontBannerTheme = "primary" | "trust" | "promotion" | "neutral";

export interface StorefrontBannerPresentation {
  content_key: string;
  placement: string;
  title: string;
  body?: string;
  image_uri?: string;
  action_label?: string;
  action_uri?: string;
  priority: number;
}

export interface StorefrontCategoryEditorial {
  category_id: string;
  label?: string;
  short_text?: string;
  icon_key?: string;
  banner_image_uri?: string;
  banner_image_alt?: string;
}

export interface CmsCollectionResolution<T> {
  items: T[];
  source: "cms-strapi" | "cms-strapi-last-valid" | "governed-editorial-seed";
  observedAt: string;
  stale: boolean;
}

/** A category banner as stored, keyed by whichever category reference it carries. */
export interface CategoryBannerOverride {
  categoryId: string;
  image?: string;
  alt?: string;
}

const LAYOUT_UIDS: Record<string, StorefrontModuleType> = {
  "layout.hero-banner": "hero-banner",
  "layout.category-rail": "category-rail",
  "layout.product-carousel": "product-carousel",
  "layout.product-composition": "product-composition",
  "layout.split-merchandising": "split-merchandising",
  "layout.offer-collection": "offer-collection",
  "layout.rich-editorial": "rich-editorial",
  "layout.trust-row": "trust-row",
};

function record(value: unknown): JsonRecord | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const raw = value as JsonRecord;
  if (raw.data !== undefined) return record(raw.data);
  const attributes = record(raw.attributes);
  return attributes ? { ...raw, ...attributes } : raw;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const values = value.map(text).filter((item): item is string => Boolean(item));
  return values.length ? values : undefined;
}

function relation(value: unknown): JsonRecord | undefined {
  return record(value);
}

function inWindow(value: JsonRecord, now: Date): boolean {
  const startsAt = text(value.startsAt);
  const endsAt = text(value.endsAt);
  return (!startsAt || new Date(startsAt) <= now) && (!endsAt || new Date(endsAt) > now);
}

function membership(
  ids: unknown,
  collectionValue: unknown,
  itemLimit: unknown,
): StorefrontModuleMembership {
  const collection = relation(collectionValue);
  const collectionKey = text(collection?.collectionKey);
  const itemIds = stringArray(ids);
  const limit = numberValue(itemLimit);
  if (collectionKey) {
    return {
      mode: "curated-collection",
      collection_key: collectionKey,
      ...(limit ? { item_limit: limit } : {}),
    };
  }
  if (itemIds) {
    return {
      mode: "staged-ids",
      item_ids: itemIds,
      ...(limit ? { item_limit: limit } : {}),
    };
  }
  return { mode: "none", ...(limit ? { item_limit: limit } : {}) };
}

function mediaUri(value: unknown): string | undefined {
  const media = relation(value);
  const rawUrl = text(media?.url);
  if (!rawUrl) return undefined;
  let pathname = rawUrl;
  try {
    pathname = new URL(rawUrl).pathname;
  } catch {
    // Relative Strapi media paths are expected.
  }
  if (pathname.startsWith("/uploads/") && !pathname.includes("..")) {
    return `/v1/content/media/${pathname.slice("/uploads/".length)}`;
  }
  return /^https:\/\//i.test(rawUrl) ? rawUrl : undefined;
}

function externalImageUri(value: unknown): string | undefined {
  const rawUrl = text(value);
  if (!rawUrl) return undefined;
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === "https:" ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}

function actionUri(banner: JsonRecord): string | undefined {
  const target = text(banner.ctaTargetId);
  if (!target) return undefined;
  switch (banner.ctaTargetType) {
    case "product": return `/products/${encodeURIComponent(target)}`;
    case "category": return `/categories/${encodeURIComponent(target)}`;
    case "collection": return `/collections/${encodeURIComponent(target)}`;
    default: return target;
  }
}

function mapBannerFields(value: unknown): StorefrontBannerPresentation | undefined {
  const banner = record(value);
  if (!banner) return undefined;
  const contentKey = text(banner.contentKey);
  const placement = text(banner.placement);
  const title = text(banner.title);
  // Alt text and colour theme are no longer authored per banner: the card's heading carries the
  // meaning, and the app owns the gradient. Their absence must not drop the banner.
  if (!contentKey || !placement || !title) return undefined;
  const image = mediaUri(banner.imageMobile ?? banner.imageTablet ?? banner.imageDesktop)
    ?? externalImageUri(banner.externalImageUrl);
  return {
    content_key: contentKey,
    placement,
    title,
    ...(text(banner.subtitle) ? { body: text(banner.subtitle) } : {}),
    ...(image ? { image_uri: image } : {}),
    ...(text(banner.ctaLabel) ? { action_label: text(banner.ctaLabel) } : {}),
    ...(actionUri(banner) ? { action_uri: actionUri(banner) } : {}),
    priority: numberValue(banner.priority) ?? 0,
  };
}

function mapBanner(value: unknown, now: Date): StorefrontBannerPresentation | undefined {
  const banner = record(value);
  if (!banner || !inWindow(banner, now)) return undefined;
  return mapBannerFields(banner);
}

export type StorefrontBannerEligibility = "eligible" | "scheduled" | "expired";

/**
 * Window eligibility from the stored schedule. Delivery uses `inWindow`; this exposes the same
 * decision as a label so an operator surface can distinguish eligible, scheduled and expired
 * without claiming that a banner is being served.
 */
export function bannerEligibility(value: unknown, now: Date): StorefrontBannerEligibility {
  const banner = record(value);
  const startsAt = banner ? text(banner.startsAt) : undefined;
  const endsAt = banner ? text(banner.endsAt) : undefined;
  const start = startsAt ? new Date(startsAt) : null;
  const end = endsAt ? new Date(endsAt) : null;
  if (end && !Number.isNaN(end.getTime()) && end.getTime() <= now.getTime()) return "expired";
  if (start && !Number.isNaN(start.getTime()) && start.getTime() > now.getTime()) return "scheduled";
  return "eligible";
}

/**
 * Draft preview. Uses the same field mapping as live delivery but ignores the delivery window so an
 * operator can inspect a scheduled or expired banner. Returns undefined when required fields are
 * missing, which is itself useful validation feedback.
 */
export function buildBannerPreview(
  value: unknown,
  now: Date,
): { presentation?: StorefrontBannerPresentation; eligibility: StorefrontBannerEligibility } {
  return { presentation: mapBannerFields(value), eligibility: bannerEligibility(value, now) };
}

function mapCategoryEditorial(value: unknown): StorefrontCategoryEditorial | undefined {
  const category = record(value);
  if (!category) return undefined;
  const categoryId = text(category.categoryId);
  if (!categoryId) return undefined;
  const image = mediaUri(category.heroImage);
  return {
    category_id: categoryId,
    ...(text(category.displayLabel) ?? text(category.heading)
      ? { label: text(category.displayLabel) ?? text(category.heading) }
      : {}),
    ...(text(category.shortText) ?? text(category.description)
      ? { short_text: text(category.shortText) ?? text(category.description) }
      : {}),
    ...(text(category.iconKey) ? { icon_key: text(category.iconKey) } : {}),
    ...(image ? { banner_image_uri: image } : {}),
    ...(text(category.heroAltText) ? { banner_image_alt: text(category.heroAltText) } : {}),
  };
}

function mapModule(value: unknown, now: Date): StorefrontLayoutModule | undefined {
  const component = record(value);
  if (!component || !inWindow(component, now)) return undefined;
  const type = LAYOUT_UIDS[text(component.__component) ?? ""];
  const moduleKey = text(component.moduleKey);
  if (!type || !moduleKey) return undefined;

  const common = {
    type,
    module_key: moduleKey,
    ...(text(component.title) ? { title: text(component.title) } : {}),
    ...(text(component.tag) ? { tag: text(component.tag) } : {}),
    ...(text(component.body) ? { body: text(component.body) } : {}),
    ...(text(component.startsAt) ? { starts_at: text(component.startsAt) } : {}),
    ...(text(component.endsAt) ? { ends_at: text(component.endsAt) } : {}),
  } satisfies StorefrontLayoutModule;

  switch (type) {
    case "hero-banner": {
      const banner = relation(component.banner);
      if (!banner || !inWindow(banner, now)) return undefined;
      return {
        ...common,
        ...(text(banner.title) ? { title: text(banner.title) } : {}),
        ...(text(banner.subtitle) ? { body: text(banner.subtitle) } : {}),
        ...(text(banner.contentKey) ? { banner_reference: text(banner.contentKey) } : {}),
        ...(mediaUri(banner.imageMobile ?? banner.imageTablet ?? banner.imageDesktop)
          ?? externalImageUri(banner.externalImageUrl)
          ? { image_uri: mediaUri(banner.imageMobile ?? banner.imageTablet ?? banner.imageDesktop)
            ?? externalImageUri(banner.externalImageUrl) }
          : {}),
        ...(text(banner.imageAltText) ? { image_alt: text(banner.imageAltText) } : {}),
        ...(text(banner.ctaLabel) ? { action_label: text(banner.ctaLabel) } : {}),
        ...(actionUri(banner) ? { action_uri: actionUri(banner) } : {}),
        ...(text(banner.startsAt) ? { starts_at: text(banner.startsAt) } : {}),
        ...(text(banner.endsAt) ? { ends_at: text(banner.endsAt) } : {}),
      };
    }
    case "category-rail":
      return {
        ...common,
        membership: membership(component.categoryIds, undefined, component.itemLimit),
      };
    case "product-carousel":
      return {
        ...common,
        membership: membership(component.productIds, component.collection, component.itemLimit),
      };
    case "offer-collection":
      return {
        ...common,
        membership: membership(component.offerIds, component.collection, component.itemLimit),
      };
    case "product-composition": {
      const presentation = component.presentation;
      return {
        ...common,
        ...(presentation === "grid" || presentation === "feature" || presentation === "compact"
          ? { presentation }
          : {}),
        membership: membership(component.productIds, undefined, undefined),
      };
    }
    case "split-merchandising":
      return {
        ...common,
        ...(mediaUri(component.image) ? { image_uri: mediaUri(component.image) } : {}),
        ...(text(component.imageAltText) ? { image_alt: text(component.imageAltText) } : {}),
        ...(text(component.actionLabel) ? { action_label: text(component.actionLabel) } : {}),
        ...(text(component.actionUri) ? { action_uri: text(component.actionUri) } : {}),
      };
    case "rich-editorial":
    case "trust-row":
      return common;
  }
}

function mapLayout(
  entityValue: unknown,
  requestedLocale: AppLocale,
  now: Date,
): { layout: StorefrontLayout; documentId: string; version: string } | undefined {
  const entity = record(entityValue);
  if (!entity || !inWindow(entity, now)) return undefined;
  const layoutKey = text(entity.layoutKey);
  const channel = entity.channel;
  const locale = (text(entity.locale) ?? requestedLocale) as AppLocale;
  const documentId = text(entity.documentId) ?? text(entity.id);
  const version = text(entity.updatedAt) ?? text(entity.publishedAt);
  if (!layoutKey || (channel !== "b2c" && channel !== "b2b") || !documentId || !version) {
    return undefined;
  }
  const rawModules = Array.isArray(entity.modules) ? entity.modules : [];
  const modules = rawModules
    .map((module) => mapModule(module, now))
    .filter((module): module is StorefrontLayoutModule => Boolean(module));
  if (modules.length && new Set(modules.map((module) => module.module_key)).size !== modules.length) {
    return undefined;
  }
  // Sections are the authorable surface. A layout may carry sections alone; modules stay supported as
  // the recovery format, so a layout is invalid only when it carries neither.
  const { sections } = normaliseLayoutSections(entity.sections, channel, now);
  if (!modules.length && !sections.length) return undefined;
  const fallback = relation(entity.fallbackLayout);
  return {
    documentId,
    version,
    layout: {
      layout_key: layoutKey,
      channel,
      locale,
      modules,
      ...(sections.length ? { sections } : {}),
      ...(Number.isFinite(entity.heroRotationMs) && Number(entity.heroRotationMs) > 0
        ? { hero_rotation_ms: Number(entity.heroRotationMs) }
        : {}),
      ...(text(entity.startsAt) ? { starts_at: text(entity.startsAt) } : {}),
      ...(text(entity.endsAt) ? { ends_at: text(entity.endsAt) } : {}),
      fallback_layout_key: text(fallback?.layoutKey) ?? null,
      test_data: true,
    },
  };
}

export class CmsContentAdapter {
  private readonly cache = new Map<string, CachedProjection>();
  private readonly bannerCache = new Map<string, CachedCollectionProjection<StorefrontBannerPresentation>>();
  private readonly categoryCache = new Map<string, CachedCollectionProjection<StorefrontCategoryEditorial>>();
  private readonly categoryBannerCache =
    new Map<string, CachedCollectionProjection<CategoryBannerOverride>>();
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;

  constructor(
    private readonly config: CmsAdapterConfig,
    private readonly persistence: CmsContentPersistence,
    dependencies: { fetchImpl?: typeof fetch; now?: () => Date } = {},
  ) {
    this.fetchImpl = dependencies.fetchImpl ?? fetch;
    this.now = dependencies.now ?? (() => new Date());
  }

  get enabled(): boolean {
    return Boolean(this.config.baseUrl && this.config.apiToken);
  }

  invalidate(uid: string, documentId: string): void {
    if (uid === "api::storefront-layout.storefront-layout" || uid === "api::banner.banner") {
      for (const [key, cached] of this.cache) {
        if (cached.cmsDocumentId === documentId || key.startsWith("storefront-layout:")) {
          this.cache.delete(key);
        }
      }
    }
    if (uid === "api::banner.banner") {
      this.bannerCache.clear();
      this.categoryBannerCache.clear();
    }
    if (uid === "api::category-editorial.category-editorial") this.categoryCache.clear();
  }

  async resolveLayout(
    channel: StorefrontChannel,
    locale: AppLocale,
  ): Promise<CmsLayoutResolution> {
    const now = this.now();
    if (!this.enabled) {
      return {
        layout: resolveSeedLayout(channel, locale, now),
        source: "governed-editorial-seed",
        observedAt: now.toISOString(),
        stale: false,
      };
    }

    const projectionKey = `storefront-layout:${channel}:${locale}`;
    const cached = this.cache.get(projectionKey);
    if (cached && cached.expiresAt > now.getTime()) {
      return {
        ...(cached.payload.layout ? { layout: cached.payload.layout } : {}),
        source: "cms-strapi",
        observedAt: cached.observedAt,
        stale: false,
      };
    }

    try {
      const fetched = await this.fetchPublishedLayout(channel, locale, now);
      const observedAt = now.toISOString();
      const projection: CachedProjection = fetched
        ? {
            payload: { layout: fetched.layout },
            cmsDocumentId: fetched.documentId,
            version: fetched.version,
            observedAt,
            expiresAt: now.getTime() + this.config.cacheTtlSeconds * 1000,
          }
        : {
            payload: { layout: null },
            cmsDocumentId: `absence:${projectionKey}`,
            version: `absence:${observedAt}`,
            observedAt,
            expiresAt: now.getTime() + this.config.cacheTtlSeconds * 1000,
          };
      this.cache.set(projectionKey, projection);
      await this.persistence.put({
        projectionKey,
        cmsDocumentId: projection.cmsDocumentId,
        version: projection.version,
        payload: projection.payload,
        observedAt,
      });
      return {
        ...(fetched ? { layout: fetched.layout } : {}),
        source: "cms-strapi",
        observedAt,
        stale: false,
      };
    } catch (error) {
      console.warn("[experience-api] CMS layout fetch failed:", (error as Error).message);
      if (cached) {
        return {
          ...(cached.payload.layout ? { layout: cached.payload.layout } : {}),
          source: "cms-strapi-last-valid",
          observedAt: cached.observedAt,
          stale: true,
        };
      }
      const stored = await this.persistence.get<CmsProjectionPayload>(projectionKey);
      if (stored) {
        return {
          ...(stored.payload.layout ? { layout: stored.payload.layout } : {}),
          source: "cms-strapi-last-valid",
          observedAt: stored.observedAt,
          stale: true,
        };
      }
      return {
        layout: resolveSeedLayout(channel, locale, now),
        source: "governed-editorial-seed",
        observedAt: now.toISOString(),
        stale: true,
      };
    }
  }

  async readMedia(path: string): Promise<Response> {
    if (!this.enabled || !this.config.baseUrl) return new Response(null, { status: 404 });
    if (!/^[A-Za-z0-9._/-]+$/.test(path) || path.includes("..") || path.startsWith("/")) {
      return new Response(null, { status: 404 });
    }
    const response = await this.fetchWithTimeout(`${this.config.baseUrl}/uploads/${path}`, {
      headers: { authorization: `Bearer ${this.config.apiToken}` },
    });
    if (!response.ok || !response.body) return new Response(null, { status: response.status });
    return new Response(response.body, {
      status: 200,
      headers: {
        "content-type": response.headers.get("content-type") ?? "application/octet-stream",
        "cache-control": "public, max-age=300, stale-while-revalidate=86400",
      },
    });
  }

  async resolveBanners(
    channel: StorefrontChannel,
    locale: AppLocale,
  ): Promise<CmsCollectionResolution<StorefrontBannerPresentation>> {
    // Only home-surface types compose the home banner list. Category banners are resolved separately
    // for the category surface, so they cannot leak into the hero or campaign strip.
    const homePlacements = homeBannerPlacements(channel);
    return this.resolveCollection({
      projectionKey: `banners:${channel}:${locale}`,
      locale,
      cache: this.bannerCache,
      fetchItems: async (candidateLocale) => {
        const entities = await this.fetchPublishedCollection("banners", candidateLocale);
        return entities
          .filter((entity) => {
            const banner = record(entity);
            return typeof banner?.placement === "string"
              && homePlacements.has(banner.placement.trim());
          })
          .map((entity) => mapBanner(entity, this.now()))
          .filter((item): item is StorefrontBannerPresentation => Boolean(item))
          .sort((left, right) => right.priority - left.priority);
      },
    });
  }

  async resolveCategoryEditorials(
    channel: StorefrontChannel,
    locale: AppLocale,
  ): Promise<CmsCollectionResolution<StorefrontCategoryEditorial>> {    const categoryPlacement = categoryBannerPlacement(channel);
    return this.resolveCollection({
      projectionKey: `category-editorial:${channel}:${locale}`,
      locale,
      cache: this.categoryCache,
      fetchItems: async (candidateLocale) => {
        const [entities, bannerEntities] = await Promise.all([
          this.fetchPublishedCollection("category-editorials", candidateLocale),
          this.fetchPublishedCollection("banners", candidateLocale),
        ]);

        // Category banners now live on the banner content type. The payload shape is unchanged so the
        // customer app needs no update: the banner image is still published as banner_image_uri.
        const now = this.now();
        const bannersByCategory = new Map<string, { image?: string; alt?: string }>();
        if (categoryPlacement) {
          bannerEntities.forEach((entity) => {
            const banner = record(entity);
            if (!banner || !inWindow(banner, now)) return;
            if (String(banner.placement ?? "").trim() !== categoryPlacement) return;
            const categoryId = text(banner.categoryId);
            if (!categoryId) return;
            const image = mediaUri(banner.imageMobile ?? banner.imageTablet ?? banner.imageDesktop)
              ?? externalImageUri(banner.externalImageUrl);
            bannersByCategory.set(categoryId, { image, alt: text(banner.imageAltText) });
          });
        }

        return entities
          .filter((entity) => {
            const editorials = record(entity);
            const rowChannel = text(editorials?.channel) ?? "b2c";
            return rowChannel === channel;
          })
          .map((entity) => {
            const mapped = mapCategoryEditorial(entity);
            if (!mapped) return undefined;
            const override = bannersByCategory.get(mapped.category_id);
            if (!override) return mapped;
            return {
              ...mapped,
              ...(override.image ? { banner_image_uri: override.image } : {}),
              ...(override.alt ? { banner_image_alt: override.alt } : {}),
            };
          })
          .filter((item): item is StorefrontCategoryEditorial => Boolean(item));
      },
    });
  }

  /**
   * Category banners exactly as stored, without joining them to an editorial.
   *
   * The composition step owns the join because only it knows both vocabularies (commerce id and
   * category name), so a banner keyed by id and an editorial keyed by name still meet.
   */
  async resolveCategoryBanners(
    channel: StorefrontChannel,
    locale: AppLocale,
  ): Promise<CmsCollectionResolution<CategoryBannerOverride>> {
    const categoryPlacement = categoryBannerPlacement(channel);
    return this.resolveCollection({
      projectionKey: `category-banner:${channel}:${locale}`,
      locale,
      cache: this.categoryBannerCache,
      fetchItems: async (candidateLocale) => {
        const entities = await this.fetchPublishedCollection("banners", candidateLocale);
        const now = this.now();
        return entities.flatMap((entity) => {
          const banner = record(entity);
          if (!banner || !inWindow(banner, now)) return [];
          if (String(banner.placement ?? "").trim() !== categoryPlacement) return [];
          const categoryId = text(banner.categoryId);
          if (!categoryId) return [];
          const image = mediaUri(banner.imageMobile ?? banner.imageTablet ?? banner.imageDesktop)
            ?? externalImageUri(banner.externalImageUrl);
          const alt = text(banner.imageAltText);
          return [{
            categoryId,
            ...(image ? { image } : {}),
            ...(alt ? { alt } : {}),
          }];
        });
      },
    });
  }

  private async resolveCollection<T>(input: {
    projectionKey: string;
    locale: AppLocale;
    cache: Map<string, CachedCollectionProjection<T>>;
    fetchItems: (locale: AppLocale) => Promise<T[]>;
  }): Promise<CmsCollectionResolution<T>> {
    const now = this.now();
    if (!this.enabled) {
      return { items: [], source: "governed-editorial-seed", observedAt: now.toISOString(), stale: false };
    }
    const cached = input.cache.get(input.projectionKey);
    if (cached && cached.expiresAt > now.getTime()) {
      return { items: cached.items, source: "cms-strapi", observedAt: cached.observedAt, stale: false };
    }
    try {
      const fallbackItems = input.locale === "en-IN" ? [] : await input.fetchItems("en-IN");
      const localizedItems = await input.fetchItems(input.locale);
      const items = this.mergeLocalizedItems(fallbackItems, localizedItems);
      const observedAt = now.toISOString();
      input.cache.set(input.projectionKey, {
        items,
        observedAt,
        expiresAt: now.getTime() + this.config.cacheTtlSeconds * 1000,
      });
      await this.persistence.put<CmsCollectionProjectionPayload<T>>({
        projectionKey: input.projectionKey,
        cmsDocumentId: `collection:${input.projectionKey}`,
        version: observedAt,
        payload: { items },
        observedAt,
      });
      return { items, source: "cms-strapi", observedAt, stale: false };
    } catch (error) {
      console.warn(`[experience-api] CMS ${input.projectionKey} fetch failed:`, (error as Error).message);
      if (cached) {
        return { items: cached.items, source: "cms-strapi-last-valid", observedAt: cached.observedAt, stale: true };
      }
      const stored = await this.persistence.get<CmsCollectionProjectionPayload<T>>(input.projectionKey);
      if (stored) {
        return { items: stored.payload.items, source: "cms-strapi-last-valid", observedAt: stored.observedAt, stale: true };
      }
      return { items: [], source: "governed-editorial-seed", observedAt: now.toISOString(), stale: true };
    }
  }

  private mergeLocalizedItems<T>(fallback: T[], localized: T[]): T[] {
    const key = (item: T): string => {
      const value = item as Record<string, unknown>;
      return String(value.content_key ?? value.category_id ?? JSON.stringify(item));
    };
    const merged = new Map(fallback.map((item) => [key(item), item]));
    localized.forEach((item) => merged.set(key(item), item));
    return [...merged.values()];
  }

  private async fetchPublishedCollection(collection: string, locale: AppLocale): Promise<unknown[]> {
    const query = new URLSearchParams({
      locale,
      status: "published",
      "pagination[pageSize]": "100",
      populate: "*",
    });
    const response = await this.fetchWithTimeout(`${this.config.baseUrl}/api/${collection}?${query}`, {
      headers: { accept: "application/json", authorization: `Bearer ${this.config.apiToken}` },
    });
    if (!response.ok) throw new Error(`Strapi returned ${response.status} for ${collection}.`);
    const body = await response.json() as JsonRecord;
    return Array.isArray(body.data) ? body.data : [];
  }

  private async fetchPublishedLayout(
    channel: StorefrontChannel,
    locale: AppLocale,
    now: Date,
  ): Promise<{ layout: StorefrontLayout; documentId: string; version: string } | undefined> {
    const locales: AppLocale[] = locale === "en-IN" ? [locale] : [locale, "en-IN"];
    for (const candidateLocale of locales) {
      const query = this.layoutQuery(channel, candidateLocale);
      const response = await this.fetchWithTimeout(`${this.config.baseUrl}/api/storefront-layouts?${query}`, {
        headers: {
          accept: "application/json",
          authorization: `Bearer ${this.config.apiToken}`,
        },
      });
      if (!response.ok) throw new Error(`Strapi returned ${response.status} for storefront layouts.`);
      const body = await response.json() as JsonRecord;
      const entities = Array.isArray(body.data) ? body.data : [];
      for (const entity of entities) {
        const mapped = mapLayout(entity, candidateLocale, now);
        if (mapped) return mapped;
      }
    }
    return undefined;
  }

  private layoutQuery(channel: StorefrontChannel, locale: AppLocale): string {
    const query = new URLSearchParams();
    query.set("filters[channel][$eq]", channel);
    query.set("locale", locale);
    query.set("status", "published");
    query.set("sort[0]", "updatedAt:desc");
    query.set("pagination[pageSize]", "20");
    query.set("populate[fallbackLayout][fields][0]", "layoutKey");
    for (const uid of [
      "layout.category-rail",
      "layout.product-composition",
      "layout.rich-editorial",
      "layout.trust-row",
    ]) {
      query.set(`populate[modules][on][${uid}][populate]`, "*");
    }
    query.set(
      "populate[modules][on][layout.hero-banner][populate][banner][populate]",
      "*",
    );
    query.set(
      "populate[modules][on][layout.product-carousel][populate][collection][fields][0]",
      "collectionKey",
    );
    query.set(
      "populate[modules][on][layout.offer-collection][populate][collection][fields][0]",
      "collectionKey",
    );
    query.set(
      "populate[modules][on][layout.split-merchandising][populate][image][fields][0]",
      "url",
    );
    return query.toString();
  }

  private async fetchWithTimeout(input: string, init: RequestInit): Promise<Response> {
    return this.fetchImpl(input, {
      ...init,
      signal: AbortSignal.timeout(this.config.requestTimeoutMs ?? 3000),
    });
  }
}
