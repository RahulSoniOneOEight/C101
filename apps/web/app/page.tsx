import Image from "next/image";
import Link from "next/link";
import { formatMoney, listProducts, type ComposedProduct } from "@/lib/experience-api";
import { CATEGORIES, productsInCategory } from "@/lib/catalogue";
import { ProductCard } from "./components/product-card";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "BazarBee · Everything you need, delivered",
};

const CATEGORY_TILES: Record<string, { icon: string; tone: string }> = {
  building: { icon: "▦", tone: "tile-indigo" },
  paint: { icon: "◐", tone: "tile-aqua" },
  tools: { icon: "✦", tone: "tile-honey" },
  plumbing: { icon: "◉", tone: "tile-leaf" },
  lighting: { icon: "☀", tone: "tile-lavender" },
  tyres: { icon: "◎", tone: "tile-night" },
};

export default async function HomePage() {
  let products: ComposedProduct[] = [];
  let loadError = "";
  try {
    products = await listProducts(60);
  } catch (error) {
    loadError = (error as Error).message;
  }

  const featured = products.find((product) => product.best_price) ?? products[0] ?? null;
  const popular = products.filter((product) => product.best_price).slice(0, 12);

  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <span className="hero-eyebrow">
            <span className="pulse-dot" aria-hidden="true" />
            For home and business buyers
          </span>
          <h1>
            Everything you need,
            <br />
            <span className="hero-accent">delivered to your site.</span>
          </h1>
          <p className="hero-lead">
            Shop building materials, paint, tools and everyday essentials at prices made for
            every buyer — with GST invoices and doorstep delivery.
          </p>
          <div className="hero-actions">
            <Link className="button button-lg" href="/search">
              Shop the catalogue
            </Link>
            <Link className="button button-ghost button-lg" href="/orders">
              Track an order
            </Link>
          </div>
          <ul className="hero-trust">
            <li>
              <strong>30+</strong> products in the staging catalogue
            </li>
            <li>
              <strong>GST</strong> invoices for business
            </li>
            <li>
              <strong>1–3 day</strong> delivery windows
            </li>
          </ul>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="hero-orbit hero-orbit-one" />
          <div className="hero-orbit hero-orbit-two" />
          <Image
            src="/branding/bazarbee-logo-dark-transparent.png"
            alt=""
            width={300}
            height={281}
            priority
            className="hero-logo"
          />
          {featured?.best_price ? (
            <div className="hero-float hero-price">
              <span>Today&apos;s best price</span>
              <strong>{formatMoney(featured.best_price.unit_amount_minor, featured.best_price.currency_code)}</strong>
              <small>{featured.title}</small>
            </div>
          ) : null}
          <div className="hero-float hero-delivery">
            <span className="delivery-tick">✓</span>
            <div>
              <strong>Delivered to your doorstep</strong>
              <small>Home or project site</small>
            </div>
          </div>
        </div>
      </section>

      {loadError ? (
        <div className="notice err" role="alert">
          The catalogue could not be loaded right now. {loadError}
        </div>
      ) : null}

      <section className="section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Browse the range</span>
            <h2>Shop by category</h2>
          </div>
          <Link className="section-link" href="/search">
            View everything →
          </Link>
        </div>
        <div className="category-grid">
          {CATEGORIES.map((category) => {
            const count = productsInCategory(products, category).length;
            const tile = CATEGORY_TILES[category.slug] ?? CATEGORY_TILES.building;
            return (
              <Link
                className={`category-tile ${tile.tone}`}
                key={category.slug}
                href={`/search?cat=${category.slug}`}
              >
                <span className="category-icon" aria-hidden="true">
                  {tile.icon}
                </span>
                <span className="category-name">{category.name}</span>
                <span className="category-blurb">{category.blurb}</span>
                <span className="category-count">
                  {count} {count === 1 ? "product" : "products"} →
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Popular right now</span>
            <h2>Buyer favourites</h2>
          </div>
          <Link className="section-link" href="/search">
            See all products →
          </Link>
        </div>
        {popular.length > 0 ? (
          <div className="product-grid">
            {popular.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <div className="empty-panel">
            <h2>The catalogue is warming up</h2>
            <p className="muted">No products are available in this staging snapshot yet.</p>
          </div>
        )}
      </section>

      <section className="b2b-band">
        <div className="b2b-copy">
          <span className="eyebrow eyebrow-light">BazarBee Business</span>
          <h2>Business buying made easy</h2>
          <p>
            GST invoices, eligible credit and flexible payments — the same catalogue and the same
            prices, built for project sites and trade counters.
          </p>
          <div className="b2b-actions">
            <Link className="button button-honey" href="/sign-in?next=%2Forders">
              Sign in to your account
            </Link>
            <Link className="button button-ghost-light" href="/search?cat=building">
              Browse building materials
            </Link>
          </div>
        </div>
        <div className="b2b-points">
          <div className="b2b-point">
            <span aria-hidden="true">▤</span>
            <strong>GST-ready invoices</strong>
            <p>Every order comes with a business-ready record.</p>
          </div>
          <div className="b2b-point">
            <span aria-hidden="true">◔</span>
            <strong>Eligible credit</strong>
            <p>Apply your terms at checkout when approved.</p>
          </div>
          <div className="b2b-point">
            <span aria-hidden="true">◈</span>
            <strong>Flexible payments</strong>
            <p>Prepaid today, more options as your account grows.</p>
          </div>
        </div>
      </section>

      <section className="service-strip" aria-label="Why shop with BazarBee">
        <div>
          <span aria-hidden="true">🚚</span>
          <strong>Doorstep delivery</strong>
          <p>Convenient delivery for home and project needs.</p>
        </div>
        <div>
          <span aria-hidden="true">₹</span>
          <strong>Better prices for every buyer</strong>
          <p>Retail deals and exclusive B2B trade pricing.</p>
        </div>
        <div>
          <span aria-hidden="true">↺</span>
          <strong>Simple returns</strong>
          <p>Owner-scoped tracking and returns in one place.</p>
        </div>
      </section>
    </>
  );
}
