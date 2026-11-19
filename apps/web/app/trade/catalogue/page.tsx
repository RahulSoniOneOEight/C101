import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  ExperienceApiError,
  PILOT_SESSION_COOKIE,
  formatMoney,
  getMyContexts,
  getStorefrontPresentation,
  hasTradeRole,
  listTradeProducts,
  type BuyerContext,
  type ComposedProduct,
  type OfferView,
  type StorefrontCategory,
} from "@/lib/experience-api";
import { imageSources, productRootCategoryId } from "@/lib/storefront";
import { ProductImage } from "../../components/product-image";
import { AddToQuote } from "../add-to-quote";
import { TradeNav } from "../trade-nav";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Trade catalogue",
};

function TradeCard({ product, offer }: { product: ComposedProduct; offer: OfferView }) {
  const tiers = offer.b2b_tiers ?? [];
  const moq = Math.max(1, offer.b2b_moq ?? 1);
  return (
    <article className="trade-product">
      <Link href={`/products/${encodeURIComponent(product.id)}`} className="trade-product-media">
        <ProductImage src={product.thumbnail} alt={product.title} />
        {offer.discount_percent ? (
          <span className="deal-badge">{offer.discount_percent}% off</span>
        ) : null}
      </Link>
      <div className="trade-product-body">
        <span className="trade-seller">{offer.seller_name ?? "Trade seller"}</span>
        <h3>{product.title}</h3>
        <p className="muted">
          SKU {offer.sku}
          {offer.b2b_ends_at ? ` · terms end ${new Date(offer.b2b_ends_at).toLocaleDateString("en-IN")}` : ""}
        </p>
        <div className="trade-price-row">
          <span className="price">{formatMoney(offer.unit_amount_minor, offer.currency_code)}</span>
          {offer.list_amount_minor && offer.list_amount_minor > offer.unit_amount_minor ? (
            <span className="price-was">
              {formatMoney(offer.list_amount_minor, offer.currency_code)}
            </span>
          ) : null}
          <span className="trade-moq">MOQ {moq}</span>
        </div>
        {tiers.length > 0 ? (
          <table className="tier-table">
            <thead>
              <tr>
                <th>Quantity</th>
                <th>Unit price</th>
              </tr>
            </thead>
            <tbody>
              {tiers.map((tier) => (
                <tr key={`${tier.min_quantity}-${tier.max_quantity ?? "up"}`}>
                  <td>
                    {tier.min_quantity}
                    {tier.max_quantity === null ? "+" : `–${tier.max_quantity}`}
                  </td>
                  <td>{formatMoney(tier.amount, offer.currency_code)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="tier-single">Single trade rate · MOQ {moq}</p>
        )}
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
            tiers,
          }}
        />
      </div>
    </article>
  );
}

export default async function TradeCataloguePage({
  searchParams,
}: {
  searchParams: Promise<{ cat?: string }>;
}) {
  const { cat } = await searchParams;
  const token = (await cookies()).get(PILOT_SESSION_COOKIE)?.value;
  if (!token) {
    redirect(`/sign-in?next=${encodeURIComponent("/trade/catalogue")}`);
  }

  let contexts: BuyerContext[] = [];
  try {
    contexts = await getMyContexts(token);
  } catch (error) {
    if (error instanceof ExperienceApiError && [401, 403].includes(error.status)) {
      redirect(`/sign-in?next=${encodeURIComponent("/trade/catalogue")}`);
    }
  }
  const trade = hasTradeRole(contexts);

  if (!trade) {
    return (
      <section className="trade-page">
        <TradeNav active="catalogue" />
        <div className="trade-access">
          <span className="eyebrow">Trade account required</span>
          <h1>This catalogue is for trade buyers</h1>
          <p className="muted">
            The signed-in identity does not carry a B2B buyer role. Open the trade app with a trade
            account, or continue shopping the consumer catalogue.
          </p>
          <div className="buy-actions">
            <a className="button" href="https://gobazarbee.com/#/b2b">
              Open trade app
            </a>
            <Link className="button button-ghost" href="/search">
              Consumer catalogue
            </Link>
          </div>
        </div>
      </section>
    );
  }

  let products: ComposedProduct[] = [];
  let cmsCategories: StorefrontCategory[] = [];
  let loadError = "";
  const [productsResult, presentationResult] = await Promise.allSettled([
    listTradeProducts(token, 100),
    getStorefrontPresentation("b2b"),
  ]);
  if (productsResult.status === "fulfilled") products = productsResult.value;
  if (productsResult.status === "rejected") {
    const error = productsResult.reason as Error & { status?: number };
    if (error instanceof ExperienceApiError && [401, 403].includes(error.status)) {
      redirect(`/sign-in?next=${encodeURIComponent("/trade/catalogue")}`);
    }
    loadError = error.message;
  }
  if (presentationResult.status === "fulfilled") {
    cmsCategories = presentationResult.value.categories ?? [];
  }
  const selectedCategory = cmsCategories.find((candidate) => candidate.slug === cat);
  const filtered = selectedCategory
    ? products.filter(
        (product) =>
          productRootCategoryId(product, new Set([selectedCategory.category_id])) ===
          selectedCategory.category_id,
      )
    : products;
  const bannerImage = imageSources(selectedCategory?.banner_image_uri, 1600);

  return (
    <section className="trade-page">
      <TradeNav active="catalogue" />
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <span aria-hidden="true">/</span>
        <Link href="/trade">BazarBee Trade</Link>
        <span aria-hidden="true">/</span>
        <span>{selectedCategory?.label ?? "Catalogue"}</span>
      </nav>

      {selectedCategory && bannerImage.src ? (
        <div className="category-banner">
          <img
            src={bannerImage.src}
            srcSet={bannerImage.srcSet}
            sizes="(max-width: 720px) 100vw, 1200px"
            alt={selectedCategory.banner_image_alt ?? selectedCategory.label}
          />
          <div className="category-banner-copy">
            <span className="eyebrow eyebrow-light">Trade category</span>
            <strong>{selectedCategory.label}</strong>
            {selectedCategory.short_text ? <span>{selectedCategory.short_text}</span> : null}
          </div>
        </div>
      ) : null}

      <div className="section-heading">
        <div>
          <span className="eyebrow">Trade rates · MOQ · GST invoicing</span>
          <h1>{selectedCategory?.label ?? "Trade catalogue"}</h1>
          <p className="muted">
            {filtered.length} {filtered.length === 1 ? "product" : "products"} with active B2B terms.
            Quantity tiers are applied to your quotation.
          </p>
        </div>
        <Link className="section-link" href="/trade/credit">
          Credit overview →
        </Link>
      </div>

      <div className="filter-bar" aria-label="Trade categories">
        <Link className={!selectedCategory ? "filter-chip active" : "filter-chip"} href="/trade/catalogue">
          All
        </Link>
        {cmsCategories.map((candidate) => (
          <Link
            key={candidate.category_id}
            className={
              selectedCategory?.category_id === candidate.category_id
                ? "filter-chip active"
                : "filter-chip"
            }
            href={`/trade/catalogue?cat=${encodeURIComponent(candidate.slug)}`}
          >
            {candidate.label}
          </Link>
        ))}
      </div>

      {loadError ? (
        <div className="notice err" role="alert">
          The trade catalogue could not be loaded. {loadError}
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-panel">
          <h2>No trade terms in this category</h2>
          <p className="muted">
            No offer currently has active B2B pricing here. Try another trade category.
          </p>
          <Link className="button" href="/trade/catalogue">
            Clear category
          </Link>
        </div>
      ) : (
        <div className="trade-product-grid">
          {filtered
            .filter((product) => product.best_price)
            .map((product) => (
              <TradeCard key={product.id} product={product} offer={product.best_price!} />
            ))}
        </div>
      )}
    </section>
  );
}
