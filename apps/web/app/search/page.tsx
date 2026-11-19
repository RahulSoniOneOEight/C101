import Link from "next/link";
import {
  getStorefrontPresentation,
  listProducts,
  type ComposedProduct,
  type StorefrontCategory,
} from "@/lib/experience-api";
import { CATEGORIES, categoryBySlug, searchProducts } from "@/lib/catalogue";
import { imageSources, productsInStorefrontCategory } from "@/lib/storefront";
import { ProductCard } from "../components/product-card";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Shop",
};

function sorted(products: ComposedProduct[], sort: string | undefined): ComposedProduct[] {
  const copy = [...products];
  if (sort === "price-asc") {
    copy.sort((a, b) => (a.best_price?.unit_amount_minor ?? Infinity) - (b.best_price?.unit_amount_minor ?? Infinity));
  } else if (sort === "price-desc") {
    copy.sort((a, b) => (b.best_price?.unit_amount_minor ?? -1) - (a.best_price?.unit_amount_minor ?? -1));
  } else if (sort === "name") {
    copy.sort((a, b) => a.title.localeCompare(b.title));
  }
  return copy;
}

function href(params: { q?: string; cat?: string; sort?: string }): string {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.cat) query.set("cat", params.cat);
  if (params.sort) query.set("sort", params.sort);
  const suffix = query.toString();
  return suffix ? `/search?${suffix}` : "/search";
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; cat?: string; sort?: string }>;
}) {
  const { q = "", cat, sort } = await searchParams;
  let products: ComposedProduct[] = [];
  let cmsCategories: StorefrontCategory[] = [];
  let loadError = "";

  const [productsResult, presentationResult] = await Promise.allSettled([
    listProducts(60),
    getStorefrontPresentation("b2c"),
  ]);
  if (productsResult.status === "fulfilled") products = productsResult.value;
  if (presentationResult.status === "fulfilled") {
    cmsCategories = presentationResult.value.categories ?? [];
  }
  if (productsResult.status === "rejected") loadError = (productsResult.reason as Error).message;

  const cmsCategory = cmsCategories.find((candidate) => candidate.slug === cat);
  const legacyCategory = cmsCategory ? undefined : categoryBySlug(cat);
  const categoryLabel = cmsCategory?.label ?? legacyCategory?.name;
  const categorySlug = cmsCategory?.slug ?? legacyCategory?.slug;

  let scope = products;
  if (cmsCategory) {
    scope = productsInStorefrontCategory(products, cmsCategory);
  } else if (legacyCategory) {
    scope = products.filter((product) => searchProducts([product], "", legacyCategory).length > 0);
  }
  const results = sorted(searchProducts(scope, q), sort);
  const heading = categoryLabel
    ? categoryLabel
    : q.trim()
      ? `Results for “${q.trim()}”`
      : "All products";
  const bannerImage = imageSources(cmsCategory?.banner_image_uri, 1600);

  return (
    <section className="catalogue-page">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <span aria-hidden="true">/</span>
        <span>{categoryLabel ?? "Shop"}</span>
      </nav>

      {cmsCategory && bannerImage.src ? (
        <div className="category-banner">
          <img
            src={bannerImage.src}
            srcSet={bannerImage.srcSet}
            sizes="(max-width: 720px) 100vw, 1200px"
            alt={cmsCategory.banner_image_alt ?? cmsCategory.label}
          />
          <div className="category-banner-copy">
            <span className="eyebrow eyebrow-light">BazarBee category</span>
            <strong>{cmsCategory.label}</strong>
            {cmsCategory.short_text ? <span>{cmsCategory.short_text}</span> : null}
          </div>
        </div>
      ) : null}

      <div className="section-heading catalogue-heading">
        <div>
          <span className="eyebrow">BazarBee catalogue</span>
          <h1>{heading}</h1>
          <p className="muted">
            {loadError
              ? "The catalogue is temporarily unavailable."
              : `${results.length} ${results.length === 1 ? "product" : "products"}${
                  categoryLabel ? ` in ${categoryLabel.toLowerCase()}` : ""
                }${q.trim() ? ` matching “${q.trim()}”` : ""}.`}
          </p>
        </div>
        <div className="sort-control">
          <label htmlFor="sort">Sort</label>
          <div className="sort-links">
            <Link className={!sort ? "sort-link active" : "sort-link"} href={href({ q, cat: categorySlug })}>
              Featured
            </Link>
            <Link
              className={sort === "price-asc" ? "sort-link active" : "sort-link"}
              href={href({ q, cat: categorySlug, sort: "price-asc" })}
            >
              Price ↑
            </Link>
            <Link
              className={sort === "price-desc" ? "sort-link active" : "sort-link"}
              href={href({ q, cat: categorySlug, sort: "price-desc" })}
            >
              Price ↓
            </Link>
            <Link
              className={sort === "name" ? "sort-link active" : "sort-link"}
              href={href({ q, cat: categorySlug, sort: "name" })}
            >
              A–Z
            </Link>
          </div>
        </div>
      </div>

      <div className="filter-bar" aria-label="Categories">
        <Link className={!categoryLabel ? "filter-chip active" : "filter-chip"} href={href({ q })}>
          All
        </Link>
        {cmsCategories.length > 0
          ? cmsCategories.map((candidate) => (
              <Link
                key={candidate.category_id}
                className={categorySlug === candidate.slug ? "filter-chip active" : "filter-chip"}
                href={href({ q, cat: candidate.slug })}
              >
                {candidate.label}
              </Link>
            ))
          : CATEGORIES.map((candidate) => (
              <Link
                key={candidate.slug}
                className={categorySlug === candidate.slug ? "filter-chip active" : "filter-chip"}
                href={href({ q, cat: candidate.slug })}
              >
                {candidate.name}
              </Link>
            ))}
      </div>

      <form className="inline-search catalogue-search" action="/search" role="search">
        {categorySlug ? <input type="hidden" name="cat" value={categorySlug} /> : null}
        <input name="q" type="search" defaultValue={q} placeholder="Search the catalogue…" />
        <button className="button" type="submit">
          Search
        </button>
      </form>

      {loadError ? (
        <div className="notice err" role="alert">
          Could not load products. {loadError}
        </div>
      ) : results.length > 0 ? (
        <div className="product-grid">
          {results.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      ) : (
        <div className="empty-panel">
          <h2>No products matched</h2>
          <p className="muted">Try a different search term or browse all categories.</p>
          <Link className="button" href="/search">
            Clear filters
          </Link>
        </div>
      )}
    </section>
  );
}
