"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { addToCart, announceCartConflict, type CartItem } from "@/lib/cart";

export function AddToCart({
  item,
  maxQuantity,
}: {
  item: Omit<CartItem, "quantity">;
  maxQuantity: number;
}) {
  const router = useRouter();
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const cap = Math.max(1, Math.min(99, maxQuantity || 99));

  function add(): void {
    const result = addToCart(item, quantity);
    if (!result.ok) {
      announceCartConflict(result);
      return;
    }
    setAdded(true);
  }

  function buyNow(): void {
    const result = addToCart(item, quantity);
    if (!result.ok) {
      announceCartConflict(result);
      return;
    }
    router.push("/checkout");
  }

  return (
    <div className="buy-box">
      <div className="quantity-row">
        <span className="quantity-label">Quantity</span>
        <div className="quantity-stepper">
          <button
            type="button"
            aria-label="Decrease quantity"
            onClick={() => setQuantity((value) => Math.max(1, value - 1))}
            disabled={quantity <= 1}
          >
            −
          </button>
          <input
            aria-label="Quantity"
            inputMode="numeric"
            value={quantity}
            onChange={(event) => {
              const parsed = Number(event.target.value.replace(/\D/g, ""));
              setQuantity(Number.isFinite(parsed) && parsed > 0 ? Math.min(cap, parsed) : 1);
            }}
          />
          <button
            type="button"
            aria-label="Increase quantity"
            onClick={() => setQuantity((value) => Math.min(cap, value + 1))}
            disabled={quantity >= cap}
          >
            +
          </button>
        </div>
      </div>
      <div className="buy-actions">
        <button className="button button-lg" type="button" onClick={add}>
          Add to cart
        </button>
        <button className="button button-dark button-lg" type="button" onClick={buyNow}>
          Buy now
        </button>
      </div>
      {added ? (
        <div className="notice ok added-notice" role="status">
          Added {quantity} × {item.title} to your cart.{" "}
          <Link href="/cart">Review cart →</Link>
        </div>
      ) : null}
    </div>
  );
}
