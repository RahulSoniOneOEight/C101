import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  ExperienceApiError,
  PILOT_SESSION_COOKIE,
  getMyContexts,
  getTradeProduct,
  hasTradeRole,
  listTradeProducts,
  type BuyerContext,
  type ComposedProduct,
  type ProductDetail,
} from "@/lib/experience-api";
import { deliveryPromise } from "@/lib/delivery-promise";
import { formatMoney } from "@/lib/money";
import { productDeliveryNote, productStockNote } from "@/lib/storefront";
import { ProductImage } from "../../../components/product-image";
import { TradeNav } from "../../trade-nav";
import { TradeProductCard } from "../../trade-product-card";
import { TradePricingPanel } from "./trade-pricing-panel";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Trade product",
};

export default async function TradePdpPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const token = (await cookies()).get(PILOT_SESSION_COOKIE)?.value;
  if (!token) {
    redirect(`/sign-in?next=${encodeURIComponent(`/trade/pdp/${id}`)}`);
  }

  let contexts: BuyerContext[] = [];
  try {
    contexts = await getMyContexts(token);
  } catch (error) {
    if (error instanceof ExperienceApiError && [401, 403].includes(error.status)) {
      redirect(`/sign-in?next=${encodeURIComponent(`/trade/pdp/${id}`)}`);
    }
  }
  if (!hasTradeRole(contexts)) {
    return (
      <section className="trade-page">
        <div className="trade-access">
          <span className="eyebrow">Trade account required</span>
          <h1>Trade pricing is for business buyers</h1>
          <p className="muted">
            The signed-in account is a consumer account. Sign in with a trade-enabled account to
            see MOQ, tier pricing and add the line to a quotation.
          </p>
          <div className="buy-actions">
            <Link
              className="button"
              href={`/sign-in?next=${encodeURIComponent(`/trade/pdp/${id}`)}`}
            >
              Sign in with a trade account
            </Link>
            <Link className="button button-ghost" href="/trade">
              Trade overview
            </Link>
            <Link className="button button-ghost" href="/search">
              Consumer catalogue
            </Link>
          </div>
        </div>
      </section>
    );
  }

  let product: ProductDetail | null = null;
  let catalogue: ComposedProduct[] = [];
  try {
    [product, catalogue] = await Promise.all([
      getTradeProduct(id, token),
      listTradeProducts(token, 100).catch(() => []),
    ]);
  } catch {
    product = null;
  }

  if (!product) {
    return (
      <section className="trade-page">
        <TradeNav active="catalogue" />
        <div className="empty-panel">
          <span className="eyebrow">Trade product</span>
          <h1>This trade product is not available</h1>
          <p className="muted">
            It may have no active B2B terms right now. Browse the trade catalogue for products with
            current tier pricing.
          </p>
          <Link className="button" href="/trade/catalogue">
            Back to trade catalogue
          </Link>
        </div>
      </section>
    );
  }

  const offer =
    product.best_price ??
    product.commercial?.selected_seller ??
    product.offers?.[0] ??
    product.variants?.find((variant) => variant.best_price)?.best_price ??
    null;
  const pricedProduct: ComposedProduct = offer ? { ...product, best_price: offer } : product;
  const stock = productStockNote(offer);
  const delivery = productDeliveryNote(product) ?? `Standard delivery · ${deliveryPromise(product).label}`;
  const category = product.categories?.[0]?.name;
  const related = catalogue
    .filter((candidate) => candidate.id !== product.id && candidate.best_price)
    .slice(0, 3);

  return (
    <section className="trade-page">
      <TradeNav active="catalogue" />
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <span aria-hidden="true">/</span>
        <Link href="/trade">BazarBee Trade</Link>
        <span aria-hidden="true">/</span>
        <Link href="/trade/catalogue">Catalogue</Link>
        <span aria-hidden="true">/</span>
        <span className="breadcrumb-current">{product.title}</span>
      </nav>

      <div className="trade-pdp-grid">
        <div className="trade-pdp-media">
          <ProductImage src={product.thumbnail} alt={product.title} eager />
          {offer?.discount_percent ? (
            <span className="deal-badge deal-badge-lg">{offer.discount_percent}% off</span>
          ) : null}
        </div>

        <div className="trade-pdp-info">
          <span className="eyebrow">{category ?? "Trade catalogue"}</span>
          <h1>{product.title}</h1>
          <div className="product-meta-row">
            <span>{offer?.seller_name ?? "Trade seller"}</span>
            {offer?.sku ? (
              <>
                <span aria-hidden="true">·</span>
                <span>SKU {offer.sku}</span>
              </>
            ) : null}
          </div>

          <p className="stock-line">
            <span className={offer?.in_stock === false ? "stock-dot out" : "stock-dot"} />
            {stock ?? "In stock"}
            {typeof offer?.inventory_quantity === "number" ? ` · ${offer.inventory_quantity} available` : ""}
          </p>
          <p className="trade-card-delivery">{delivery}</p>

          <TradePricingPanel product={pricedProduct} />

          <dl className="product-specs trade-pdp-specs">
            <div>
              <dt>MOQ</dt>
              <dd>{Math.max(1, offer?.b2b_moq ?? 1)} pcs</dd>
            </div>
            <div>
              <dt>Base trade rate</dt>
              <dd>{offer ? formatMoney(offer.unit_amount_minor, offer.currency_code) : "—"}</dd>
            </div>
            <div>
              <dt>Payment</dt>
              <dd>RFQ / GST invoice</dd>
            </div>
            <div>
              <dt>Delivery</dt>
              <dd>{delivery}</dd>
            </div>
          </dl>
        </div>
      </div>

      {related.length > 0 ? (
        <section className="section">
          <div className="section-heading">
            <div>
              <span className="eyebrow">More trade lines</span>
              <h2>You may also like</h2>
            </div>
            <Link className="section-link" href="/trade/catalogue">
              Full trade catalogue →
            </Link>
          </div>
          <div className="trade-product-grid">
            {related.map((candidate) => (
              <TradeProductCard key={candidate.id} product={candidate} />
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}
