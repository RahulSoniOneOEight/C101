import Link from "next/link";

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

export default function TradePage() {
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
