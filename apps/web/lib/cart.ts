"use client";

import { useCallback, useEffect, useState } from "react";

export interface CartItem {
  offerId: string;
  productId: string;
  sku: string;
  title: string;
  seller: string;
  priceMinor: number;
  currency: string;
  image?: string | null;
  /** The cart is created in one sales channel; a trade line marks the whole basket B2B. */
  channel?: "b2c" | "b2b";
  quantity: number;
}

const STORAGE_KEY = "bazarbee.cart.v1";
const CHANGE_EVENT = "bazarbee-cart-change";

function isCartItem(value: unknown): value is CartItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<CartItem>;
  return (
    typeof item.offerId === "string" &&
    typeof item.productId === "string" &&
    typeof item.title === "string" &&
    typeof item.priceMinor === "number" &&
    typeof item.currency === "string"
  );
}

export function readCart(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isCartItem).map((item) => ({
      ...item,
      sku: item.sku ?? "",
      seller: item.seller ?? "",
      channel: item.channel === "b2b" ? "b2b" : "b2c",
      quantity:
        typeof item.quantity === "number" && item.quantity > 0
          ? Math.min(99, Math.trunc(item.quantity))
          : 1,
    }));
  } catch {
    return [];
  }
}

function writeCart(items: CartItem[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export type CartAddResult =
  | { ok: true }
  | {
      ok: false;
      reason: "channel-conflict";
      currentChannel: "b2c" | "b2b";
      nextChannel: "b2c" | "b2b";
    };

export function addToCart(
  item: Omit<CartItem, "quantity">,
  quantity = 1,
): CartAddResult {
  const items = readCart();
  const nextChannel = item.channel === "b2b" ? "b2b" : "b2c";
  const currentChannels = new Set(items.map((candidate) => candidate.channel ?? "b2c"));
  if (items.length > 0 && (currentChannels.size > 1 || !currentChannels.has(nextChannel))) {
    return {
      ok: false,
      reason: "channel-conflict",
      currentChannel: [...currentChannels][0] ?? "b2c",
      nextChannel,
    };
  }
  const existing = items.find((candidate) => candidate.offerId === item.offerId);
  if (existing) {
    existing.quantity = Math.min(99, existing.quantity + Math.max(1, quantity));
  } else {
    items.push({
      ...item,
      channel: nextChannel,
      quantity: Math.max(1, Math.min(99, quantity)),
    });
  }
  writeCart(items);
  return { ok: true };
}

/** Surface a channel conflict without discarding the existing basket. */
export function announceCartConflict(result: CartAddResult): void {
  if (result.ok || typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("bazarbee:cart-conflict", {
      detail: {
        currentChannel: result.currentChannel,
        nextChannel: result.nextChannel,
      },
    }),
  );
}

export function setQuantity(offerId: string, quantity: number): void {
  const next = Math.max(0, Math.min(99, Math.trunc(quantity)));
  if (next === 0) {
    removeFromCart(offerId);
    return;
  }
  writeCart(
    readCart().map((item) => (item.offerId === offerId ? { ...item, quantity: next } : item)),
  );
}

export function removeFromCart(offerId: string): void {
  writeCart(readCart().filter((item) => item.offerId !== offerId));
}

export function clearCart(): void {
  writeCart([]);
}

export function cartSubtotal(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.priceMinor * item.quantity, 0);
}

export function cartCount(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}

export function useCart(): {
  items: CartItem[];
  ready: boolean;
  count: number;
  subtotalMinor: number;
  currency: string;
  updateQuantity: (offerId: string, quantity: number) => void;
  remove: (offerId: string) => void;
  clear: () => void;
} {
  const [items, setItems] = useState<CartItem[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sync = () => setItems(readCart());
    sync();
    setReady(true);
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const updateQuantity = useCallback((offerId: string, quantity: number) => {
    setQuantity(offerId, quantity);
  }, []);
  const remove = useCallback((offerId: string) => removeFromCart(offerId), []);
  const clear = useCallback(() => clearCart(), []);

  return {
    items,
    ready,
    count: cartCount(items),
    subtotalMinor: cartSubtotal(items),
    currency: items[0]?.currency ?? "INR",
    updateQuantity,
    remove,
    clear,
  };
}
