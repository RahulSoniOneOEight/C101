/**
 * CHG-035 — storefront presentation assertions.
 *
 * Verifies that hero/category banners and category labels/icons are delivered from the backend,
 * that CMS presentation overrides the governed seed by commerce category id, that fallback never
 * blocks a category, and that no transactional field leaks into the payload.
 */
import assert from "node:assert/strict";
import { CmsContentAdapter, buildBannerPreview } from "../content/cms-adapter.js";
import {
  composeStorefrontCategories,
  resolveSeedBanners,
  normalizeIconKey,
} from "../content/presentation.js";
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

const bannerResponse = {
  data: [
    {
      contentKey: "cms-hero",
      placement: "b2c.home.hero",
      title: "CMS hero",
      subtitle: "Backend managed",
      externalImageUrl: "https://images.example.com/hero.jpg",
      imageAltText: "Hero creative",
      ctaLabel: "Shop",
      ctaTargetType: "collection",
      ctaTargetId: "power-tool-week",
      themeKey: "trust",
      priority: 5,
    },
    {
      // Alt text is no longer authored, so a banner without one must still ship.
      contentKey: "cms-no-alt",
      placement: "b2c.home.hero",
      title: "Missing alt",
    },
    {
      // A category banner must never leak into the home banner list.
      contentKey: "cms-b2c-category-banner",
      placement: "b2c.category.banner",
      categoryId: "pcat_construction",
      title: "Construction banner",
      subtitle: "Site supplies and bulk cement",
      externalImageUrl: "https://images.example.com/category-banner.jpg",
      imageAltText: "Construction category banner",
      priority: 10,
    },
    {
      // CHG-087: the banner heading/subtitle outrank the category editorial and the seed.
      contentKey: "cms-b2c-category-banner-electrical",
      placement: "b2c.category.banner",
      categoryId: "pcat_electrical",
      title: "Electrical switchgear and lighting",
      subtitle: "Wiring, fittings and switchgear",
      priority: 20,
    },
    {
      // Artwork only. The heading is required by the CMS schema, but the composer must still
      // tolerate an empty value rather than blanking the seed label.
      contentKey: "cms-b2c-category-banner-agri",
      placement: "b2c.category.banner",
      categoryId: "pcat_agri",
      title: "",
      externalImageUrl: "https://images.example.com/agri-banner.jpg",
      priority: 30,
    },
    {
      // A B2B category banner must not reach the B2C category surface either.
      contentKey: "cms-b2b-category-banner",
      placement: "b2b.category.banner",
      categoryId: "pcat_construction",
      title: "Trade construction banner",
      subtitle: "Trade pricing for site supplies",
      externalImageUrl: "https://images.example.com/trade-category-banner.jpg",
      imageAltText: "Trade construction category banner",
      priority: 99,
    },
  ],
};

const categoryResponse = {
  data: [
    {
      categoryId: "pcat_construction",
      displayLabel: "Construction & Site",
      shortText: "Cement, steel and site supplies",
      iconKey: "construction",
      externalBannerImageUrl: "https://images.example.com/construction.jpg",
      bannerImageAltText: "Construction site",
      heading: "Construction",
    },
  ],
};

let collection: "banners" | "category-editorials" = "banners";
const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(String(input));
  assert.equal(url.searchParams.get("status"), "published");
  assert.equal(init?.headers && (init.headers as Record<string, string>).authorization, "Bearer read-token");
  if (url.pathname.endsWith("/banners")) return Response.json(bannerResponse);
  if (url.pathname.endsWith("/category-editorials")) return Response.json(categoryResponse);
  throw new Error(`unexpected collection ${url.pathname}`);
}) as typeof fetch;

const adapter = new CmsContentAdapter(
  { baseUrl: "http://cms:1337", apiToken: "read-token", cacheTtlSeconds: 60 },
  new MemoryPersistence(),
  { fetchImpl, now: () => now },
);

// --- banners ---------------------------------------------------------------------------------
const banners = await adapter.resolveBanners("b2c", "en-IN");
assert.equal(banners.source, "cms-strapi");
assert.equal(banners.items.length, 2, "a banner without alt text or theme still ships");
const hero = banners.items.find((item) => item.content_key === "cms-hero");
assert.ok(hero, "the hero banner should be delivered");
assert.equal(hero.image_uri, "https://images.example.com/hero.jpg");
assert.equal(hero.action_uri, "/collections/power-tool-week");
assert.equal(
  Object.prototype.hasOwnProperty.call(hero, "image_alt"),
  false,
  "alt text is no longer part of the banner contract",
);
assert.equal(
  Object.prototype.hasOwnProperty.call(hero, "theme_key"),
  false,
  "colour theme is no longer part of the banner contract",
);
assert.equal(
  banners.items.some((item) => item.content_key.includes("category")),
  false,
  "category banners must not appear in the home banner list",
);

