import Link from "next/link";
import {
  getStorefrontPresentation,
  listProducts,
  type ComposedProduct,
  type StorefrontCategory,
} from "@/lib/experience-api";
import { CATEGORIES, categoryBySlug, searchProducts } from "@/lib/catalogue";
import {
  DISCOUNT_BANDS,
  FLAG_OPTIONS,
  PRICE_BANDS,
  brandLabel,
  brandOf,
  catalogueHref,
  discountInBand,
  discountPercent,
  matchesCatalogueFilters,
  matchesFlag,
  parseList,
  priceInBand,
  type CatalogueFilterState,
  type CatalogueHrefState,
  type FilterOption,
} from "@/lib/catalogue-filters";
import { GUIDED_PROMPTS, guidedSearchHref, resolveGuidedPrompt } from "@/lib/discovery";
import { getStorefrontLocale } from "@/lib/locale";
import { imageSources, productsInStorefrontCategory } from "@/lib/storefront";
import { CategoryIcon } from "../components/category-icon";
import { CatalogueFilters } from "../components/catalogue-filters";
import { DragScroll } from "../components/drag-scroll";
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
  } else if (sort === "discount") {
    copy.sort((a, b) => discountPercent(b) - discountPercent(a));
  }
  return copy;
}

function brandOptions(products: ComposedProduct[]): FilterOption[] {
  const counts = new Map<string, number>();
  for (const product of products) {
    const brand = brandOf(product);
    if (brand) counts.set(brand, (counts.get(brand) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, label: brandLabel(value), count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    cat?: string;
    sort?: string;
    mode?: string;
    brand?: string | string[];
    price?: string | string[];
    discount?: string | string[];
    flag?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const { q = "", cat, sort, mode } = params;
  const activeFilters: CatalogueFilterState = {
    brands: parseList(params.brand),
    prices: parseList(params.price),
    discounts: parseList(params.discount),
    flags: parseList(params.flag),
  };
  const locale = await getStorefrontLocale();
  let products: ComposedProduct[] = [];
  let cmsCategories: StorefrontCategory[] = [];
  let loadError = "";

  const [productsResult, presentationResult] = await Promise.allSettled([
    listProducts(60),
    getStorefrontPresentation("b2c", locale),
  ]);
  if (productsResult.status === "fulfilled") products = productsResult.value;
  if (presentationResult.status === "fulfilled") {
    cmsCategories = presentationResult.value.categories ?? [];
  }
  if (productsResult.status === "rejected") loadError = (productsResult.reason as Error).message;

  // Guided search maps a household task to the closest stocked aisle. It is deterministic and
  // never claims to be a generative answer; the banner says exactly what was matched.
  const guided = mode === "guided" || mode === "ai" ? resolveGuidedPrompt(q) : null;
  const requestedCat = cat ?? guided?.categorySlug;
  const cmsCategory = cmsCategories.find((candidate) => candidate.slug === requestedCat);
  const legacyCategory = cmsCategory ? undefined : categoryBySlug(requestedCat);
  const categoryLabel = cmsCategory?.label ?? legacyCategory?.name;
  const categorySlug = cmsCategory?.slug ?? legacyCategory?.slug;
  const effectiveQuery = guided?.query ?? q;
  const displayQuery = guided ? "" : q;

  let scope = products;
  if (cmsCategory) {
    scope = productsInStorefrontCategory(products, cmsCategory);
  } else if (legacyCategory) {
    scope = products.filter((product) => searchProducts([product], "", legacyCategory).length > 0);
  }
  const searched = searchProducts(scope, effectiveQuery);
  const brandOptionsList = brandOptions(searched);
  const priceOptions: FilterOption[] = PRICE_BANDS.map((band) => ({
    value: band.value,
    label: band.label,
    count: searched.filter((product) => priceInBand(product, band.value)).length,
  }));
  const discountOptions: FilterOption[] = DISCOUNT_BANDS.map((band) => ({
    value: band.value,
    label: band.label,
    count: searched.filter((product) => discountInBand(product, band.value)).length,
  }));
  const flagOptions: FilterOption[] = FLAG_OPTIONS.map((flag) => ({
    ...flag,
    count: searched.filter((product) => matchesFlag(product, flag.value)).length,
  }));
  const results = sorted(
    searched.filter((product) => matchesCatalogueFilters(product, activeFilters)),
    sort,
  );
  const heading = categoryLabel
    ? categoryLabel
    : effectiveQuery.trim()
      ? (locale === "hi-IN" ? `“${effectiveQuery.trim()}” के नतीजे` : `Results for “${effectiveQuery.trim()}”`)
      : (locale === "hi-IN" ? "सभी उत्पाद" : "All products");
  const bannerImage = imageSources(cmsCategory?.banner_image_uri, 1600);
  const filterHref = (overrides: Partial<CatalogueHrefState> = {}) =>
    catalogueHref({
      q: displayQuery,
      cat: categorySlug,
      sort,
      brands: activeFilters.brands,
      prices: activeFilters.prices,
      discounts: activeFilters.discounts,
      flags: activeFilters.flags,
      ...overrides,
    });

  return (
    <section className="catalogue-page">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <span aria-hidden="true">/</span>
        <span>{categoryLabel ?? "Shop"}</span>
      </nav>

      {guided ? (
        <div className="guided-panel" role="status">
          <div>
            <span className="eyebrow">Guided search</span>
            <strong>{guided.label}</strong>
            <p>{guided.hint}</p>
          </div>
          <div className="guided-panel-side">
            <span>Closest stocked aisle</span>
            <Link className="button" href={`/search?cat=${encodeURIComponent(guided.categorySlug)}`}>
              {categoryLabel ?? "Open aisle"} →
            </Link>
          </div>
        </div>
      ) : null}

      {!guided ? (
        <div className="guided-links" aria-label="Guided shopping">
          <span>Start with a job:</span>
          {GUIDED_PROMPTS.map((prompt) => (
            <Link key={prompt.label} className="project-chip project-chip-sm" href={guidedSearchHref(prompt)}>
              {prompt.label}
            </Link>
          ))}
        </div>
      ) : null}

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
                }${effectiveQuery.trim() ? ` matching “${effectiveQuery.trim()}”` : ""}.`}
          </p>
        </div>
        <div className="sort-control">
          <label htmlFor="sort">Sort</label>
          <div className="sort-links">
            <Link className={!sort ? "sort-link active" : "sort-link"} href={filterHref({ sort: undefined })}>
              Featured
            </Link>
            <Link
              className={sort === "discount" ? "sort-link active" : "sort-link"}
              href={filterHref({ sort: "discount" })}
            >
              Discount
            </Link>
            <Link
              className={sort === "price-asc" ? "sort-link active" : "sort-link"}
              href={filterHref({ sort: "price-asc" })}
            >
              Price ↑
            </Link>
            <Link
              className={sort === "price-desc" ? "sort-link active" : "sort-link"}
              href={filterHref({ sort: "price-desc" })}
            >
              Price ↓
            </Link>
            <Link
              className={sort === "name" ? "sort-link active" : "sort-link"}
              href={filterHref({ sort: "name" })}
            >
              A–Z
            </Link>
          </div>
        </div>
      </div>

      <DragScroll className="filter-bar" ariaLabel="Categories">
        <Link className={!categoryLabel ? "filter-chip active" : "filter-chip"} href={filterHref({ cat: undefined })}>
          All
        </Link>
        {cmsCategories.length > 0
          ? cmsCategories.map((candidate) => (
              <Link
                key={candidate.category_id}
                className={categorySlug === candidate.slug ? "filter-chip active" : "filter-chip"}
                href={filterHref({ cat: candidate.slug })}
              >
                <CategoryIcon
                  iconKey={candidate.icon_key}
                  label={candidate.label}
                  size={14}
                />
                {candidate.label}
              </Link>
            ))
          : CATEGORIES.map((candidate) => (
              <Link
                key={candidate.slug}
                className={categorySlug === candidate.slug ? "filter-chip active" : "filter-chip"}
                href={filterHref({ cat: candidate.slug })}
              >
                <CategoryIcon label={candidate.name} iconKey={candidate.slug} size={14} />
                {candidate.name}
              </Link>
            ))}
      </DragScroll>

      <CatalogueFilters
        brands={brandOptionsList}
        prices={priceOptions}
        discounts={discountOptions}
        flags={flagOptions}
        active={activeFilters}
        q={displayQuery}
        cat={categorySlug}
        sort={sort}
      />

      <form className="inline-search catalogue-search" action="/search" role="search">
        {categorySlug ? <input type="hidden" name="cat" value={categorySlug} /> : null}
        {activeFilters.brands.map((brand) => (
          <input key={`brand-${brand}`} type="hidden" name="brand" value={brand} />
        ))}
        {activeFilters.prices.map((price) => (
          <input key={`price-${price}`} type="hidden" name="price" value={price} />
        ))}
        {activeFilters.discounts.map((discount) => (
          <input key={`discount-${discount}`} type="hidden" name="discount" value={discount} />
        ))}
        {activeFilters.flags.map((flag) => (
          <input key={`flag-${flag}`} type="hidden" name="flag" value={flag} />
        ))}
        <input name="q" type="search" defaultValue={displayQuery} placeholder="Search the catalogue…" />
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
          <Link className="button" href={catalogueHref({ q: displayQuery, cat: categorySlug, sort })}>
            Clear filters
          </Link>
        </div>
      )}
    </section>
  );
}
