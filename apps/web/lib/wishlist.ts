"use client";

import { useCallback, useEffect, useState } from "react";

export interface WishlistItem {
  productId: string;
  offerId: string;
  sku: string;
  title: string;
  seller: string;
  priceMinor: number;
  currency: string;
  image?: string | null;
}

const STORAGE_KEY = "bazarbee.wishlist.v1";
const CHANGE_EVENT = "bazarbee-wishlist-change";

function isWishlistItem(value: unknown): value is WishlistItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<WishlistItem>;
  return (
    typeof item.productId === "string" &&
    typeof item.offerId === "string" &&
    typeof item.title === "string" &&
    typeof item.priceMinor === "number" &&
    typeof item.currency === "string"
  );
}

export function readWishlist(): WishlistItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isWishlistItem).map((item) => ({
      ...item,
      sku: item.sku ?? "",
      seller: item.seller ?? "",
    }));
  } catch {
    return [];
  }
}

function writeWishlist(items: WishlistItem[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function toggleWishlist(item: WishlistItem): boolean {
  const items = readWishlist();
  const exists = items.some((candidate) => candidate.productId === item.productId);
  writeWishlist(
    exists
      ? items.filter((candidate) => candidate.productId !== item.productId)
      : [...items, item],
  );
  return !exists;
}

export function removeFromWishlist(productId: string): void {
  writeWishlist(readWishlist().filter((item) => item.productId !== productId));
}

export function useWishlist(): {
  items: WishlistItem[];
  ready: boolean;
  count: number;
  isSaved: (productId: string) => boolean;
  toggle: (item: WishlistItem) => boolean;
  remove: (productId: string) => void;
} {
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sync = () => setItems(readWishlist());
    sync();
    setReady(true);
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const isSaved = useCallback(
    (productId: string) => items.some((item) => item.productId === productId),
    [items],
  );
  const toggle = useCallback((item: WishlistItem) => toggleWishlist(item), []);
  const remove = useCallback((productId: string) => removeFromWishlist(productId), []);

  return { items, ready, count: items.length, isSaved, toggle, remove };
}
