import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  ExperienceApiError,
  PILOT_SESSION_COOKIE,
  formatMoney,
  getMyContexts,
  hasTradeRole,
} from "@/lib/experience-api";
import { readableBusinessName } from "@/lib/trade";
import { TRADE_CREDIT } from "@/lib/trade-fixtures";
import { TradeNav } from "../trade-nav";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Trade credit",
};

export default async function TradeCreditPage() {
  const token = (await cookies()).get(PILOT_SESSION_COOKIE)?.value;
  if (!token) {
    redirect(`/sign-in?next=${encodeURIComponent("/trade/credit")}`);
  }

  let trade = false;
  let businessId = "";
  try {
    const contexts = await getMyContexts(token);
    trade = hasTradeRole(contexts);
    businessId = contexts.find((context) => context.business_account_id)?.business_account_id ?? "";
  } catch (error) {
    if (error instanceof ExperienceApiError && [401, 403].includes(error.status)) {
      redirect(`/sign-in?next=${encodeURIComponent("/trade/credit")}`);
    }
  }

  if (!trade) {
    return (
      <section className="trade-page">
        <div className="trade-access">
          <span className="eyebrow">Trade account required</span>
          <h1>Credit is available to trade buyers</h1>
          <p className="muted">
            The signed-in account is a consumer account. Sign in with a trade-enabled account to
            view the credit limit and invoice ledger.
          </p>
          <div className="buy-actions">
            <Link className="button" href={`/sign-in?next=${encodeURIComponent("/trade/credit")}`}>
              Sign in with a trade account
            </Link>
            <Link className="button button-ghost" href="/trade">
              Trade overview
            </Link>
          </div>
        </div>
      </section>
    );
  }

  const c = TRADE_CREDIT;
  return (
    <section className="trade-page">
      <TradeNav active="credit" />
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <span aria-hidden="true">/</span>
        <Link href="/trade">BazarBee Trade</Link>
        <span aria-hidden="true">/</span>
        <span>Credit</span>
      </nav>

      <div className="section-heading">
        <div>
          <span className="eyebrow">Credit account</span>
          <h1>Credit overview</h1>
          <p className="muted">
            {readableBusinessName(businessId)} · GSTIN {c.gstin}
          </p>
        </div>
        <Link className="section-link" href="/trade/catalogue">
          Back to catalogue →
        </Link>
      </div>

      <div className="notice simulation-notice">
        Staging credit snapshot mirroring the Flutter trade demo. No credit decision, payment or
        money movement is executed here.
      </div>

      <div className="credit-hero">
        <div>
          <span className="credit-label">Available credit</span>
          <strong className="credit-available">{formatMoney(c.availableMinor, "INR")}</strong>
          <p className="muted">
            {c.utilisationPercent}% of the sanctioned limit is used.
          </p>
        </div>
        <div className="credit-bar-wrap">
          <div className="credit-bar">
            <span style={{ width: `${c.utilisationPercent}%` }} />
          </div>
          <div className="credit-bar-legend">
            <span>Used {formatMoney(c.utilisedMinor, "INR")}</span>
            <span>Limit {formatMoney(c.sanctionedMinor, "INR")}</span>
          </div>
        </div>
      </div>

      <div className="credit-stats">
        <div>
          <span>Sanctioned</span>
          <strong>{formatMoney(c.sanctionedMinor, "INR")}</strong>
        </div>
        <div>
          <span>Utilised</span>
          <strong>{formatMoney(c.utilisedMinor, "INR")}</strong>
        </div>
        <div>
          <span>Overdue</span>
          <strong className="credit-overdue">{formatMoney(c.overdueMinor, "INR")}</strong>
        </div>
        <div>
          <span>Avg. days due</span>
          <strong>{c.averageDaysDue} days</strong>
        </div>
      </div>

      <div className="credit-grid">
        <article className="credit-card">
          <span className="eyebrow">Next due</span>
          <h2>{c.nextDue.date}</h2>
          <p className="credit-next-amount">{formatMoney(c.nextDue.amountMinor, "INR")}</p>
          <p className="muted">{c.nextDue.invoice} · trade credit</p>
          <a className="button" href="https://gobazarbee.com/#/b2b">
            Pay in trade app
          </a>
        </article>
        <article className="credit-card">
          <span className="eyebrow">Invoice ledger</span>
          <h2>
            {c.totalInvoices} invoices · {formatMoney(c.totalInvoiceValueMinor, "INR")}
          </h2>
          <p className="muted">
            {c.overdueInvoiceCount} overdue invoices totalling{" "}
            {formatMoney(c.overdueMinor, "INR")}.
          </p>
          <table className="credit-invoices">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Due</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {c.invoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td>{invoice.id}</td>
                  <td>{invoice.due}</td>
                  <td>{formatMoney(invoice.amountMinor, "INR")}</td>
                  <td>
                    <span className={invoice.status === "overdue" ? "status-pill overdue" : "status-pill"}>
                      {invoice.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="field-hint">Showing 2 of {c.totalInvoices} invoices in the staging fixture.</p>
        </article>
        <article className="credit-card">
          <span className="eyebrow">Credit actions</span>
          <h2>Need more headroom?</h2>
          <p className="muted">
            Limit increase and payment actions are handled inside the trade app so the web surface
            never fakes a financial action.
          </p>
          <div className="credit-actions">
            <a className="button button-ghost" href="https://gobazarbee.com/#/b2b">
              Limit increase
            </a>
            <Link className="button button-ghost" href="/trade/catalogue">
              Shop trade catalogue
            </Link>
          </div>
        </article>
      </div>
    </section>
  );
}
