"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ComposedProduct } from "@/lib/experience-api";
import { brandOf, discountPercent } from "@/lib/catalogue-filters";
import { formatMoney } from "@/lib/money";
import { TradeProductCard } from "../trade-product-card";
import {
  lineTotal,
  readLatestRfq,
  saveSubmittedRfq,
  tierUnitPrice,
  useTradeQuote,
  type SubmittedRfq,
  type TradeQuoteLine,
} from "@/lib/trade-quote";

function newReference(): string {
  return `RFQ-${Math.floor(1000 + Math.random() * 9000)}`;
}

function RelatedTradeRail({
  lines,
  catalogue,
}: {
  lines: TradeQuoteLine[];
  catalogue: ComposedProduct[];
}) {
  const [open, setOpen] = useState(false);
  const inQuote = new Set(lines.map((line) => line.productId));
  const quotedProducts = catalogue.filter((product) => inQuote.has(product.id));
  const quoteRoots = new Set(
    quotedProducts.flatMap((product) =>
      (product.categories ?? []).map((category) => category.parent_category_id ?? category.id),
    ),
  );
  const quoteBrands = new Set(quotedProducts.map((product) => brandOf(product)).filter(Boolean));
  const related = catalogue
    .filter((product) => product.best_price && !inQuote.has(product.id))
    .map((product) => {
      const roots = (product.categories ?? []).map(
        (category) => category.parent_category_id ?? category.id,
      );
      const sameAisle = roots.some((root) => quoteRoots.has(root));
      const sameBrand = quoteBrands.has(brandOf(product));
      return { product, score: (sameAisle ? 2 : 0) + (sameBrand ? 1 : 0) };
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        discountPercent(right.product) - discountPercent(left.product),
    )
    .slice(0, 6)
    .map((entry) => entry.product);

  if (related.length === 0) return null;

  return (
    <section className="trade-related" aria-labelledby="trade-related-title">
      <div className="trade-related-head">
        <div>
          <span className="eyebrow">Merchandising</span>
          <h3 id="trade-related-title">You may also like</h3>
          <p>More trade lines from the same aisles and brands.</p>
        </div>
        <button
          type="button"
          className="trade-related-toggle"
          aria-expanded={open}
          aria-controls="trade-related-rail"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "Hide" : `Show ${related.length}`}
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            width="15"
            height="15"
            className={open ? "trade-related-chevron is-open" : "trade-related-chevron"}
          >
            <path d="m8 10 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      {open ? (
        <div className="trade-related-rail" id="trade-related-rail">
          {related.map((product) => (
            <TradeProductCard key={product.id} product={product} variant="rail" />
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function TradeQuoteView({
  businessName,
  catalogue = [],
}: {
  businessName: string;
  catalogue?: ComposedProduct[];
}) {
  const { lines, ready, count, quantityTotal, estimatedTotalMinor, currency, updateQuantity, remove, clear } =
    useTradeQuote();
  const [deliveryLocation, setDeliveryLocation] = useState("Bhiwadi, Rajasthan 301019");
  const [requiredBy, setRequiredBy] = useState("");
  const [remarks, setRemarks] = useState("");
  const [latest, setLatest] = useState<SubmittedRfq | null>(null);
  const [submitted, setSubmitted] = useState<SubmittedRfq | null>(null);

  useEffect(() => {
    setLatest(readLatestRfq());
  }, []);

  if (!ready) {
    return <p className="muted">Loading your quotation cart…</p>;
  }

  if (submitted) {
    return (
      <div className="quote-confirmation">
        <span className="success-mark" aria-hidden="true">✓</span>
        <span className="eyebrow">Request for quotation</span>
        <h1>RFQ draft created</h1>
        <p className="muted">
          {submitted.reference} · {submitted.lines.length}{" "}
          {submitted.lines.length === 1 ? "line" : "lines"} ·{" "}
          {formatMoney(submitted.estimatedTotalMinor, submitted.currency)} estimated
        </p>
        <div className="order-reference">
          <span>RFQ reference</span>
          <code>{submitted.reference}</code>
        </div>
        <dl className="checkout-receipt">
          <div>
            <dt>Deliver to</dt>
            <dd>{submitted.deliveryLocation || "Not specified"}</dd>
          </div>
          <div>
            <dt>Required by</dt>
            <dd>{submitted.requiredBy || "Not specified"}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>Saved on this device · not sent to sellers</dd>
          </div>
        </dl>
        <p className="notice simulation-notice">
          Staging RFQ draft. No seller message, order, reservation or payment was created.
        </p>
        <div className="buy-actions">
          <Link className="button" href="/trade/catalogue">
            Back to trade catalogue
          </Link>
          <Link className="button button-ghost" href="/trade/credit">
            View credit
          </Link>
        </div>
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="quote-empty">
        <div className="empty-panel">
          <span className="eyebrow">Quotation cart</span>
          <h1>Your quotation cart is empty</h1>
          <p className="muted">
            Add trade products from the catalogue. MOQ and quantity tiers are applied automatically
            and the RFQ stays on this device until you submit it.
          </p>
          <Link className="button" href="/trade/catalogue">
            Browse trade catalogue
          </Link>
        </div>
        {latest ? (
          <div className="quote-latest">
            <span className="eyebrow">Latest RFQ draft</span>
            <strong>{latest.reference}</strong>
            <span className="muted">
              {latest.lines.length} {latest.lines.length === 1 ? "line" : "lines"} ·{" "}
              {formatMoney(latest.estimatedTotalMinor, latest.currency)} estimated ·{" "}
              {new Date(latest.submittedAt).toLocaleString("en-IN")}
            </span>
          </div>
        ) : null}
      </div>
    );
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const rfq: SubmittedRfq = {
      reference: newReference(),
      submittedAt: new Date().toISOString(),
      lines,
      estimatedTotalMinor,
      currency,
      deliveryLocation,
      requiredBy,
      remarks,
    };
    saveSubmittedRfq(rfq);
    clear();
    setSubmitted(rfq);
  }

  return (
    <div className="quote-layout">
      <div className="quote-lines">
        {lines.map((line) => {
          const unit = tierUnitPrice(line, line.quantity);
          return (
            <article className="quote-line" key={line.offerId}>
              <div className="quote-line-head">
                <div>
                  <strong>{line.title}</strong>
                  <p className="muted">
                    {line.seller}
                    {line.sku ? ` · SKU ${line.sku}` : ""}
                  </p>
                </div>
                <button
                  className="text-button remove-button"
                  type="button"
                  onClick={() => remove(line.offerId)}
                >
                  Remove
                </button>
              </div>
              <div className="quote-line-grid">
                <div className="quantity-stepper quantity-stepper-sm">
                  <button
                    type="button"
                    aria-label="Decrease quantity"
                    onClick={() => updateQuantity(line.offerId, line.quantity - 1)}
                    disabled={line.quantity <= line.moq}
                  >
                    −
                  </button>
                  <input
                    aria-label={`Quantity for ${line.title}`}
                    inputMode="numeric"
                    value={line.quantity}
                    onChange={(event) => {
                      const parsed = Number(event.target.value.replace(/\D/g, ""));
                      updateQuantity(
                        line.offerId,
                        Number.isFinite(parsed) && parsed > 0 ? parsed : line.moq,
                      );
                    }}
                  />
                  <button
                    type="button"
                    aria-label="Increase quantity"
                    onClick={() => updateQuantity(line.offerId, line.quantity + 1)}
                  >
                    +
                  </button>
                </div>
                <div className="quote-line-rate">
                  <span>MOQ {line.moq}</span>
                  <strong>{formatMoney(unit, line.currency)} / unit</strong>
                </div>
                <div className="quote-line-sum">
                  <span className="muted">Line total</span>
                  <strong>{formatMoney(lineTotal(line), line.currency)}</strong>
                </div>
              </div>
            </article>
          );
        })}
        <RelatedTradeRail lines={lines} catalogue={catalogue} />
      </div>

      <aside className="quote-summary">
        <h2>Quotation summary</h2>
        <dl>
          <div>
            <dt>Lines</dt>
            <dd>{count}</dd>
          </div>
          <div>
            <dt>Total quantity</dt>
            <dd>{quantityTotal}</dd>
          </div>
          <div className="total-row">
            <dt>Estimated value</dt>
            <dd>{formatMoney(estimatedTotalMinor, currency)}</dd>
          </div>
        </dl>
        <p className="field-hint">
          Tier pricing is applied from the published B2B terms. Seller responses may differ.
        </p>

        <form className="quote-form" onSubmit={submit}>
          <label>
            Deliver to
            <input
              value={deliveryLocation}
              onChange={(event) => setDeliveryLocation(event.target.value)}
              placeholder="Site, city, state and postcode"
            />
          </label>
          <label>
            Required by
            <input
              type="date"
              value={requiredBy}
              onChange={(event) => setRequiredBy(event.target.value)}
            />
          </label>
          <label>
            Remarks
            <textarea
              rows={3}
              value={remarks}
              onChange={(event) => setRemarks(event.target.value)}
              placeholder="Delivery constraints, payment terms, site notes…"
            />
          </label>
          <button className="button button-lg button-block" type="submit">
            Create RFQ draft
          </button>
          <p className="field-hint">
            Saved for {businessName || "your trade account"} on this device. No seller message,
            order or payment is created.
          </p>
        </form>
      </aside>
    </div>
  );
}
