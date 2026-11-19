import Link from "next/link";
import { cookies } from "next/headers";
import {
  PILOT_SESSION_COOKIE,
  formatMoney,
  getMyContexts,
  getStorefrontPresentation,
  hasTradeRole,
  listMyOrders,
  listTradeProducts,
  type ComposedProduct,
  type CustomerOrderSummary,
  type StorefrontBanner,
  type StorefrontCategory,
} from "@/lib/experience-api";
import { bannerHref, categoryCount, categoryTone, firstBanner, imageObjectPosition, imageSources, productDeliveryNote, productStockNote } from "@/lib/storefront";
import { getStorefrontLocale } from "@/lib/locale";
import { buyAgainProducts, readableBusinessName } from "@/lib/trade";
import { CategoryIcon } from "../components/category-icon";
import { ProductImage } from "../components/product-image";
import { AddToQuote } from "./add-to-quote";
import { TradeNav } from "./trade-nav";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "BazarBee Trade",
};

const CAPABILITIES = [
  {
    icon: "◆",
    title: "Negotiated tiers & MOQ",
    body: "Trade rates, minimum order quantities and slab pricing on the shared catalogue.",
  },
  {
    icon: "◔",
    title: "Credit account",
    body: "Sanctioned limit, utilisation, overdue invoices and credit health at a glance.",
  },
  {
    icon: "▤",
    title: "Quotation cart",
    body: "Build a basket, request a quotation and compare seller responses before ordering.",
  },
  {
    icon: "▥",
    title: "RFQ workspace",
    body: "Create requirements, receive quotes and compare line-level terms.",
  },
  {
    icon: "⌂",
    title: "Projects & procurement lists",
    body: "Keep site lists and repeat purchases together for fast reordering.",
  },
  {
    icon: "◈",
    title: "GST invoices & approvals",
    body: "Business invoices and team approval steps for every order.",
  },
];

