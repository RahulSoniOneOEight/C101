import Link from "next/link";
import { formatMoney } from "@/lib/money";
import type { ComposedProduct } from "@/lib/experience-api";
import { categoryForProduct } from "@/lib/catalogue";
import { productDeliveryNote, productStockNote } from "@/lib/storefront";
import { ProductImage } from "./product-image";
import { QuickAdd } from "./quick-add";
import { WishlistButton } from "./wishlist-button";

/** Shared catalogue tile used on the home page, category pages and search results. */
export function ProductCard({ product }: { product: ComposedProduct }) {
  const offer = product.best_price;
  const category = categoryForProduct(product);
  const note = [productDeliveryNote(product), productStockNote(offer)].filter(Boolean).join(" · ");
  const discount =
    offer?.discount_percent ??
    (offer?.list_amount_minor && offer.list_amount_minor > offer.unit_amount_minor
      ? Math.round(
          ((offer.list_amount_minor - offer.unit_amount_minor) / offer.list_amount_minor) * 100,
        )
      : 0);
  const href = `/products/${encodeURIComponent(product.id)}`;
  const cartItem = offer
    ? {
        productId: product.id,
        offerId: offer.id,
        sku: offer.sku,
        title: product.title,
        seller: offer.seller_name ?? "",
        priceMinor: offer.unit_amount_minor,
        currency: offer.currency_code,
        image: product.thumbnail ?? null,
      }
    : null;

  return (
    <div className="product-card-wrap">
      <article className="product-card">
        <Link className="product-card-main" href={href}>
          <div className="product-media">
            <ProductImage src={product.thumbnail} alt={product.title} />
            {discount > 0 ? <span className="deal-badge">{discount}% off</span> : null}
            {offer?.stock_badge === "low_stock" ? (
              <span className="stock-flag">Low stock</span>
            ) : null}
          </div>
          <div className="product-body">
            {category ? <span className="product-category">{category.name}</span> : null}
            <h3 className="product-title">{product.title}</h3>
            <p className="product-seller">
              {offer?.seller_name ?? "Multiple sellers"} · {product.offer_count ?? 0}{" "}
              {(product.offer_count ?? 0) === 1 ? "offer" : "offers"}
              {(product.variants?.length ?? 0) > 1
                ? ` · ${product.variants!.length} options`
                : ""}
            </p>
            {note ? <p className="product-note">{note}</p> : null}
          </div>
        </Link>
        <div className="product-card-actions">
          <div className="product-price-row">
            <span className="price">
              {offer
                ? formatMoney(offer.unit_amount_minor, offer.currency_code)
                : "Unavailable"}
            </span>
            {offer?.list_amount_minor && offer.list_amount_minor > offer.unit_amount_minor ? (
              <span className="price-was">
                {formatMoney(offer.list_amount_minor, offer.currency_code)}
              </span>
            ) : null}
          </div>
          <QuickAdd item={cartItem} />
        </div>
      </article>
      <WishlistButton
        item={{
          productId: product.id,
          offerId: offer?.id ?? "",
          sku: offer?.sku ?? "",
          title: product.title,
          seller: offer?.seller_name ?? "",
          priceMinor: offer?.unit_amount_minor ?? 0,
          currency: offer?.currency_code ?? "INR",
          image: product.thumbnail ?? null,
        }}
      />
    </div>
  );
}
