import Link from "next/link";
import { listProducts, type ComposedProduct } from "@/lib/experience-api";
import {
  CATEGORIES,
  categoryBySlug,
  searchProducts,
} from "@/lib/catalogue";
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
  const category = categoryBySlug(cat);
  let products: ComposedProduct[] = [];
  let loadError = "";
  try {
    products = await listProducts(60);
  } catch (error) {
    loadError = (error as Error).message;
  }

  const results = sorted(searchProducts(products, q, category), sort);
  const heading = category
    ? category.name
    : q.trim()
      ? `Results for “${q.trim()}”`
      : "All products";

  return (
    <section className="catalogue-page">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <span aria-hidden="true">/</span>
        <span>{category ? category.name : "Shop"}</span>
      </nav>

      <div className="section-heading catalogue-heading">
        <div>
          <span className="eyebrow">BazarBee catalogue</span>
          <h1>{heading}</h1>
          <p className="muted">
            {loadError
              ? "The catalogue is temporarily unavailable."
              : `${results.length} ${results.length === 1 ? "product" : "products"}${
                  category ? ` in ${category.name.toLowerCase()}` : ""
                }${q.trim() ? ` matching “${q.trim()}”` : ""}.`}
          </p>
        </div>
        <div className="sort-control">
          <label htmlFor="sort">Sort</label>
          <div className="sort-links">
            <Link
              className={!sort ? "sort-link active" : "sort-link"}
              href={href({ q, cat })}
            >
              Featured
            </Link>
            <Link
              className={sort === "price-asc" ? "sort-link active" : "sort-link"}
              href={href({ q, cat, sort: "price-asc" })}
            >
              Price ↑
            </Link>
            <Link
              className={sort === "price-desc" ? "sort-link active" : "sort-link"}
              href={href({ q, cat, sort: "price-desc" })}
            >
              Price ↓
            </Link>
            <Link
              className={sort === "name" ? "sort-link active" : "sort-link"}
              href={href({ q, cat, sort: "name" })}
            >
              A–Z
            </Link>
          </div>
        </div>
      </div>

      <div className="filter-bar" aria-label="Categories">
        <Link className={!category ? "filter-chip active" : "filter-chip"} href={href({ q })}>
          All
        </Link>
        {CATEGORIES.map((candidate) => (
          <Link
            key={candidate.slug}
            className={category?.slug === candidate.slug ? "filter-chip active" : "filter-chip"}
            href={href({ q, cat: candidate.slug })}
          >
            {candidate.name}
          </Link>
        ))}
      </div>

      {q.trim() ? (
        <form className="inline-search" action="/search" role="search">
          {category ? <input type="hidden" name="cat" value={category.slug} /> : null}
          <input name="q" type="search" defaultValue={q} placeholder="Search the catalogue…" />
          <button className="button" type="submit">
            Search
          </button>
        </form>
      ) : null}

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
          <p className="muted">
            Try a different search term or browse all categories.
          </p>
          <Link className="button" href="/search">
            Clear filters
          </Link>
        </div>
      )}
    </section>
  );
}
