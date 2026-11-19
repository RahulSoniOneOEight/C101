"use client";

import Link from "next/link";
import type { StorefrontLocale } from "@/lib/locale-shared";
import { useCart } from "@/lib/cart";

function CartIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" width="22" height="22">
      <path
        d="M3 4h2.2l2.1 10.2a2 2 0 0 0 2 1.6h7.8a2 2 0 0 0 2-1.6L20.5 8H6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="9.5" cy="19.5" r="1.4" fill="currentColor" />
      <circle cx="17.5" cy="19.5" r="1.4" fill="currentColor" />
    </svg>
  );
}

export function CartLink({
  compact = false,
  locale = "en-IN",
}: {
  compact?: boolean;
  locale?: StorefrontLocale;
}) {
  const { count, ready } = useCart();
  return (
    <Link className={compact ? "tab-item" : "header-action cart-link"} href="/cart">
      <span className="cart-icon-wrap">
        <CartIcon />
        {ready && count > 0 ? (
          <span className="cart-count" aria-label={`${count} items in cart`}>
            {count > 99 ? "99+" : count}
          </span>
        ) : null}
      </span>
      <span>{locale === "hi-IN" ? "कार्ट" : "Cart"}</span>
    </Link>
  );
}
