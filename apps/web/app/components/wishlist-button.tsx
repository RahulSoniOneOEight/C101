"use client";

import { useWishlist, type WishlistItem } from "@/lib/wishlist";

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" width="20" height="20">
      <path
        d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 7.5 3c0 5.4-7.5 10-7.5 10Z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function WishlistButton({
  item,
  variant = "icon",
}: {
  item: WishlistItem;
  variant?: "icon" | "pill";
}) {
  const { isSaved, toggle } = useWishlist();
  const saved = isSaved(item.productId);

  return (
    <button
      type="button"
      className={
        variant === "pill"
          ? saved
            ? "wishlist-pill saved"
            : "wishlist-pill"
          : saved
            ? "wishlist-float saved"
            : "wishlist-float"
      }
      aria-pressed={saved}
      aria-label={saved ? `Remove ${item.title} from wishlist` : `Save ${item.title} to wishlist`}
      onClick={() => toggle(item)}
    >
      <HeartIcon filled={saved} />
      {variant === "pill" ? <span>{saved ? "Saved" : "Save for later"}</span> : null}
    </button>
  );
}
