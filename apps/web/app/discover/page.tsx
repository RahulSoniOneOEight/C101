import Link from "next/link";
import {
  getStorefrontPresentation,
  listProducts,
  type ComposedProduct,
  type StorefrontCategory,
} from "@/lib/experience-api";
import { getStorefrontLocale } from "@/lib/locale";
import { GUIDED_PROMPTS, guidedSearchHref } from "@/lib/discovery";
import {
  categoryCount,
  imageSources,
  productsInStorefrontCategory,
} from "@/lib/storefront";
import { CategoryIcon } from "../components/category-icon";
import { ProductCard } from "../components/product-card";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Discover",
  description: "Find the right aisle by task, category or brand.",
};

function brandsOf(products: ComposedProduct[]): Array<{ name: string; count: number }> {
  const grouped = new Map<string, number>();
  for (const product of products) {
    const name = product.best_price?.seller_name?.trim();
    if (!name) continue;
    grouped.set(name, (grouped.get(name) ?? 0) + 1);
  }
  return [...grouped.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export default async function DiscoverPage() {
  const locale = await getStorefrontLocale();
  let products: ComposedProduct[] = [];
  let categories: StorefrontCategory[] = [];
  let loadError = "";

  const [productsResult, presentationResult] = await Promise.allSettled([
    listProducts(100),
    getStorefrontPresentation("b2c", locale),
  ]);
  if (productsResult.status === "fulfilled") products = productsResult.value;
  if (productsResult.status === "rejected") loadError = (productsResult.reason as Error).message;
  if (presentationResult.status === "fulfilled") {
    categories = presentationResult.value.categories ?? [];
  }

  const counts = categoryCount(products, categories);
  const visibleCategories = categories.filter(
    (category) =>
      (counts.get(category.category_id) ?? 0) > 0 ||
      productsInStorefrontCategory(products, category).length > 0,
  );
  const brands = brandsOf(products);
  const popular = [...products]
    .filter((product) => product.best_price)
    .sort(
      (a, b) =>
        (b.best_price?.discount_percent ?? 0) - (a.best_price?.discount_percent ?? 0),
    )
    .slice(0, 8);
  const hindi = locale === "hi-IN";

  return (
    <section className="discover-page">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <span aria-hidden="true">/</span>
        <span>Discover</span>
      </nav>

      <section className="discover-hero">
        <div className="discover-hero-copy">
          <span className="eyebrow eyebrow-light">Guided shopping</span>
          <h1>{hindi ? "सही aisle खोजें" : "Find the right aisle"}</h1>
          <p>
            {hindi
              ? "काम, श्रेणी या ब्रांड से शुरू करें। हर रास्ता आपको स्टॉक में मौजूद उत्पादों तक ले जाता है।"
              : "Start with the job, a category or a brand. Every route lands on products that are actually in stock — no empty aisles."}
          </p>
          <form className="discover-search" action="/search" role="search">
            <label className="sr-only" htmlFor="discover-search-input">
              Search the catalogue
            </label>
            <input
              id="discover-search-input"
              name="q"
              type="search"
              placeholder={
                hindi ? "सीमेंट, टाइल, पेंट, औज़ार खोजें…" : "Search cement, tiles, paint, tools…"
              }
              autoComplete="off"
            />
            <button className="button button-honey" type="submit">
              {hindi ? "खोजें" : "Search"}
            </button>
          </form>
          <div className="discover-stats">
            <span>
              <strong>{visibleCategories.length}</strong>{" "}
              {hindi ? "श्रेणियाँ" : "stocked categories"}
            </span>
            <span>
              <strong>{brands.length}</strong> {hindi ? "ब्रांड" : "brands"}
            </span>
            <span>
              <strong>{products.length}</strong> {hindi ? "उत्पाद" : "products"}
            </span>
          </div>
        </div>
        <div className="discover-hero-art" aria-hidden="true">
          <span className="discover-orbit discover-orbit-one" />
          <span className="discover-orbit discover-orbit-two" />
          <CategoryIcon label="Tools" iconKey="tools" size={92} />
          <span className="discover-hero-label">Task → aisle → product</span>
        </div>
      </section>

      <section className="section" aria-labelledby="discover-task-title">
        <div className="section-heading">
          <div>
            <span className="eyebrow">{hindi ? "काम से शुरू करें" : "Shop by task"}</span>
            <h2 id="discover-task-title">
              {hindi ? "आप क्या बना रहे हैं?" : "What are you working on?"}
            </h2>
            <p className="muted">
              {hindi
                ? "एक काम चुनें और हम सबसे नज़दीकी stocked aisle दिखाएंगे।"
                : "Pick a job and we will open the closest stocked aisle with the products that fit."}
            </p>
          </div>
        </div>
        <div className="discover-task-grid">
          {GUIDED_PROMPTS.map((prompt) => (
            <Link
              className="discover-task-card"
              key={prompt.label}
              href={guidedSearchHref(prompt)}
            >
              <span className="discover-task-icon" aria-hidden="true">
                ✦
              </span>
              <span>
                <strong>{prompt.label}</strong>
                <small>{prompt.hint}</small>
              </span>
              <span className="discover-task-arrow" aria-hidden="true">
                →
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="section" aria-labelledby="discover-category-title">
        <div className="section-heading">
          <div>
            <span className="eyebrow">{hindi ? "रेंज देखें" : "Browse the range"}</span>
            <h2 id="discover-category-title">
              {hindi ? "श्रेणी से खरीदें" : "Shop by category"}
            </h2>
          </div>
          <Link className="section-link" href="/search">
            {hindi ? "सभी उत्पाद" : "All products"} →
          </Link>
        </div>
        {visibleCategories.length > 0 ? (
          <div className="discover-category-grid">
            {visibleCategories.map((category) => {
              const count = counts.get(category.category_id) ?? 0;
              const banner = imageSources(category.banner_image_uri, 900);
              return (
                <Link
                  className="discover-category-card"
                  key={category.category_id}
                  href={`/search?cat=${encodeURIComponent(category.slug)}`}
                >
                  <span className="discover-category-media">
                    {banner.src ? (
                      <img src={banner.src} alt="" loading="lazy" decoding="async" />
                    ) : null}
                    <span className="category-icon">
                      <CategoryIcon
                        iconKey={category.icon_key}
                        label={category.label}
                        size={24}
                      />
                    </span>
                  </span>
                  <span className="discover-category-body">
                    <strong>{category.label}</strong>
                    <small>{category.short_text ?? category.name}</small>
                    <em>
                      {count} {hindi ? "उत्पाद" : count === 1 ? "product" : "products"} →
                    </em>
                  </span>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="empty-panel">
            <h2>{hindi ? "श्रेणियाँ उपलब्ध नहीं" : "Categories are unavailable"}</h2>
            <p className="muted">
              {loadError || "The storefront presentation could not be loaded."}
            </p>
          </div>
        )}
      </section>

      <section className="section" id="brands" aria-labelledby="discover-brand-title">
        <div className="section-heading">
          <div>
            <span className="eyebrow">{hindi ? "विक्रेता" : "Sellers"}</span>
            <h2 id="discover-brand-title">
              {hindi ? "ब्रांड से खरीदें" : "Shop by brand"}
            </h2>
            <p className="muted">
              {hindi
                ? "हर ब्रांड उन्हीं विक्रेताओं से आता है जो इस समय ऑफर दे रहे हैं।"
                : "Every brand links to the products its seller currently has on offer."}
            </p>
          </div>
        </div>
        <div className="brand-grid">
          {brands.map((brand) => (
            <Link
              className="brand-card"
              key={brand.name}
              href={`/search?q=${encodeURIComponent(brand.name)}`}
            >
              <span className="brand-mark" aria-hidden="true">
                {brand.name.slice(0, 1).toUpperCase()}
              </span>
              <span>
                <strong>{brand.name}</strong>
                <small>
                  {brand.count} {hindi ? "उत्पाद" : brand.count === 1 ? "product" : "products"}
                </small>
              </span>
              <span aria-hidden="true">→</span>
            </Link>
          ))}
        </div>
      </section>

      {popular.length > 0 ? (
        <section className="section" aria-labelledby="discover-popular-title">
          <div className="section-heading">
            <div>
              <span className="eyebrow">{hindi ? "अभी लोकप्रिय" : "Popular right now"}</span>
              <h2 id="discover-popular-title">
                {hindi ? "आज की डील्स" : "Today's deals"}
              </h2>
            </div>
            <Link className="section-link" href="/search?sort=price-asc">
              {hindi ? "कीमत से देखें" : "Sort by price"} →
            </Link>
          </div>
          <div className="product-grid">
            {popular.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}
