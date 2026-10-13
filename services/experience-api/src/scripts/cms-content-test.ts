import assert from "node:assert/strict";
import { CmsContentAdapter } from "../content/cms-adapter.js";
import { signCmsWebhook, verifyCmsWebhook } from "../content/cms-webhook.js";
import type { StoredCmsProjection } from "../store/cms-content-store.js";

class MemoryPersistence {
  readonly values = new Map<string, StoredCmsProjection<unknown>>();

  async get<T>(key: string): Promise<StoredCmsProjection<T> | undefined> {
    return this.values.get(key) as StoredCmsProjection<T> | undefined;
  }

  async put<T>(value: StoredCmsProjection<T>): Promise<void> {
    this.values.set(value.projectionKey, value as StoredCmsProjection<unknown>);
  }

  async clear(key: string): Promise<void> {
    this.values.delete(key);
  }
}

const now = new Date("2026-10-20T10:00:00.000Z");
const cmsResponse = {
  data: [{
    documentId: "layout-doc-1",
    layoutKey: "cms-b2c-home",
    channel: "b2c",
    locale: "en-IN",
    updatedAt: "2026-10-20T09:55:00.000Z",
    publishedAt: "2026-10-20T09:56:00.000Z",
    modules: [
      {
        __component: "layout.hero-banner",
        moduleKey: "cms-home-hero",
        internalName: "Home hero",
        banner: {
          contentKey: "welcome-banner",
          title: "Build better",
          subtitle: "Everything for the jobsite",
          imageMobile: { url: "/uploads/home.jpg" },
          imageAltText: "Tools ready on a workbench",
          ctaLabel: "Shop now",
          ctaTargetType: "category",
          ctaTargetId: "pcat_construction",
        },
      },
      {
        __component: "layout.offer-collection",
        moduleKey: "cms-best-deals",
        title: "Best Deals",
        tag: "Up to 60% off",
        offerIds: ["offer-reference-only"],
        collection: { collectionKey: "power-tool-week" },
        itemLimit: 10,
      },
    ],
  }],
};

const persistence = new MemoryPersistence();
let mode: "ok" | "empty" | "error" = "ok";
let requests = 0;
const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
  requests += 1;
  const url = new URL(String(input));
  assert.equal(url.searchParams.get("status"), "published", "adapter must request published documents only");
  assert.equal(url.searchParams.get("filters[channel][$eq]"), "b2c");
  assert.equal(init?.headers && (init.headers as Record<string, string>).authorization, "Bearer read-token");
  if (mode === "error") throw new Error("CMS unavailable");
  return Response.json(mode === "empty" ? { data: [] } : cmsResponse);
}) as typeof fetch;

const adapter = new CmsContentAdapter(
  { baseUrl: "http://cms:1337", apiToken: "read-token", cacheTtlSeconds: 60 },
  persistence,
  { fetchImpl, now: () => now },
);

const first = await adapter.resolveLayout("b2c", "en-IN");
assert.equal(first.source, "cms-strapi");
assert.equal(first.stale, false);
assert.equal(first.layout?.layout_key, "cms-b2c-home");
assert.equal(first.layout?.modules[0].image_uri, "/v1/content/media/home.jpg");
assert.equal(first.layout?.modules[0].action_uri, "/categories/pcat_construction");
const deals = first.layout?.modules.find((module) => module.module_key === "cms-best-deals");
assert.equal(deals?.title, "Best Deals");
assert.equal(deals?.tag, "Up to 60% off");
assert.deepEqual(deals?.membership, {
  mode: "curated-collection",
  collection_key: "power-tool-week",
  item_limit: 10,
});
for (const forbidden of ["price", "stock", "seller", "payment", "commission"]) {
  assert.equal(JSON.stringify(first.layout).includes(`"${forbidden}`), false);
}

await adapter.resolveLayout("b2c", "en-IN");
assert.equal(requests, 1, "fresh projection must be served from memory");

adapter.invalidate("api::storefront-layout.storefront-layout", "layout-doc-1");
mode = "error";
const stale = await adapter.resolveLayout("b2c", "en-IN");
assert.equal(stale.source, "cms-strapi-last-valid");
assert.equal(stale.stale, true);
assert.equal(stale.layout?.layout_key, "cms-b2c-home");

adapter.invalidate("api::storefront-layout.storefront-layout", "layout-doc-1");
mode = "empty";
const absent = await adapter.resolveLayout("b2c", "en-IN");
assert.equal(absent.source, "cms-strapi");
assert.equal(absent.layout, undefined, "confirmed CMS absence must omit the layout");

adapter.invalidate("api::storefront-layout.storefront-layout", "new-layout-doc");
mode = "error";
const lastValidAbsence = await adapter.resolveLayout("b2c", "en-IN");
assert.equal(lastValidAbsence.source, "cms-strapi-last-valid");
assert.equal(lastValidAbsence.layout, undefined, "an observed absence must not resurrect the seed");

const fallback = new CmsContentAdapter(
  { cacheTtlSeconds: 60 },
  new MemoryPersistence(),
  { now: () => now },
);
assert.equal((await fallback.resolveLayout("b2c", "en-IN")).source, "governed-editorial-seed");

const secret = "test-secret-not-for-deployment";
const rawBody = JSON.stringify({
  schema_version: 1,
  event_id: "cms_event_1",
  event: "entry.publish",
  uid: "api::storefront-layout.storefront-layout",
  document_id: "layout-doc-1",
  locale: "en-IN",
  version: "2026-10-20T09:55:00.000Z",
  occurred_at: now.toISOString(),
});
const timestamp = String(Math.floor(now.getTime() / 1000));
const headers = new Headers({
  "x-cms-webhook-id": "cms_event_1",
  "x-cms-webhook-timestamp": timestamp,
  "x-cms-webhook-signature": `v1=${signCmsWebhook(rawBody, timestamp, secret)}`,
});
assert.equal(verifyCmsWebhook(rawBody, headers, secret, now, 300).ok, true);

const badSignature = new Headers(headers);
badSignature.set("x-cms-webhook-signature", `v1=${"0".repeat(64)}`);
assert.deepEqual(verifyCmsWebhook(rawBody, badSignature, secret, now, 300), {
  ok: false,
  status: 401,
  reason: "invalid-signature",
});

const staleTimestamp = String(Math.floor(now.getTime() / 1000) - 301);
const staleHeaders = new Headers({
  "x-cms-webhook-id": "cms_event_1",
  "x-cms-webhook-timestamp": staleTimestamp,
  "x-cms-webhook-signature": `v1=${signCmsWebhook(rawBody, staleTimestamp, secret)}`,
});
assert.equal(verifyCmsWebhook(rawBody, staleHeaders, secret, now, 300).ok, false);

console.log(
  "cms-content-test: PASS (published mapping, references, cache, last-valid, confirmed absence, seed fallback, HMAC verification)",
);
