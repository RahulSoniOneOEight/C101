"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ComposedProduct } from "@/lib/experience-api";
import { productDeliveryNote, productStockNote } from "@/lib/storefront";
import { AddToQuote } from "../add-to-quote";

function QuickLine({ product }: { product: ComposedProduct }) {
  const offer = product.best_price;
  if (!offer) return null;
  const moq = Math.max(1, offer.b2b_moq ?? 1);
  const note = [productDeliveryNote(product), productStockNote(offer)].filter(Boolean).join(" · ");
  return (
    <article className="trade-product quick-order-line" data-testid="quick-order-line">
      <div className="trade-product-body">
        <span className="trade-seller">{offer.seller_name ?? "Trade seller"}</span>
        <h3>{product.title}</h3>
        <p className="muted">
          SKU {offer.sku} · MOQ {moq}
        </p>
        {note ? <p className="product-note">{note}</p> : null}
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
}

export function QuickOrder({
  products,
  buyAgain,
}: {
  products: ComposedProduct[];
  buyAgain: ComposedProduct[];
}) {
  const [query, setQuery] = useState("");
  const [list, setList] = useState("all");

  const lists = useMemo(() => {
    const values = new Set<string>();
    products.forEach((product) => {
      const category = product.categories?.[0]?.name;
      if (category) values.add(category);
    });
    return [...values].sort((a, b) => a.localeCompare(b));
  }, [products]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return products.filter((product) => {
      const offer = product.best_price;
      const category = product.categories?.[0]?.name ?? "";
      if (list !== "all" && category !== list) return false;
      if (!term) return true;
      return [product.title, offer?.sku ?? "", category]
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [products, query, list]);

  return (
    <div className="quick-order">
      <div className="quick-order-toolbar">
        <label className="quick-order-search">
          <span className="sr-only">Search by SKU or title</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Enter SKU or product title"
            autoComplete="off"
            data-testid="quick-order-sku"
          />
        </label>
        <span className="muted" data-testid="quick-order-count">
          {filtered.length} {filtered.length === 1 ? "line" : "lines"}
        </span>
      </div>

      {lists.length > 0 ? (
        <div className="filter-bar quick-order-lists" aria-label="Saved trade lists">
          <button
            type="button"
            className={list === "all" ? "filter-chip active" : "filter-chip"}
            onClick={() => setList("all")}
          >
            All lists
          </button>
          {lists.map((name) => (
            <button
              key={name}
              type="button"
              className={list === name ? "filter-chip active" : "filter-chip"}
              onClick={() => setList(name)}
            >
              {name}
            </button>
          ))}
        </div>
      ) : null}

      {buyAgain.length > 0 ? (
        <section className="quick-order-section" id="buy-again">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Buy again</span>
              <h2>Recent order lines</h2>
            </div>
            <Link className="section-link" href="/orders">
              Order history →
            </Link>
          </div>
          <div className="trade-product-grid">
            {buyAgain.map((product) => (
              <QuickLine key={`buy-again-${product.id}`} product={product} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="quick-order-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Quick order pad</span>
            <h2>Trade catalogue</h2>
          </div>
          <Link className="section-link" href="/trade/catalogue">
            Full catalogue →
          </Link>
        </div>
        {filtered.length > 0 ? (
          <div className="trade-product-grid" data-testid="quick-order-grid">
            {filtered.map((product) => (
              <QuickLine key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <div className="empty-panel">
            <h2>No matching trade lines</h2>
            <p className="muted">Try another SKU, product title or trade list.</p>
          </div>
        )}
      </section>
    </div>
  );
}
