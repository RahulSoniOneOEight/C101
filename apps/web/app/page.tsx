import Link from "next/link";
import { experienceApiBase, formatMoney, listProducts } from "@/lib/experience-api";

export const dynamic = "force-dynamic";

export default async function CataloguePage() {
  const products = await listProducts(24);
  return (
    <section>
      <h1>Hardware catalogue</h1>
      <p className="muted">
        Composed by the shared Experience API ({experienceApiBase()}); the web client renders the
        authoritative result and never computes prices or business rules.
      </p>
      <div className="grid">
        {products.map((product) => (
          <Link key={product.id} href={`/products/${product.id}`} className="card">
            <span className="card-title">{product.title}</span>
            <span className="price">
              {product.best_price
                ? formatMoney(product.best_price.unit_amount_minor, product.best_price.currency_code)
                : "—"}
            </span>
            <span className="muted">
              {product.best_price?.seller_name ?? "no seller"} · {product.offer_count ?? 0} offers
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