// --- category editorials ---------------------------------------------------------------------
collection = "category-editorials";
const editorials = await adapter.resolveCategoryEditorials("b2c", "en-IN");
assert.equal(editorials.items.length, 1);
assert.equal(editorials.items[0].category_id, "pcat_construction");
assert.equal(editorials.items[0].label, "Construction & Site");
assert.equal(
  editorials.items[0].banner_image_uri,
  "https://images.example.com/category-banner.jpg",
  "the B2C category banner now owns the category image",
);
assert.equal(editorials.items[0].banner_image_alt, "Construction category banner");

// --- composition: CMS overrides the governed seed --------------------------------------------
const composed = composeStorefrontCategories(
  [
    { id: "pcat_construction", name: "Construction", handle: "construction" },
    { id: "pcat_electrical", name: "Electrical", handle: "electrical" },
  ],
  editorials.items,
);
const construction = composed.find((item) => item.category_id === "pcat_construction");
assert.equal(construction?.presentation_source, "cms");
assert.equal(construction?.label, "Construction & Site");
assert.equal(construction?.short_text, "Cement, steel and site supplies");
assert.equal(construction?.icon_key, "construction");
assert.equal(construction?.banner_image_uri, "https://images.example.com/category-banner.jpg");

const electrical = composed.find((item) => item.category_id === "pcat_electrical");
assert.equal(electrical?.presentation_source, "governed-editorial-seed");
assert.equal(electrical?.label, "Electrical", "a missing editorial must fall back to the commerce name");
assert.equal(electrical?.icon_key, "electrical");

const prioritized = composeStorefrontCategories(
  [
    { id: "pcat_agri", name: "Agriculture & Seeds" },
    { id: "pcat_paint", name: "Paints & Finishes" },
    { id: "pcat_bath", name: "Bathroom & Plumbing" },
    { id: "pcat_light", name: "Lighting & Electrical" },
    { id: "pcat_tools", name: "Tools & Hardware" },
  ],
  [],
);
assert.deepEqual(
  prioritized.map((item) => item.name),
  [
    "Lighting & Electrical",
    "Bathroom & Plumbing",
    "Paints & Finishes",
    "Agriculture & Seeds",
    "Tools & Hardware",
  ],
  "only the three approved categories move; all remaining categories stay stable",
);

// --- a name-keyed editorial and an id-keyed banner must still meet ------------------------------
const tolerant = composeStorefrontCategories(
  [{ id: "pcat_agri", name: "Agriculture & Seeds", handle: "agriculture-&-seeds" }],
  [
    {
      category_id: "Agriculture & Seeds",
      label: "Agriculture & Seeds",
      icon_key: "agriculture",
    },
  ],
  [{ categoryId: "pcat_agri", image: "https://images.example.com/agri.png" }],
);
assert.equal(
  tolerant[0].banner_image_uri,
  "https://images.example.com/agri.png",
  "an id-keyed banner must apply to a name-keyed editorial",
);

// --- CHG-087 / U-001: the published category banner owns the category copy ---------------------
collection = "banners";
const categoryBanners = await adapter.resolveCategoryBanners("b2c", "en-IN");
const constructionBanner = categoryBanners.items.find((item) => item.categoryId === "pcat_construction");
assert.equal(constructionBanner?.title, "Construction banner", "the banner heading is carried for composition");
assert.equal(constructionBanner?.subtitle, "Site supplies and bulk cement");
assert.equal(constructionBanner?.image, "https://images.example.com/category-banner.jpg");
assert.equal(constructionBanner?.alt, "Construction category banner");
assert.equal(
  categoryBanners.items.some((item) => item.categoryId === "pcat_electrical"),
  true,
  "a banner without artwork is still a text override",
);

const withBannerText = composeStorefrontCategories(
  [
    { id: "pcat_construction", name: "Construction", handle: "construction" },
    { id: "pcat_electrical", name: "Electrical", handle: "electrical" },
    { id: "pcat_agri", name: "Agriculture & Seeds", handle: "agriculture-&-seeds" },
    { id: "pcat_misc", name: "Miscellaneous" },
  ],
  editorials.items,
  categoryBanners.items,
);

// R1/R2: heading and subtitle beat the category editorial.
const overEditorial = withBannerText.find((item) => item.category_id === "pcat_construction")!;
assert.equal(overEditorial.label, "Construction banner", "the banner heading outranks the category editorial");
assert.equal(
  overEditorial.short_text,
  "Site supplies and bulk cement",
  "the banner subtitle outranks the editorial short text",
);
assert.equal(
  overEditorial.banner_image_uri,
  "https://images.example.com/category-banner.jpg",
  "image delivery is unchanged by the text override",
);
assert.equal(overEditorial.banner_image_alt, "Construction category banner");
assert.equal(overEditorial.presentation_source, "cms");

// R1/R2: heading and subtitle beat the governed seed; the seed still supplies the icon.
const overSeed = withBannerText.find((item) => item.category_id === "pcat_electrical")!;
assert.equal(overSeed.label, "Electrical switchgear and lighting", "the banner heading outranks the governed seed");
assert.equal(overSeed.short_text, "Wiring, fittings and switchgear");
assert.equal(overSeed.icon_key, "electrical", "the icon still comes from the governed seed");
assert.equal(overSeed.presentation_source, "cms");

