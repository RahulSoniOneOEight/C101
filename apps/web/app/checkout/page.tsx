import Link from "next/link";
import { getProduct } from "@/lib/experience-api";
import { CheckoutForm } from "./checkout-form";

export const dynamic = "force-dynamic";

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ productId?: string }>;
}) {
  const { productId } = await searchParams;
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
  const offer = product.best_price ?? product.commercial?.selected_seller ?? null;
  if (!offer) {
    return (
      <section>
        <h1>Checkout</h1>
        <p className="muted">No eligible seller offer for this product.</p>
      </section>
    );
  }

  return (
    <section>
      <h1>Checkout</h1>
      <p className="muted">{product.title}</p>
      <CheckoutForm offerId={offer.id} productTitle={product.title} />
    </section>
  );
}
