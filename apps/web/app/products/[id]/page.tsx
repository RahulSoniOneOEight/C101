import Link from "next/link";
import { formatMoney, getBoughtTogether, getProduct, resolveVariant } from "@/lib/experience-api";

export const dynamic = "force-dynamic";

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
  const { variant, offer } = resolveVariant(product, requestedSku);
  const variants = product.variants ?? [];
  const eligibility = product.commercial?.payment_eligibility ?? [];

  // Bought together is SKU-scoped: quote the SKU this page is actually showing.
  const pair = await getBoughtTogether(product.id, variant?.sku ?? null, "b2c");
  const paired = pair?.paired ?? null;
  const pairedOffer = paired?.best_price ?? null;
  const pairedOutOfStock = pair?.paired_availability === "out_of_stock";

  return (
    <section>
      <p className="muted">
        <Link href="/">← Catalogue</Link>
      </p>
      <h1>{product.title}</h1>
      {product.description ? <p>{product.description}</p> : null}

      <div className="markers">
        <span className="marker">environment: {product.environment ?? "—"}</span>
        <span className="marker">test_data: {String(product.test_data ?? false)}</span>
        <span className="marker">payment: {eligibility.join(", ") || "—"}</span>
        {(product.freshness ?? []).map((f) => (
          <span className="marker" key={f.source}>
            {f.source}: {f.stale ? "stale" : "fresh"}
          </span>
        ))}
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
          <p className="price">{formatMoney(offer.unit_amount_minor, offer.currency_code)}</p>
          <p className="muted">
            Seller: {offer.seller_name ?? offer.seller_id} · {offer.stock_badge ?? "in stock"}
            {variant?.sku ? ` · SKU ${variant.sku}` : ""}
          </p>
          <p>
            <Link
              className="button"
              href={`/checkout?productId=${encodeURIComponent(product.id)}&sku=${encodeURIComponent(
                variant?.sku ?? "",
              )}`}
            >
              Buy now
            </Link>
          </p>
        </>
      ) : (
        <p className="muted">
          {requestedSku
            ? `No eligible seller offer for SKU ${requestedSku}.`
            : "No eligible seller offer for this product."}
        </p>
      )}

      {paired ? (
        <section className="pair-block">
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
    </section>
  );
}
