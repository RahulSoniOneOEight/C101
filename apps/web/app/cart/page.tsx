import { listProducts } from "@/lib/experience-api";
import { CartView } from "./cart-view";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Your cart",
};

export default async function CartPage() {
  // The cart itself is browser-local. The catalogue is resolved on the server so the cart can
  // merchandise real products from the same aisles without shipping the whole catalogue to the
  // browser.
  const products = await listProducts(100).catch(() => []);
  return <CartView catalogue={products} />;
}
