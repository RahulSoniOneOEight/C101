import Link from "next/link";
import { formatMoney, getProduct } from "@/lib/experience-api";

export const dynamic = "force-dynamic";

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = await getProduct(id);
  const offer = product.best_price ?? product.commercial?.selected_seller ?? null;
  const eligibility = product.commercial?.payment_eligibility ?? [];

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

      {offer ? (
        <>
          <p className="price">{formatMoney(offer.unit_amount_minor, offer.currency_code)}</p>
          <p className="muted">
            Seller: {offer.seller_name ?? offer.seller_id} · {offer.stock_badge ?? "in stock"}
          </p>
          <p>
            <Link className="button" href={`/checkout?productId=${encodeURIComponent(product.id)}`}>
              Buy now
            </Link>
          </p>
        </>
      ) : (
        <p className="muted">No eligible seller offer for this product.</p>
      )}
    </section>
  );
}
