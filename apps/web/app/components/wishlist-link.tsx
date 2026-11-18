"use client";

import Link from "next/link";
import { useWishlist } from "@/lib/wishlist";

function HeartIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" width="21" height="21">
      <path
        d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 7.5 3c0 5.4-7.5 10-7.5 10Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function WishlistLink() {
  const { count, ready } = useWishlist();
  return (
    <Link className="header-action wishlist-link" href="/wishlist">
      <span className="cart-icon-wrap">
        <HeartIcon />
        {ready && count > 0 ? (
          <span className="cart-count" aria-label={`${count} saved items`}>
            {count > 99 ? "99+" : count}
          </span>
        ) : null}
      </span>
      <span>Wishlist</span>
    </Link>
  );
}