// R3: empty banner copy falls through to the seed, and never blanks the label.
const imageOnlyBanner = withBannerText.find((item) => item.category_id === "pcat_agri")!;
assert.equal(imageOnlyBanner.label, "Agriculture & Seeds", "an empty heading must not blank the seed label");
assert.equal(imageOnlyBanner.short_text, "Seeds, soil and garden tools");
assert.equal(imageOnlyBanner.banner_image_uri, "https://images.example.com/agri-banner.jpg");

// R3: an empty subtitle alone falls back to the editorial short text.
const titleOnly = composeStorefrontCategories(
  [{ id: "pcat_construction", name: "Construction", handle: "construction" }],
  editorials.items,
  [{ categoryId: "pcat_construction", title: "Banner heading only" }],
);
assert.equal(titleOnly[0].label, "Banner heading only");
assert.equal(titleOnly[0].short_text, "Cement, steel and site supplies", "an empty subtitle falls back to the editorial");

// R3: with no banner, no editorial and no seed the commerce name is the last resort.
const commerceOnly = withBannerText.find((item) => item.category_id === "pcat_misc")!;
assert.equal(commerceOnly.label, "Miscellaneous", "the commerce name is the last resort");
assert.equal(commerceOnly.presentation_source, "governed-editorial-seed");

// R1/R2 apply to B2B through its own banner, isolated from the B2C copy.
const b2bCategoryBanners = await adapter.resolveCategoryBanners("b2b", "en-IN");
const b2bComposed = composeStorefrontCategories(
  [{ id: "pcat_construction", name: "Construction", handle: "construction" }],
  [],
  b2bCategoryBanners.items,
);
assert.equal(b2bComposed[0].label, "Trade construction banner", "B2B category banners deliver their own heading");
assert.equal(b2bComposed[0].short_text, "Trade pricing for site supplies");
assert.equal(b2bComposed[0].banner_image_uri, "https://images.example.com/trade-category-banner.jpg");
assert.equal(b2bComposed[0].presentation_source, "cms");

// R4: category copy never leaks into the home banner list.
const homeTitles = banners.items.map((banner) => banner.title);
for (const categoryTitle of ["Construction banner", "Electrical switchgear and lighting", "Trade construction banner"]) {
  assert.equal(
    homeTitles.includes(categoryTitle),
    false,
    `the home banner list must not carry category copy: ${categoryTitle}`,
  );
}

// Unknown icon keys are constrained to the approved set.
assert.equal(normalizeIconKey("<script>"), "category");
assert.equal(normalizeIconKey(undefined), "category");

// --- draft preview carries alt text without widening home delivery ---------------------------
const preview = buildBannerPreview(
  {
    contentKey: "cms-b2c-category-banner",
    placement: "b2c.category.banner",
    categoryId: "pcat_construction",
    title: "Construction banner",
    externalImageUrl: "https://images.example.com/category-banner.jpg",
    imageAltText: "Construction category banner",
  },
  now,
);
assert.equal(preview.presentation?.title, "Construction banner");
assert.equal(
  preview.presentation?.image_alt,
  "Construction category banner",
  "the console preview must show the authored alternative text",
);
assert.equal(
  Object.prototype.hasOwnProperty.call(banners.items[0], "image_alt"),
  false,
  "home banner delivery must not gain an alt field",
);
assert.equal(
  buildBannerPreview({ contentKey: "x", placement: "b2c.home.hero", title: "No alt" }, now)
    .presentation?.image_alt,
  undefined,
  "no authored alt means no alt in the preview",
);

// --- fallback seed ---------------------------------------------------------------------------
const seedBanners = resolveSeedBanners("b2c", "en-IN");
assert.ok(seedBanners.some((banner) => banner.placement === "b2c.home.hero"), "hero banners must be seeded");
assert.equal(
  resolveSeedBanners("b2b", "en-IN").length,
  0,
  "B2B has no home surface, so no seed home banners should ship",
);
assert.equal(seedBanners[0].priority >= seedBanners[1].priority, true, "banners are priority ordered");

const disabled = new CmsContentAdapter(
  { cacheTtlSeconds: 60 },
  new MemoryPersistence(),
  { now: () => now },
);
assert.equal((await disabled.resolveBanners("b2c", "en-IN")).items.length, 0);
assert.equal((await disabled.resolveCategoryEditorials("b2c", "en-IN")).items.length, 0);

// --- no transactional leakage ------------------------------------------------------------------
for (const forbidden of ["price", "stock", "inventory", "seller", "commission", "payout"]) {
  assert.equal(JSON.stringify({ banners: banners.items, categories: composed }).includes(`"${forbidden}`), false);
}

console.log(
  "presentation-test: PASS (banners and category presentation delivered from backend, CMS overrides seed, fallback preserved, no transactional leakage)",
);
