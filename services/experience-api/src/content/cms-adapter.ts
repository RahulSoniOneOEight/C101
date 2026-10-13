import type { AppLocale } from "./app-content.js";
import {
  resolveLayout as resolveSeedLayout,
  type StorefrontChannel,
  type StorefrontLayout,
  type StorefrontLayoutModule,
  type StorefrontModuleMembership,
  type StorefrontModuleType,
} from "./storefront-layout.js";
import type { StoredCmsProjection } from "../store/cms-content-store.js";

type JsonRecord = Record<string, unknown>;

interface CmsProjectionPayload {
  layout: StorefrontLayout | null;
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
          ? { image_uri: mediaUri(banner.imageMobile ?? banner.imageTablet ?? banner.imageDesktop) }
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
  if (!modules.length || new Set(modules.map((module) => module.module_key)).size !== modules.length) {
    return undefined;
  }
  const fallback = relation(entity.fallbackLayout);
  return {
    documentId,
    version,
    layout: {
      layout_key: layoutKey,
      channel,
      locale,
      modules,
      ...(text(entity.startsAt) ? { starts_at: text(entity.startsAt) } : {}),
      ...(text(entity.endsAt) ? { ends_at: text(entity.endsAt) } : {}),
      fallback_layout_key: text(fallback?.layoutKey) ?? null,
      test_data: true,
    },
  };
}

export class CmsContentAdapter {
  private readonly cache = new Map<string, CachedProjection>();
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
    if (uid !== "api::storefront-layout.storefront-layout") return;
    for (const [key, cached] of this.cache) {
      if (cached.cmsDocumentId === documentId || key.startsWith("storefront-layout:")) {
        this.cache.delete(key);
      }
    }
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
