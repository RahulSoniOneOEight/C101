"use client";

import { useRouter } from "next/navigation";
import { addToCart, type CartItem } from "@/lib/cart";

/**
 * Places a trade offer into the order cart at its MOQ, then opens checkout.
 *
 * The signed-in buyer's role decides the cart channel on the server, so a trade buyer checking out
 * this line produces a B2B order. The offer id is the B2B offer returned by the trade catalogue.
 */
export function TradeBuyNow({
  item,
  quantity,
}: {
  item: Omit<CartItem, "quantity">;
  quantity: number;
}) {
  const router = useRouter();
  return (
    <button
      className="button button-ghost trade-buy-now"
      type="button"
      onClick={() => {
        addToCart(item, Math.max(1, Math.min(99, quantity)));
        router.push("/checkout");
      }}
    >
      Buy at trade rate
    </button>
  );
}
