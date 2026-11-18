import Link from "next/link";
import { formatMoney, type ComposedProduct } from "@/lib/experience-api";
import { categoryForProduct } from "@/lib/catalogue";
import { ProductImage } from "./product-image";

/** Shared catalogue tile used on the home page, category pages and search results. */
export function ProductCard({ product }: { product: ComposedProduct }) {
  const offer = product.best_price;
  const category = categoryForProduct(product);
  const discount =
    offer?.discount_percent ??
    (offer?.list_amount_minor && offer.list_amount_minor > offer.unit_amount_minor
      ? Math.round(
          ((offer.list_amount_minor - offer.unit_amount_minor) / offer.list_amount_minor) * 100,
        )
      : 0);

  return (
    <Link className="product-card" href={`/products/${encodeURIComponent(product.id)}`}>
      <div className="product-media">
        <ProductImage src={product.thumbnail} alt={product.title} />
        {discount > 0 ? <span className="deal-badge">{discount}% off</span> : null}
      </div>
      <div className="product-body">
        {category ? <span className="product-category">{category.name}</span> : null}
        <h3 className="product-title">{product.title}</h3>
        <p className="product-seller">
          {offer?.seller_name ?? "Multiple sellers"} · {product.offer_count ?? 0}{" "}
          {(product.offer_count ?? 0) === 1 ? "offer" : "offers"}
        </p>
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
        <span className="product-cta">View product →</span>
      </div>
    </Link>
  );
}
