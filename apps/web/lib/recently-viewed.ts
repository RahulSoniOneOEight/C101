"use client";

/**
 * Customer-local recently viewed history. The web store has no cross-device history service yet,
 * so the rail mirrors the app's behaviour with localStorage and a same-tab change event.
 */
const STORAGE_KEY = "bazarbee.recently-viewed.v1";
const CHANGE_EVENT = "bazarbee-recently-viewed-change";
const MAX_ITEMS = 12;

export function readRecentlyViewed(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => typeof value === "string" && value.length > 0);
  } catch {
    return [];
  }
}

export function recordRecentlyViewed(productId: string): void {
  if (typeof window === "undefined" || !productId) return;
  const next = [productId, ...readRecentlyViewed().filter((id) => id !== productId)].slice(
    0,
    MAX_ITEMS,
  );
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    // Storage can be unavailable in private browsing; the rail simply stays empty.
  }
}

export function recentlyViewedEventName(): string {
  return CHANGE_EVENT;
}