export default async function TradePage() {
  const token = (await cookies()).get(PILOT_SESSION_COOKIE)?.value;
  const locale = await getStorefrontLocale();
  let trade = false;
  let businessId = "";
  if (token) {
    try {
      const contexts = await getMyContexts(token);
      trade = hasTradeRole(contexts);
      businessId = contexts.find((context) => context.business_account_id)?.business_account_id ?? "";
    } catch {
      // The marketing page remains available when the session or role projection is unavailable.
    }
  }

  if (!trade || !token) return <TradeMarketing />;
  const businessName = readableBusinessName(businessId);
  let heroBanner: StorefrontBanner | null = null;
  let tradeProducts: ComposedProduct[] = [];
  let tradeCategories: StorefrontCategory[] = [];
  let recentOrders: CustomerOrderSummary[] = [];
  try {
    const [presentation, products, orders] = await Promise.all([
      getStorefrontPresentation("b2b", locale),
      listTradeProducts(token, 100),
      listMyOrders(token, 20),
    ]);
    heroBanner = firstBanner(presentation.banners, "b2b.home.hero");
    tradeCategories = presentation.categories ?? [];
    tradeProducts = products;
    recentOrders = orders;
  } catch {
    // The workspace remains usable with the static hero if content is unavailable.
  }
  const offerProducts = tradeProducts.filter((product) => product.best_price).slice(0, 3);
  const buyAgain = buyAgainProducts(tradeProducts, recentOrders);
  const heroHref = heroBanner ? bannerHref(heroBanner, "b2b") : null;
  const tradeCategoryCounts = categoryCount(tradeProducts, tradeCategories);
  const visibleTradeCategories = tradeCategories;

  return (
    <section className="trade-page">
      <TradeNav active="overview" />
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <span aria-hidden="true">/</span>
        <span>BazarBee Trade</span>
      </nav>

      <div className="trade-hero trade-hero-workspace">
        {heroBanner ? (
          <div className="trade-hero-bg" aria-hidden="true">
            <picture>
              <source
                media="(max-width: 720px)"
                srcSet={
                  imageSources(
                    heroBanner.image_mobile_uri ?? heroBanner.image_desktop_uri ?? heroBanner.image_uri,
                    900,
                  ).srcSet ??
                  imageSources(
                    heroBanner.image_mobile_uri ?? heroBanner.image_desktop_uri ?? heroBanner.image_uri,
                    900,
                  ).src
                }
              />
              <img
                src={
                  imageSources(heroBanner.image_desktop_uri ?? heroBanner.image_uri, 1600).src
                }
                srcSet={
                  imageSources(heroBanner.image_desktop_uri ?? heroBanner.image_uri, 1600).srcSet
                }
                alt=""
                style={{ objectPosition: imageObjectPosition(heroBanner) }}
              />
            </picture>
            <span className="trade-hero-scrim" />
          </div>
        ) : null}
        <div className="trade-hero-copy">
          <span className="eyebrow eyebrow-light">Trade workspace</span>
          <h1>{heroBanner?.web_title ?? heroBanner?.title ?? "Your trade desk, on the web."}</h1>
          <p>
            {heroBanner?.web_subtitle ??
              heroBanner?.body ??
              "The first web slice of the Flutter trade workspace: B2B catalogue with MOQ and tier pricing, credit overview, quotation cart and RFQ entry — on the same account."}
          </p>
          <div className="hero-actions">
            <Link className="button button-honey button-lg" href={heroHref ?? "/trade/catalogue"}>
              {heroBanner?.web_cta_label ?? heroBanner?.action_label ?? "Open trade catalogue"}
            </Link>
            <Link className="button button-ghost-light button-lg" href="/trade/quote">
              Quotation cart
            </Link>
          </div>
        </div>
        <div className="trade-hero-points">
          <div>
            <strong>{businessName}</strong>
            <span>signed-in trade buyer</span>
          </div>
          <div>
            <strong>B2B</strong>
            <span>terms composed by the shared API</span>
          </div>
          <div>
            <strong>₹1.72L</strong>
            <span>credit available · staging fixture</span>
          </div>
        </div>
      </div>

      <div className="trade-console">
        <Link className="trade-console-card" href="/trade/catalogue">
          <span className="account-card-icon" aria-hidden="true">▦</span>
          <strong>Trade catalogue</strong>
          <p>MOQ, quantity tiers and add-to-quote on every B2B offer.</p>
          <span className="card-link">Browse catalogue →</span>
        </Link>
        <Link className="trade-console-card" href="/trade/credit">
          <span className="account-card-icon" aria-hidden="true">◔</span>
          <strong>Credit overview</strong>
          <p>Available limit, utilisation, overdue invoices and next due.</p>
          <span className="card-link">View credit →</span>
        </Link>
        <Link className="trade-console-card" href="/trade/quote">
          <span className="account-card-icon" aria-hidden="true">▤</span>
          <strong>Quotation cart / RFQ</strong>
          <p>Review tier pricing and submit a request for quotation.</p>
          <span className="card-link">Open quotation cart →</span>
        </Link>
      </div>

      {visibleTradeCategories.length > 0 ? (
        <section className="section trade-home-categories" aria-labelledby="trade-category-title">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Trade range</span>
              <h2 id="trade-category-title">Shop by category</h2>
              <p className="muted">One trade lane across the full catalogue; counts show active B2B terms.</p>
            </div>
            <Link className="section-link" href="/trade/catalogue">
              Full trade catalogue →
            </Link>
          </div>
          <div className="category-lane" aria-label="Trade categories">
            {visibleTradeCategories.map((category, index) => {
              const count = tradeCategoryCounts.get(category.category_id) ?? 0;
              const banner = imageSources(category.banner_image_uri, 800);
              return (
                <Link
                  className={`category-tile ${banner.src ? "has-media" : ""} ${categoryTone(index)}`}
                  key={category.category_id}
                  href={`/trade/catalogue?cat=${encodeURIComponent(category.slug)}`}
                >
                  {banner.src ? (
                    <span className="category-media">
                      <img src={banner.src} alt="" loading="lazy" decoding="async" />
                      <span className="category-icon">
                        <CategoryIcon iconKey={category.icon_key} label={category.label} />
                      </span>
                    </span>
                  ) : (
                    <span className="category-icon">
                      <CategoryIcon iconKey={category.icon_key} label={category.label} />
                    </span>
                  )}
                  <span className="category-name">{category.label}</span>
                  <span className="category-blurb">{category.short_text ?? category.name}</span>
                  <span className="category-count">
                    {count > 0
                      ? `${count} ${count === 1 ? "product" : "products"} →`
                      : "No active trade terms"}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}

      {offerProducts.length > 0 ? (
        <section className="section trade-home-offers">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Trade offers &amp; deals</span>
              <h2>Trade rates and bulk tiers</h2>
            </div>
            <Link className="section-link" href="/trade/catalogue">
              See all trade products →
            </Link>
          </div>
          <div className="trade-offer-grid">
            {offerProducts.map((product) => {
              const offer = product.best_price!;
              const moq = Math.max(1, offer.b2b_moq ?? 1);
              const note = [productDeliveryNote(product), productStockNote(offer)].filter(Boolean).join(" · ");
              return (
                <article className="trade-offer-card" key={product.id}>
                  <Link href={`/products/${encodeURIComponent(product.id)}`} className="trade-offer-media">
                    <ProductImage src={product.thumbnail} alt={product.title} />
                  </Link>
                  <div className="trade-offer-body">
                    <span className="trade-seller">{offer.seller_name ?? "Trade seller"}</span>
                    <h3>{product.title}</h3>
                    <p className="muted">MOQ {moq} · SKU {offer.sku}</p>
                    {note ? <p className="product-note">{note}</p> : null}
                    <div className="trade-offer-price">
                      <span className="price">{formatMoney(offer.unit_amount_minor, offer.currency_code)}</span>
                      <span className="trade-moq">MOQ {moq}</span>
                    </div>
                    <AddToQuote
                      line={{
                        productId: product.id,
                        offerId: offer.id,
                        sku: offer.sku,
                        title: product.title,
                        seller: offer.seller_name ?? "",
                        image: product.thumbnail ?? null,
                        moq,
                        basePriceMinor: offer.unit_amount_minor,
                        currency: offer.currency_code,
                        tiers: offer.b2b_tiers ?? [],
                      }}
                    />
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      {buyAgain.length > 0 ? (
        <section className="section trade-home-offers">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Buy again</span>
              <h2>Reorder recent lines</h2>
            </div>
            <Link className="section-link" href="/trade/quick-order#buy-again">
              Open quick order →
            </Link>
          </div>
          <div className="trade-offer-grid">
            {buyAgain.map((product) => {
              const offer = product.best_price!;
              const moq = Math.max(1, offer.b2b_moq ?? 1);
              const note = [productDeliveryNote(product), productStockNote(offer)].filter(Boolean).join(" · ");
              return (
                <article className="trade-offer-card" key={`buy-again-${product.id}`}>
                  <Link href={`/products/${encodeURIComponent(product.id)}`} className="trade-offer-media">
                    <ProductImage src={product.thumbnail} alt={product.title} />
                  </Link>
                  <div className="trade-offer-body">
                    <span className="trade-seller">{offer.seller_name ?? "Trade seller"}</span>
                    <h3>{product.title}</h3>
                    <p className="muted">MOQ {moq} · SKU {offer.sku}</p>
                    {note ? <p className="product-note">{note}</p> : null}
                    <div className="trade-offer-price">
                      <span className="price">{formatMoney(offer.unit_amount_minor, offer.currency_code)}</span>
                      <span className="trade-moq">MOQ {moq}</span>
                    </div>
                    <AddToQuote
                      line={{
                        productId: product.id,
                        offerId: offer.id,
                        sku: offer.sku,
                        title: product.title,
                        seller: offer.seller_name ?? "",
                        image: product.thumbnail ?? null,
                        moq,
                        basePriceMinor: offer.unit_amount_minor,
                        currency: offer.currency_code,
                        tiers: offer.b2b_tiers ?? [],
                      }}
                    />
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      <div className="notice simulation-notice">
        Staging trade slice: catalogue and tier pricing come from the shared B2B API. The credit
        snapshot mirrors the Flutter demo fixture, and RFQ drafts stay on this device. No order,
        reservation or payment is created by the RFQ.
      </div>

      <section className="trade-status">
        <div>
          <span className="eyebrow">Scope of this slice</span>
          <h2>What moved to the web</h2>
          <p>
            Catalogue, MOQ/tier pricing, add-to-quote, credit overview and RFQ entry. Credit-ledger
            actions and the full trade account stay in the Flutter app for now.
          </p>
        </div>
        <div className="trade-status-lists">
          <div>
            <h3>Web trade slice</h3>
            <ul>
              <li>B2B catalogue from the shared API</li>
              <li>MOQ and quantity-tier pricing</li>
              <li>Quotation cart with RFQ submission</li>
              <li>Credit overview and invoice ledger</li>
            </ul>
          </div>
          <div>
            <h3>Still in the trade app</h3>
            <ul>
              <li>Credit payments and limit actions</li>
              <li>Quote comparison and approvals</li>
              <li>Projects and procurement lists</li>
              <li>Team, roles and GST invoice history</li>
            </ul>
          </div>
        </div>
      </section>

      <div className="trade-cta">
        <div>
          <h2>Continue in the trade app</h2>
          <p className="muted">Same BazarBee account, full trade workflow.</p>
        </div>
        <a className="button button-lg" href="https://gobazarbee.com/#/b2b">
          Open BazarBee Trade
        </a>
      </div>
    </section>
  );
}

function TradeMarketing() {
  return (
    <section className="trade-page">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <span aria-hidden="true">/</span>
        <span>BazarBee Trade</span>
      </nav>

      <div className="trade-hero">
        <div>
          <span className="eyebrow eyebrow-light">BazarBee Trade</span>
          <h1>Built for trade counters and project sites.</h1>
          <p>
            One catalogue, two ways to buy. Consumer checkout on the web today, with the full trade
            workspace — negotiated tiers, credit, quotes and RFQ — on the same account.
          </p>
          <div className="hero-actions">
            <a className="button button-honey button-lg" href="https://gobazarbee.com/#/b2b">
              Open BazarBee Trade
            </a>
            <Link className="button button-ghost-light button-lg" href="/search">
              Shop the shared catalogue
            </Link>
          </div>
        </div>
        <div className="trade-hero-points">
          <div>
            <strong>Tiered</strong>
            <span>negotiated pricing by quantity</span>
          </div>
          <div>
            <strong>GST</strong>
            <span>invoices on business orders</span>
          </div>
          <div>
            <strong>1</strong>
            <span>account across app and web</span>
          </div>
        </div>
      </div>

      <section className="section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Trade capabilities</span>
            <h2>What business buyers get</h2>
          </div>
        </div>
        <div className="trade-capability-grid">
          {CAPABILITIES.map((capability) => (
            <article className="trade-capability" key={capability.title}>
              <span aria-hidden="true">{capability.icon}</span>
              <h3>{capability.title}</h3>
              <p>{capability.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="trade-status">
        <div>
          <span className="eyebrow">Rollout status</span>
          <h2>Where the trade workspace lives today</h2>
          <p>
            The trade workspace is live in the BazarBee app. The responsive web trade workspace is
            the next slice; this page is the shared entry point until it ships. Catalogue,
            identity and GST details are shared, so the same account works in both places.
          </p>
        </div>
        <div className="trade-status-lists">
          <div>
            <h3>Available on the web today</h3>
            <ul>
              <li>Shared product catalogue and search</li>
              <li>Email code and magic-link sign-in</li>
              <li>Cart, quote-backed checkout and confirmation</li>
              <li>Orders, tracking, returns, wishlist and notifications</li>
            </ul>
          </div>
          <div>
            <h3>In the trade app today</h3>
            <ul>
              <li>Trade rates, MOQ and tier pricing</li>
              <li>Credit account and invoice ledger</li>
              <li>Quotation cart, RFQ and quote comparison</li>
              <li>Projects, procurement lists, GST invoices and approvals</li>
            </ul>
          </div>
        </div>
      </section>

      <div className="trade-cta">
        <div>
          <h2>Ready to buy at trade terms?</h2>
          <p className="muted">Open the trade app with the same BazarBee account.</p>
        </div>
        <a className="button button-lg" href="https://gobazarbee.com/#/b2b">
          Open BazarBee Trade
        </a>
      </div>
    </section>
  );
}
