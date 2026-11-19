import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  ExperienceApiError,
  PILOT_SESSION_COOKIE,
  getMyContexts,
  getStorefrontPresentation,
  hasTradeRole,
  listTradeProducts,
  type BuyerContext,
  type ComposedProduct,
  type StorefrontCategory,
} from "@/lib/experience-api";
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
import { deliveryRank } from "@/lib/delivery-promise";
import { imageSources, productRootCategoryId } from "@/lib/storefront";
import { getStorefrontLocale } from "@/lib/locale";
import { CatalogueFilters } from "../../components/catalogue-filters";
import { DragScroll } from "../../components/drag-scroll";
import { TradeNav } from "../trade-nav";
import { TradeProductCard } from "../trade-product-card";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Trade catalogue",
};

function tradeUnit(product: ComposedProduct): number {
  return product.best_price?.unit_amount_minor ?? Number.POSITIVE_INFINITY;
}

function sortedTrade(products: ComposedProduct[], sort: string | undefined): ComposedProduct[] {
  const copy = [...products];
  if (sort === "price-asc") {
    copy.sort((a, b) => tradeUnit(a) - tradeUnit(b));
  } else if (sort === "price-desc") {
    copy.sort((a, b) => tradeUnit(b) - tradeUnit(a));
  } else if (sort === "discount") {
    copy.sort((a, b) => discountPercent(b) - discountPercent(a));
  } else if (sort === "fastest") {
    copy.sort(
      (a, b) =>
        deliveryRank(a) - deliveryRank(b) ||
        discountPercent(b) - discountPercent(a),
    );
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

export default async function TradeCataloguePage({
  searchParams,
}: {
  searchParams: Promise<{
    cat?: string;
    sort?: string;
    brand?: string | string[];
    price?: string | string[];
    discount?: string | string[];
    flag?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const { cat, sort } = params;
  const activeFilters: CatalogueFilterState = {
    brands: parseList(params.brand),
    prices: parseList(params.price),
    discounts: parseList(params.discount),
    flags: parseList(params.flag),
  };

  const token = (await cookies()).get(PILOT_SESSION_COOKIE)?.value;
  const locale = await getStorefrontLocale();
  if (!token) {
    redirect(`/sign-in?next=${encodeURIComponent("/trade/catalogue")}`);
  }

  let contexts: BuyerContext[] = [];
  try {
    contexts = await getMyContexts(token);
  } catch (error) {
    if (error instanceof ExperienceApiError && [401, 403].includes(error.status)) {
      redirect(`/sign-in?next=${encodeURIComponent("/trade/catalogue")}`);
    }
  }
  const trade = hasTradeRole(contexts);

  if (!trade) {
    return (
      <section className="trade-page">
        <div className="trade-access">
          <span className="eyebrow">Trade account required</span>
          <h1>This catalogue is for trade buyers</h1>
          <p className="muted">
            The signed-in account is a consumer account. Sign in with a trade-enabled BazarBee
            account to see trade rates, MOQ and quantity tiers.
          </p>
          <div className="buy-actions">
            <Link
              className="button"
              href={`/sign-in?next=${encodeURIComponent("/trade/catalogue")}`}
            >
              Sign in with a trade account
            </Link>
            <Link className="button button-ghost" href="/search">
              Consumer catalogue
            </Link>
          </div>
        </div>
      </section>
    );
  }

  let products: ComposedProduct[] = [];
  let cmsCategories: StorefrontCategory[] = [];
  let loadError = "";
  const [productsResult, presentationResult] = await Promise.allSettled([
    listTradeProducts(token, 100),
    getStorefrontPresentation("b2b", locale),
  ]);
  if (productsResult.status === "fulfilled") products = productsResult.value;
  if (productsResult.status === "rejected") {
    const error = productsResult.reason as Error & { status?: number };
    if (error instanceof ExperienceApiError && [401, 403].includes(error.status)) {
      redirect(`/sign-in?next=${encodeURIComponent("/trade/catalogue")}`);
    }
    loadError = error.message;
  }
  if (presentationResult.status === "fulfilled") {
    cmsCategories = presentationResult.value.categories ?? [];
  }

  const selectedCategory = cmsCategories.find((candidate) => candidate.slug === cat);
  const scoped = (selectedCategory
    ? products.filter(
        (product) =>
          productRootCategoryId(product, new Set([selectedCategory.category_id])) ===
          selectedCategory.category_id,
      )
    : products
  ).filter((product) => product.best_price);

  const brandOptionsList = brandOptions(scoped);
  const priceOptions: FilterOption[] = PRICE_BANDS.map((band) => ({
    value: band.value,
    label: band.label,
    count: scoped.filter((product) => priceInBand(product, band.value)).length,
  }));
  const discountOptions: FilterOption[] = DISCOUNT_BANDS.map((band) => ({
    value: band.value,
    label: band.label,
    count: scoped.filter((product) => discountInBand(product, band.value)).length,
  }));
  const flagOptions: FilterOption[] = FLAG_OPTIONS.map((flag) => ({
    ...flag,
    count: scoped.filter((product) => matchesFlag(product, flag.value)).length,
  }));

  const filtered = sortedTrade(
    scoped.filter((product) => matchesCatalogueFilters(product, activeFilters)),
    sort,
  );
  const bannerImage = imageSources(selectedCategory?.banner_image_uri, 1600);
  const filterHref = (overrides: Partial<CatalogueHrefState> = {}) =>
    catalogueHref({
      path: "/trade/catalogue",
      cat: selectedCategory?.slug,
      sort,
      brands: activeFilters.brands,
      prices: activeFilters.prices,
      discounts: activeFilters.discounts,
      flags: activeFilters.flags,
      ...overrides,
    });

  return (
    <section className="trade-page">
      <TradeNav active="catalogue" />
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <span aria-hidden="true">/</span>
        <Link href="/trade">BazarBee Trade</Link>
        <span aria-hidden="true">/</span>
        <span>{selectedCategory?.label ?? "Catalogue"}</span>
      </nav>

      {selectedCategory && bannerImage.src ? (
        <div className="category-banner">
          <img
            src={bannerImage.src}
            srcSet={bannerImage.srcSet}
            sizes="(max-width: 720px) 100vw, 1200px"
            alt={selectedCategory.banner_image_alt ?? selectedCategory.label}
          />
          <div className="category-banner-copy">
            <span className="eyebrow eyebrow-light">Trade category</span>
            <strong>{selectedCategory.label}</strong>
            {selectedCategory.short_text ? <span>{selectedCategory.short_text}</span> : null}
          </div>
        </div>
      ) : null}

      <div className="section-heading catalogue-heading">
        <div>
          <span className="eyebrow">Trade rates · MOQ · GST invoicing</span>
          <h1>{selectedCategory?.label ?? "Trade catalogue"}</h1>
          <p className="muted">
            {filtered.length} {filtered.length === 1 ? "product" : "products"} with active B2B terms.
            Quantity tiers are applied to your quotation.
          </p>
          {sort === "fastest" ? (
            <p className="muted catalogue-sort-note">
              Estimated delivery uses the product note where present, otherwise the standard 3–5 day
              promise.
            </p>
          ) : null}
        </div>
        <div className="catalogue-heading-actions">
          <CatalogueFilters
            brands={brandOptionsList}
            prices={priceOptions}
            discounts={discountOptions}
            flags={flagOptions}
            active={activeFilters}
            cat={selectedCategory?.slug}
            sort={sort}
            basePath="/trade/catalogue"
          />
          <div className="sort-control">
            <label htmlFor="trade-sort">Sort</label>
            <div className="sort-links">
              <Link
                className={!sort ? "sort-link active" : "sort-link"}
                href={filterHref({ sort: undefined })}
              >
                Recommended
              </Link>
              <Link
                className={sort === "fastest" ? "sort-link active" : "sort-link"}
                href={filterHref({ sort: "fastest" })}
              >
                Fastest delivery
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
                className={sort === "discount" ? "sort-link active" : "sort-link"}
                href={filterHref({ sort: "discount" })}
              >
                Discount
              </Link>
            </div>
          </div>
        </div>
      </div>

      <DragScroll className="filter-bar" ariaLabel="Trade categories">
        <Link
          className={!selectedCategory ? "filter-chip active" : "filter-chip"}
          href={filterHref({ cat: undefined })}
        >
          All
        </Link>
        {cmsCategories.map((candidate) => (
          <Link
            key={candidate.category_id}
            className={
              selectedCategory?.category_id === candidate.category_id
                ? "filter-chip active"
                : "filter-chip"
            }
            href={filterHref({ cat: candidate.slug })}
          >
            {candidate.label}
          </Link>
        ))}
      </DragScroll>

      {loadError ? (
        <div className="notice err" role="alert">
          The trade catalogue could not be loaded. {loadError}
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-panel">
          <h2>No trade terms match</h2>
          <p className="muted">
            No offer in this view has active B2B pricing and the selected filters. Try another
            category or clear the filters.
          </p>
          <Link className="button" href={catalogueHref({ path: "/trade/catalogue" })}>
            Clear filters
          </Link>
        </div>
      ) : (
        <div className="trade-product-grid">
          {filtered.map((product) => (
            <TradeProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </section>
  );
}
