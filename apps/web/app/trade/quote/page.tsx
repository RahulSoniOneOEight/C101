import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  ExperienceApiError,
  PILOT_SESSION_COOKIE,
  getMyContexts,
  hasTradeRole,
  listTradeProducts,
  type ComposedProduct,
} from "@/lib/experience-api";
import { readableBusinessName } from "@/lib/trade";
import { TradeNav } from "../trade-nav";
import { TradeQuoteView } from "./trade-quote-view";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Quotation cart",
};

export default async function TradeQuotePage() {
  const token = (await cookies()).get(PILOT_SESSION_COOKIE)?.value;
  if (!token) {
    redirect(`/sign-in?next=${encodeURIComponent("/trade/quote")}`);
  }

  let trade = false;
  let businessAccountId = "";
  try {
    const contexts = await getMyContexts(token);
    trade = hasTradeRole(contexts);
    businessAccountId = contexts.find((context) => context.business_account_id)?.business_account_id ?? "";
  } catch (error) {
    if (error instanceof ExperienceApiError && [401, 403].includes(error.status)) {
      redirect(`/sign-in?next=${encodeURIComponent("/trade/quote")}`);
    }
  }

  if (!trade) {
    return (
      <section className="trade-page">
        <TradeNav active="quote" />
        <div className="trade-access">
          <span className="eyebrow">Trade account required</span>
          <h1>A quotation cart needs a trade account</h1>
          <p className="muted">
            Open the trade app with a B2B buyer account to build and submit an RFQ.
          </p>
          <a className="button" href="https://gobazarbee.com/#/b2b">
            Open trade app
          </a>
        </div>
      </section>
    );
  }

  let catalogue: ComposedProduct[] = [];
  try {
    catalogue = await listTradeProducts(token, 100);
  } catch {
    // The quotation still works; the related-lines rail is simply hidden.
  }

  return (
    <section className="trade-page">
      <TradeNav active="quote" />
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <span aria-hidden="true">/</span>
        <Link href="/trade">BazarBee Trade</Link>
        <span aria-hidden="true">/</span>
        <span>Quote / RFQ</span>
      </nav>
      <div className="section-heading">
        <div>
          <span className="eyebrow">Request for quotation</span>
          <h1>Quotation cart</h1>
          <p className="muted">
            Review tier pricing, MOQ and delivery before submitting the RFQ.
          </p>
        </div>
        <Link className="section-link" href="/trade/catalogue">
          Add more products →
        </Link>
      </div>
      <TradeQuoteView
        businessName={readableBusinessName(businessAccountId)}
        catalogue={catalogue}
      />
    </section>
  );
}
