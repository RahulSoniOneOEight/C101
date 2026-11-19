"use client";

import Link from "next/link";
import { useState } from "react";
import type { ComposedProduct } from "@/lib/experience-api";
import { formatMoney } from "@/lib/money";
import { useCart, type CartItem } from "@/lib/cart";
import { brandOf, discountPercent } from "@/lib/catalogue-filters";
import { ProductCard } from "../components/product-card";
import { ProductImage } from "../components/product-image";
import { PromoCodeEntry } from "./promo-code-entry";

function SparkIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" width="15" height="15">
      <path
        d="M12 3.5 13.8 9l5.5 1.8-5.5 1.8L12 18l-1.8-5.4L4.7 10.8 10.2 9Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      width="15"
      height="15"
      className={open ? "related-chevron is-open" : "related-chevron"}
    >
      <path d="m8 10 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/** Same-aisle and same-brand lines first, then the strongest discounts. */
function relatedForLine(
  item: CartItem,
  catalogue: ComposedProduct[],
  inCart: Set<string>,
): ComposedProduct[] {
  const lineProduct = catalogue.find((product) => product.id === item.productId);
  const lineBrand = lineProduct ? brandOf(lineProduct) : "";
  const lineRoots = new Set(
    (lineProduct?.categories ?? []).map((category) => category.parent_category_id ?? category.id),
  );
  const scored = catalogue
    .filter(
      (product) =>
        product.best_price && product.id !== item.productId && !inCart.has(product.id),
    )
    .map((product) => {
      const roots = (product.categories ?? []).map(
        (category) => category.parent_category_id ?? category.id,
      );
      const sameAisle = roots.some((root) => lineRoots.has(root));
      const sameBrand = Boolean(lineBrand) && brandOf(product) === lineBrand;
      return {
        product,
        score: (sameAisle ? 2 : 0) + (sameBrand ? 1 : 0),
      };
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        discountPercent(right.product) - discountPercent(left.product),
    );
  return scored.slice(0, 6).map((entry) => entry.product);
}

function CartLine({
  item,
  related,
  onQuantity,
  onRemove,
}: {
  item: CartItem;
  related: ComposedProduct[];
  onQuantity: (offerId: string, quantity: number) => void;
  onRemove: (offerId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const relatedId = `cart-related-${item.offerId}`;

  return (
    <div className="cart-line-group">
      <article className="cart-line">
        <Link
          href={`/products/${encodeURIComponent(item.productId)}`}
          className="cart-line-media"
        >
          <ProductImage src={item.image} alt={item.title} />
        </Link>
        <div className="cart-line-info">
          <Link
            href={`/products/${encodeURIComponent(item.productId)}`}
            className="cart-line-title"
          >
            {item.title}
          </Link>
          <p className="muted">
            {item.seller}
            {item.sku ? ` · SKU ${item.sku}` : ""}
          </p>
          <p className="cart-unit-price">
            {formatMoney(item.priceMinor, item.currency)} each
          </p>
          <div className="cart-line-controls">
            <div className="quantity-stepper quantity-stepper-sm">
              <button
                type="button"
                aria-label="Decrease quantity"
                onClick={() => onQuantity(item.offerId, item.quantity - 1)}
              >
                −
              </button>
              <input
                aria-label={`Quantity for ${item.title}`}
                inputMode="numeric"
                value={item.quantity}
                onChange={(event) => {
                  const parsed = Number(event.target.value.replace(/\D/g, ""));
                  onQuantity(item.offerId, Number.isFinite(parsed) ? parsed : 1);
                }}
              />
              <button
                type="button"
                aria-label="Increase quantity"
                onClick={() => onQuantity(item.offerId, item.quantity + 1)}
              >
                +
              </button>
            </div>
            <button
              className="text-button remove-button"
              type="button"
              onClick={() => onRemove(item.offerId)}
            >
              Remove
            </button>
          </div>
        </div>
        <div className="cart-line-total">
          {formatMoney(item.priceMinor * item.quantity, item.currency)}
        </div>
      </article>

      {related.length > 0 ? (
        <div className="cart-line-related">
          <button
            type="button"
            className="related-toggle"
            aria-expanded={open}
            aria-controls={relatedId}
            onClick={() => setOpen((value) => !value)}
          >
            <span className="related-toggle-label">
              <SparkIcon />
              Related deals
            </span>
            <span className="related-toggle-action">
              {open ? "Hide" : `Show ${related.length}`}
              <ChevronIcon open={open} />
            </span>
          </button>
          {open ? (
            <div className="related-rail" id={relatedId}>
              {related.map((product) => (
                <div className="related-rail-card" key={product.id}>
                  <ProductCard product={product} />
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function CartView({ catalogue = [] }: { catalogue?: ComposedProduct[] }) {
  const { items, ready, count, subtotalMinor, currency, updateQuantity, remove } = useCart();
  const inCart = new Set(items.map((item) => item.productId));
  const cartRoots = new Set<string>();
  for (const product of catalogue) {
    if (!inCart.has(product.id)) continue;
    for (const category of product.categories ?? []) {
      cartRoots.add(category.parent_category_id ?? category.id);
    }
  }
  const available = catalogue.filter(
    (product) => product.best_price && !inCart.has(product.id),
  );
  const sameAisle = available.filter((product) =>
    (product.categories ?? []).some((category) =>
      cartRoots.has(category.parent_category_id ?? category.id),
    ),
  );
  const popular = [...available].sort(
    (a, b) =>
      (b.best_price?.discount_percent ?? 0) - (a.best_price?.discount_percent ?? 0),
  );
  const related = [...sameAisle, ...popular]
    .filter((product, index, all) => all.findIndex((item) => item.id === product.id) === index)
    .slice(0, 4);

  if (!ready) {
    return (
      <section className="cart-page">
        <h1>Your cart</h1>
        <p className="muted">Loading your cart…</p>
      </section>
    );
  }

  if (items.length === 0) {
    return (
      <section className="cart-page empty-cart">
        <div className="empty-cart-art" aria-hidden="true">
          <img src="/branding/bazarbee-app-icon.png" alt="" />
        </div>
        <span className="eyebrow">Your cart</span>
        <h1>Your cart is empty</h1>
        <p className="muted">
          Add building materials, paint or tools and they&apos;ll show up here, ready for checkout.
        </p>
        <Link className="button button-lg" href="/search">
          Start shopping
        </Link>
      </section>
    );
  }

  return (
    <section className="cart-page">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <span aria-hidden="true">/</span>
        <span>Cart</span>
      </nav>
      <div className="section-heading">
        <div>
          <span className="eyebrow">Almost there</span>
          <h1>Your cart</h1>
          <p className="muted">
            {count} {count === 1 ? "item" : "items"} ready for checkout.
          </p>
        </div>
        <Link className="section-link" href="/search">
          Continue shopping →
        </Link>
      </div>

      <div className="cart-layout">
        <div className="cart-lines">
          {items.map((item) => (
            <CartLine
              key={item.offerId}
              item={item}
              related={relatedForLine(item, catalogue, inCart)}
              onQuantity={updateQuantity}
              onRemove={remove}
            />
          ))}
        </div>

        <aside className="cart-summary">
          <h2>Order summary</h2>
          <dl>
            <div>
              <dt>Items subtotal</dt>
              <dd>{formatMoney(subtotalMinor, currency)}</dd>
            </div>
            <div>
              <dt>Delivery</dt>
              <dd>Calculated at checkout</dd>
            </div>
            <div>
              <dt>Automatic offer</dt>
              <dd>Applied at checkout</dd>
            </div>
          </dl>
          <Link className="button button-lg button-block" href="/checkout">
            Proceed to checkout
          </Link>
          <p className="field-hint">
            Delivery and any automatic discount are confirmed before you place the order. You
            &apos;ll sign in with an email code or magic link.
          </p>
          <ul className="summary-points">
            <li>GST invoice available</li>
            <li>Simulated payment · staging only</li>
            <li>Owner-scoped order tracking</li>
          </ul>
        </aside>
      </div>

      <PromoCodeEntry />

      {related.length > 0 ? (
        <section className="section cart-related" aria-labelledby="cart-related-title">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Complete the job</span>
              <h2 id="cart-related-title">You may also like</h2>
              <p className="muted">
                Picked from the same aisles as the items in your cart, then popular deals.
              </p>
            </div>
            <Link className="section-link" href="/search">
              Browse everything →
            </Link>
          </div>
          <div className="product-grid">
            {related.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}
