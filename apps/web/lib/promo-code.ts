"use client";

const PROMO_KEY = "bazarbee.promoCode.v1";

export function readPromoCode(): string {
  if (typeof window === "undefined") return "";
  try {
    return (window.localStorage.getItem(PROMO_KEY) ?? "").trim().toUpperCase();
  } catch {
    return "";
  }
}

export function writePromoCode(code: string): void {
  if (typeof window === "undefined") return;
  const value = code.trim().toUpperCase();
  try {
    if (value) window.localStorage.setItem(PROMO_KEY, value);
    else window.localStorage.removeItem(PROMO_KEY);
  } catch {
    // Promo persistence is best-effort; checkout still validates the code.
  }
}
