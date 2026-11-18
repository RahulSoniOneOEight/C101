import { CartView } from "./cart-view";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Your cart",
};

export default function CartPage() {
  return <CartView />;
}
