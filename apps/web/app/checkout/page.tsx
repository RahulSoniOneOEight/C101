import Link from "next/link";
import { formatMoney, getProduct, resolveVariant } from "@/lib/experience-api";
import { CheckoutForm } from "./checkout-form";

export const dynamic = "force-dynamic";

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ productId?: string; sku?: string }>;
}) {
  const { productId, sku } = await searchParams;
  if (!productId) {
    return (
      <section>
        <h1>Checkout</h1>
        <p className="muted">Select a product first.</p>
        <p>
          <Link className="button" href="/">
            Back to catalogue
          </Link>
        </p>
      </section>
    );
  }

  const product = await getProduct(productId);
  // Resolve the same variant the product page quoted, so the price shown is the price charged.
  const { variant, offer } = resolveVariant(product, sku);
  if (!offer) {
    return (
      <section>
        <h1>Checkout</h1>
        <p className="muted">
          {sku
            ? `No eligible seller offer for SKU ${sku}.`
            : "No eligible seller offer for this product."}
        </p>
        <p>
          <Link className="button" href={`/products/${encodeURIComponent(product.id)}`}>
            Back to product
          </Link>
        </p>
      </section>
    );
  }

  const price = formatMoney(offer.unit_amount_minor, offer.currency_code);
  const variantLabel = variant?.sku ? `${product.title} · SKU ${variant.sku} · ${price}` : product.title;

  return (
    <section>
      <h1>Checkout</h1>
      <CheckoutForm offerId={offer.id} productTitle={variantLabel} />
    </section>
  );
}
