import type { Metadata } from "next";
import Link from "next/link";
import {
  formatMoney,
  getBoughtTogether,
  getProduct,
  resolveVariant,
  type ProductDetail,
} from "@/lib/experience-api";
import { categoryForProduct } from "@/lib/catalogue";
import { ProductImage } from "../../components/product-image";
import { RecordProductView } from "../../components/record-product-view";
import { RecentlyViewedRail } from "../../components/recently-viewed-rail";
import { WishlistButton } from "../../components/wishlist-button";
import { AddToCart } from "./add-to-cart";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  try {
    const { id } = await params;
    const product = await getProduct(id);
    return {
      title: product.title,
      description: product.description ?? "Shop on BazarBee.",
    };
  } catch {
    return { title: "Product" };
  }
}

function ProductView({
  product,
  variantSku,
  pair,
}: {
  product: ProductDetail;
  variantSku?: string;
  pair: Awaited<ReturnType<typeof getBoughtTogether>>;
}) {
  const { variant, offer } = resolveVariant(product, variantSku);
  const variants = product.variants ?? [];
  const category = categoryForProduct(product);
  const discount =
    offer?.discount_percent ??
    (offer?.list_amount_minor && offer.list_amount_minor > offer.unit_amount_minor
      ? Math.round(
          ((offer.list_amount_minor - offer.unit_amount_minor) / offer.list_amount_minor) * 100,
        )
      : 0);
  const paired = pair?.paired ?? null;
  const pairedOffer = paired?.best_price ?? null;
  const pairedOutOfStock = pair?.paired_availability === "out_of_stock";
  // The detail endpoint does not repeat `offer_count`; derive it from priced variants.
  const offerCount =
    product.offer_count ??
    (variants.filter((candidate) => Boolean(candidate.best_price?.id)).length || (offer ? 1 : 0));

  return (
    <section className="product-page">
      <RecordProductView productId={product.id} />
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <span aria-hidden="true">/</span>
        {category ? (
          <>
            <Link href={`/search?cat=${category.slug}`}>{category.name}</Link>
            <span aria-hidden="true">/</span>
          </>
        ) : null}
        <span className="breadcrumb-current">{product.title}</span>
      </nav>

      <div className="product-detail-grid">
        <div className="product-gallery">
          <div className="product-main-image">
            <ProductImage src={product.thumbnail} alt={product.title} eager />
          </div>
          <ul className="product-assurance">
            <li>
              <span aria-hidden="true">✓</span> Authoritative seller pricing
            </li>
            <li>
              <span aria-hidden="true">✓</span> GST invoice available
            </li>
            <li>
              <span aria-hidden="true">✓</span> Doorstep delivery
            </li>
          </ul>
        </div>

        <div className="product-info">
          <span className="eyebrow">{category?.name ?? "BazarBee catalogue"}</span>
          <h1>{product.title}</h1>
          {product.description ? <p className="product-lede">{product.description}</p> : null}

          <div className="product-meta-row">
            <span>{offer?.seller_name ?? "Multiple sellers"}</span>
            <span aria-hidden="true">·</span>
            <span>{offerCount === 1 ? "1 offer" : `${offerCount} offers`}</span>
            {variant?.sku ? (
              <>
                <span aria-hidden="true">·</span>
                <span>SKU {variant.sku}</span>
              </>
            ) : null}
          </div>

          {variants.length > 1 ? (
            <nav className="variants" aria-label="Choose a variant">
              {variants.map((candidate) => {
                const active = candidate.id === variant?.id;
                const label = candidate.title || candidate.sku || candidate.id;
                return (
                  <Link
                    key={candidate.id}
                    className={active ? "variant-link active" : "variant-link"}
                    aria-current={active ? "true" : undefined}
                    href={`/products/${encodeURIComponent(product.id)}?sku=${encodeURIComponent(
                      candidate.sku ?? "",
                    )}`}
                  >
                    {label}
                    {candidate.best_price?.id ? "" : " (no offer)"}
                  </Link>
                );
              })}
            </nav>
          ) : null}

          {offer ? (
            <>
              <div className="price-block">
                <span className="price price-hero">
                  {formatMoney(offer.unit_amount_minor, offer.currency_code)}
                </span>
                {offer.list_amount_minor && offer.list_amount_minor > offer.unit_amount_minor ? (
                  <span className="price-was price-was-lg">
                    {formatMoney(offer.list_amount_minor, offer.currency_code)}
                  </span>
                ) : null}
                {discount > 0 ? <span className="deal-badge deal-badge-lg">{discount}% off</span> : null}
              </div>
              <p className="stock-line">
                <span className={offer.in_stock === false ? "stock-dot out" : "stock-dot"} />
                {offer.in_stock === false ? "Out of stock" : "In stock"}
                {typeof offer.inventory_quantity === "number"
                  ? ` · ${offer.inventory_quantity} available`
                  : ""}
                {" · "}
                inclusive of applicable taxes
              </p>

              <AddToCart
                item={{
                  offerId: offer.id,
                  productId: product.id,
                  sku: variant?.sku ?? "",
                  title: product.title,
                  seller: offer.seller_name ?? offer.seller_id,
                  priceMinor: offer.unit_amount_minor,
                  currency: offer.currency_code,
                  image: product.thumbnail ?? null,
                }}
                maxQuantity={offer.inventory_quantity ?? 99}
              />
              <div className="product-save-row">
                <WishlistButton
                  variant="pill"
                  item={{
                    productId: product.id,
                    offerId: offer.id,
                    sku: variant?.sku ?? "",
                    title: product.title,
                    seller: offer.seller_name ?? "",
                    priceMinor: offer.unit_amount_minor,
                    currency: offer.currency_code,
                    image: product.thumbnail ?? null,
                  }}
                />
              </div>
            </>
          ) : (
            <div className="notice err">
              {variantSku
                ? `No eligible seller offer for SKU ${variantSku}.`
                : "No eligible seller offer for this product right now."}
            </div>
          )}

          <div className="seller-panel">
            <div>
              <span className="seller-label">Sold by</span>
              <strong>{offer?.seller_name ?? "Seller pending"}</strong>
            </div>
            <div>
              <span className="seller-label">Delivery</span>
              <strong>1–3 business days</strong>
            </div>
            <div>
              <span className="seller-label">Returns</span>
              <strong>Owner-scoped, simple</strong>
            </div>
          </div>
        </div>
      </div>

      {product.description ? (
        <section className="product-about">
          <div>
            <span className="eyebrow">Product details</span>
            <h2>About this product</h2>
            <p>{product.description}</p>
          </div>
          <dl className="product-specs">
            <div>
              <dt>SKU</dt>
              <dd>{variant?.sku ?? "—"}</dd>
            </div>
            <div>
              <dt>Seller</dt>
              <dd>{offer?.seller_name ?? offer?.seller_id ?? "—"}</dd>
            </div>
            <div>
              <dt>Offers</dt>
              <dd>{offerCount}</dd>
            </div>
            <div>
              <dt>Payment</dt>
              <dd>{(product.commercial?.payment_eligibility ?? []).join(", ") || "Simulated prepaid"}</dd>
            </div>
          </dl>
        </section>
      ) : null}

      {paired ? (
        <section className="pair-block">
          <span className="eyebrow">Complete the job</span>
          <h2>Bought together</h2>
          <p className="muted">Recommended with this item.</p>
          <div className="pair-grid">
            <div className="card pair-card">
              <p className="muted">This item</p>
              <p className="card-title">{product.title}</p>
              {variant?.sku ? <p className="muted">SKU {variant.sku}</p> : null}
              {offer ? (
                <p className="price">{formatMoney(offer.unit_amount_minor, offer.currency_code)}</p>
              ) : null}
            </div>
            <p className="pair-plus" aria-hidden="true">
              +
            </p>
            <div className="card pair-card">
              <p className="muted">Pair with</p>
              <p className="card-title">{paired.title}</p>
              {pairedOutOfStock || !pairedOffer ? (
                <p className="muted">Out of stock</p>
              ) : (
                <>
                  <p className="price">
                    {formatMoney(pairedOffer.unit_amount_minor, pairedOffer.currency_code)}
                  </p>
                  <p className="muted">{pairedOffer.seller_name ?? pairedOffer.seller_id}</p>
                </>
              )}
              <p>
                <Link className="button" href={`/products/${encodeURIComponent(paired.id)}`}>
                  View product
                </Link>
              </p>
            </div>
          </div>
        </section>
      ) : null}

      <RecentlyViewedRail excludeId={product.id} />

      <div className="markers product-markers">
        <span className="marker">environment: {product.environment ?? "—"}</span>
        <span className="marker">test_data: {String(product.test_data ?? false)}</span>
        {(product.freshness ?? []).map((freshness) => (
          <span className="marker" key={freshness.source}>
            {freshness.source}: {freshness.stale ? "stale" : "fresh"}
          </span>
        ))}
      </div>
    </section>
  );
}

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sku?: string }>;
}) {
  const { id } = await params;
  const { sku: requestedSku } = await searchParams;
  const product = await getProduct(id);
  const { variant } = resolveVariant(product, requestedSku);
  const pair = await getBoughtTogether(product.id, variant?.sku ?? null, "b2c");
  return <ProductView product={product} variantSku={requestedSku} pair={pair} />;
}
