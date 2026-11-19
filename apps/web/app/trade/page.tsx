import Link from "next/link";
import { cookies } from "next/headers";
import {
  PILOT_SESSION_COOKIE,
  getMyContexts,
  getStorefrontPresentation,
  hasTradeRole,
  type StorefrontBanner,
} from "@/lib/experience-api";
import { firstBanner, imageSources, webHrefForAction } from "@/lib/storefront";
import { readableBusinessName } from "@/lib/trade";
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

  if (!trade) return <TradeMarketing />;
  const businessName = readableBusinessName(businessId);
  let heroBanner: StorefrontBanner | null = null;
  try {
    const presentation = await getStorefrontPresentation("b2b");
    heroBanner = firstBanner(presentation.banners, "b2b.home.hero");
  } catch {
    // The workspace remains usable with the static hero if content is unavailable.
  }

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
              />
            </picture>
            <span className="trade-hero-scrim" />
          </div>
        ) : null}
        <div className="trade-hero-copy">
          <span className="eyebrow eyebrow-light">Trade workspace</span>
          <h1>{heroBanner?.title ?? "Your trade desk, on the web."}</h1>
          <p>
            {heroBanner?.body ??
              "The first web slice of the Flutter trade workspace: B2B catalogue with MOQ and tier pricing, credit overview, quotation cart and RFQ entry — on the same account."}
          </p>
          <div className="hero-actions">
            <Link className="button button-honey button-lg" href="/trade/catalogue">
              {heroBanner?.action_label ?? "Open trade catalogue"}
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
