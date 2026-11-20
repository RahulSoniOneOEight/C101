"use client";

import Link from "next/link";
import { addToCart, announceCartConflict } from "@/lib/cart";
import { formatMoney } from "@/lib/money";
import { useWishlist } from "@/lib/wishlist";
import { ProductImage } from "../components/product-image";

export function WishlistView() {
  const { items, ready, remove } = useWishlist();

  if (!ready) {
    return (
      <section className="wishlist-page">
        <h1>Wishlist</h1>
        <p className="muted">Loading saved products…</p>
      </section>
    );
  }

  if (items.length === 0) {
    return (
      <section className="wishlist-page empty-cart">
        <div className="empty-cart-art" aria-hidden="true">
          <img src="/branding/bazarbee-app-icon.png" alt="" />
        </div>
        <span className="eyebrow">Wishlist</span>
        <h1>Nothing saved yet</h1>
        <p className="muted">
          Tap the heart on any product to keep it here for later. Saved products stay on this
          device.
        </p>
        <Link className="button button-lg" href="/search">
          Browse the catalogue
        </Link>
      </section>
    );
  }

  return (
    <section className="wishlist-page">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <span aria-hidden="true">/</span>
        <span>Wishlist</span>
      </nav>
      <div className="section-heading">
        <div>
          <span className="eyebrow">Saved for later</span>
          <h1>Your wishlist</h1>
          <p className="muted">
            {items.length} saved {items.length === 1 ? "product" : "products"} on this device.
          </p>
        </div>
        <Link className="section-link" href="/search">
          Continue shopping →
        </Link>
      </div>

      <div className="product-grid">
        {items.map((item) => (
          <article className="wishlist-card" key={item.productId}>
            <Link
              href={`/products/${encodeURIComponent(item.productId)}`}
              className="wishlist-media"
            >
              <ProductImage src={item.image} alt={item.title} />
            </Link>
            <div className="wishlist-body">
              <Link
                href={`/products/${encodeURIComponent(item.productId)}`}
                className="wishlist-title"
              >
                {item.title}
              </Link>
              <p className="muted">
                {item.seller || "BazarBee seller"}
                {item.sku ? ` · SKU ${item.sku}` : ""}
              </p>
              <p className="price">{formatMoney(item.priceMinor, item.currency)}</p>
              <div className="wishlist-actions">
                {item.offerId ? (
                  <button
                    className="button"
                    type="button"
                    onClick={() => {
                      const result = addToCart({
                        offerId: item.offerId,
                        productId: item.productId,
                        sku: item.sku,
                        title: item.title,
                        seller: item.seller,
                        priceMinor: item.priceMinor,
                        currency: item.currency,
                        image: item.image,
                      });
                      if (!result.ok) announceCartConflict(result);
                    }}
                  >
                    Add to cart
                  </button>
                ) : (
                  <Link className="button button-ghost" href={`/products/${encodeURIComponent(item.productId)}`}>
                    View product
                  </Link>
                )}
                <button
                  className="text-button remove-button"
                  type="button"
                  onClick={() => remove(item.productId)}
                >
                  Remove
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
