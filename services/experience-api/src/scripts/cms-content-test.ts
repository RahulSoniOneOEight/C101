import assert from "node:assert/strict";
import { CmsContentProvider } from "../content/cms-content.js";

const now = Date.now();
const banners = [
  {
    documentId: "banner-shared",
    locale: "en-IN",
    audience: "both",
    placement: "home.hero",
    title: "Shared hero",
    subtitle: "For every customer",
    ctaLabel: "Browse",
    ctaTargetType: "route",
    ctaTargetId: "/products",
    startsAt: new Date(now - 60_000).toISOString(),
    endsAt: new Date(now + 60_000).toISOString(),
    priority: 10,
    version: 2,
  },
  {
    documentId: "banner-consumer",
    locale: "en-IN",
    audience: "b2c",
    placement: "home.hero",
    title: "Consumer hero",
    ctaTargetType: "product",
    ctaTargetId: "prod_123",
    priority: 20,
    version: 1,
  },
  {
    documentId: "banner-future",
    locale: "en-IN",
    audience: "both",
    placement: "home.hero",
    title: "Future hero",
    startsAt: new Date(now + 3_600_000).toISOString(),
    priority: 100,
  },
];

const server = Bun.serve({
  port: 0,
  fetch(request) {
    if (request.headers.get("x-buildkart-cms-key") !== "test-key") {
      return Response.json({ error: "forbidden" }, { status: 403 });
    }
    return Response.json({ data: banners });
  },
});

try {
  const provider = new CmsContentProvider({
    baseUrl: `http://127.0.0.1:${server.port}`,
    internalKey: "test-key",
  });

  const b2c = await provider.resolve({ locale: "en-IN", placement: "home.hero", audience: "b2c" });
  assert.equal(b2c.source, "strapi");
  assert.equal(b2c.stale, false);
  assert.deepEqual(b2c.items.map((item) => item.id), ["banner-consumer", "banner-shared"]);
  assert.equal(b2c.items[0].action_uri, "/products/prod_123");
  assert.equal(b2c.items[1].version, 2);

  const shared = await provider.resolve({ locale: "en-IN", placement: "home.hero", audience: "both" });
  assert.deepEqual(shared.items.map((item) => item.id), ["banner-shared"]);

  const hindiFallback = await provider.resolve({ locale: "hi-IN", placement: "home.hero", audience: "both" });
  assert.equal(hindiFallback.items[0].locale, "en-IN");

  server.stop(true);
  const cached = await provider.resolve({ locale: "en-IN", placement: "home.hero", audience: "b2c" });
  assert.equal(cached.source, "strapi-last-valid");
  assert.equal(cached.stale, true);
  assert.deepEqual(cached.items.map((item) => item.id), ["banner-consumer", "banner-shared"]);

  const seedFallback = await new CmsContentProvider({
    baseUrl: "http://127.0.0.1:1",
  }).resolve({ locale: "en-IN", placement: "home.hero", audience: "both" });
  assert.equal(seedFallback.source, "governed-editorial-seed");
  assert.equal(seedFallback.stale, true);

  console.log("CMS content projection tests passed.");
} finally {
  server.stop(true);
}
