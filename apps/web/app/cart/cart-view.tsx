"use client";

import Link from "next/link";
import type { ComposedProduct } from "@/lib/experience-api";
import { formatMoney } from "@/lib/money";
import { useCart } from "@/lib/cart";
import { ProductCard } from "../components/product-card";
import { ProductImage } from "../components/product-image";

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
            <article className="cart-line" key={item.offerId}>
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
                      onClick={() => updateQuantity(item.offerId, item.quantity - 1)}
                    >
                      −
                    </button>
                    <input
                      aria-label={`Quantity for ${item.title}`}
                      inputMode="numeric"
                      value={item.quantity}
                      onChange={(event) => {
                        const parsed = Number(event.target.value.replace(/\D/g, ""));
                        updateQuantity(item.offerId, Number.isFinite(parsed) ? parsed : 1);
                      }}
                    />
                    <button
                      type="button"
                      aria-label="Increase quantity"
                      onClick={() => updateQuantity(item.offerId, item.quantity + 1)}
                    >
                      +
                    </button>
                  </div>
                  <button
                    className="text-button remove-button"
                    type="button"
                    onClick={() => remove(item.offerId)}
                  >
                    Remove
                  </button>
                </div>
              </div>
              <div className="cart-line-total">
                {formatMoney(item.priceMinor * item.quantity, item.currency)}
              </div>
            </article>
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
