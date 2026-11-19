"use client";

import { useEffect, useRef, useState } from "react";
import { addToCart, type CartItem } from "@/lib/cart";

/**
 * Quick add-to-cart for catalogue tiles. The product card opens the detail page; this button is
 * outside that link so a single click adds the default offer without navigating away.
 */
export function QuickAdd({
  item,
  quantity = 1,
  label = "Add to cart",
  className = "button quick-add",
}: {
  item: Omit<CartItem, "quantity"> | null;
  quantity?: number;
  label?: string;
  className?: string;
}) {
  const [added, setAdded] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  if (!item || !item.offerId) {
    return (
      <button className={className} type="button" disabled>
        Unavailable
      </button>
    );
  }

  return (
    <button
      className={`${className}${added ? " is-added" : ""}`}
      type="button"
      onClick={() => {
        addToCart(item, Math.max(1, Math.min(99, quantity)));
        setAdded(true);
        if (timer.current !== null) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setAdded(false), 1800);
      }}
      aria-live="polite"
    >
      {added ? "Added to cart ✓" : label}
    </button>
  );
}
