"use client";

import { useCallback, useEffect, useState } from "react";
import type { B2bTier } from "./experience-api";

export interface TradeQuoteLine {
  productId: string;
  offerId: string;
  sku: string;
  title: string;
  seller: string;
  image?: string | null;
  moq: number;
  basePriceMinor: number;
  currency: string;
  tiers: B2bTier[];
  quantity: number;
}

export interface SubmittedRfq {
  reference: string;
  submittedAt: string;
  lines: TradeQuoteLine[];
  estimatedTotalMinor: number;
  currency: string;
  deliveryLocation: string;
  requiredBy: string;
  remarks: string;
}

const QUOTE_KEY = "bazarbee.trade.quote.v1";
const RFQ_KEY = "bazarbee.trade.rfq.v1";
const CHANGE_EVENT = "bazarbee-trade-quote-change";

/** The tier whose minimum quantity the line has reached; falls back to the offer unit price. */
export function tierUnitPrice(line: TradeQuoteLine, quantity: number): number {
  const tier = [...line.tiers]
    .filter((candidate) => quantity >= candidate.min_quantity)
    .sort((a, b) => b.min_quantity - a.min_quantity)[0];
  return tier?.amount ?? line.basePriceMinor;
}

export function lineTotal(line: TradeQuoteLine): number {
  return tierUnitPrice(line, line.quantity) * line.quantity;
}

function isLine(value: unknown): value is TradeQuoteLine {
  if (!value || typeof value !== "object") return false;
  const line = value as Partial<TradeQuoteLine>;
  return (
    typeof line.productId === "string" &&
    typeof line.offerId === "string" &&
    typeof line.title === "string" &&
    typeof line.basePriceMinor === "number" &&
    typeof line.quantity === "number"
  );
}

export function readTradeQuote(): TradeQuoteLine[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(QUOTE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isLine).map((line) => ({
      ...line,
      sku: line.sku ?? "",
      seller: line.seller ?? "",
      moq: Math.max(1, line.moq || 1),
      currency: line.currency || "INR",
      tiers: Array.isArray(line.tiers) ? line.tiers : [],
      quantity: Math.max(Math.max(1, line.moq || 1), Math.trunc(line.quantity)),
    }));
  } catch {
    return [];
  }
}

function writeTradeQuote(lines: TradeQuoteLine[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(QUOTE_KEY, JSON.stringify(lines));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function addToTradeQuote(line: Omit<TradeQuoteLine, "quantity">, quantity?: number): void {
  const items = readTradeQuote();
  const moq = Math.max(1, line.moq || 1);
  const requested = Math.max(moq, Math.trunc(quantity ?? moq));
  const existing = items.find((item) => item.offerId === line.offerId);
  if (existing) {
    existing.quantity = Math.min(999, existing.quantity + requested);
  } else {
    items.push({ ...line, moq, quantity: Math.min(999, requested) });
  }
  writeTradeQuote(items);
}

/** One write per reviewed list; replacing matching offers avoids duplicated quantities on retry. */
export function replaceDraftTradeQuoteLines(
  lines: TradeQuoteLine[],
): { ok: true } | { ok: false; reason: "invalid-quantity" | "duplicate-offer" | "currency-conflict" } {
  if (
    lines.length === 0 ||
    lines.some(
      (line) =>
        !line.offerId ||
        !Number.isInteger(line.quantity) ||
        line.quantity < Math.max(1, line.moq) ||
        line.quantity > 999 ||
        !Number.isSafeInteger(line.basePriceMinor) ||
        line.basePriceMinor < 0,
    )
  ) {
    return { ok: false, reason: "invalid-quantity" };
  }
  const offerIds = lines.map((line) => line.offerId);
  if (new Set(offerIds).size !== offerIds.length) {
    return { ok: false, reason: "duplicate-offer" };
  }
  const currency = lines[0].currency.toUpperCase();
  const existing = readTradeQuote();
  if (
    lines.some((line) => line.currency.toUpperCase() !== currency) ||
    existing.some((line) => line.currency.toUpperCase() !== currency)
  ) {
    return { ok: false, reason: "currency-conflict" };
  }
  const byOffer = new Map(lines.map((line) => [line.offerId, line]));
  const next = existing
    .filter((line) => !byOffer.has(line.offerId))
    .concat([...byOffer.values()]);
  writeTradeQuote(next);
  return { ok: true };
}

export function setTradeQuoteQuantity(offerId: string, quantity: number): void {
  writeTradeQuote(
    readTradeQuote().map((line) =>
      line.offerId === offerId
        ? { ...line, quantity: Math.max(line.moq, Math.min(999, Math.trunc(quantity))) }
        : line,
    ),
  );
}

export function removeTradeQuoteLine(offerId: string): void {
  writeTradeQuote(readTradeQuote().filter((line) => line.offerId !== offerId));
}

export function clearTradeQuote(): void {
  writeTradeQuote([]);
}

export function saveSubmittedRfq(rfq: SubmittedRfq): void {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(RFQ_KEY);
    const existing = raw ? (JSON.parse(raw) as unknown) : [];
    const list = Array.isArray(existing) ? existing : [];
    window.localStorage.setItem(RFQ_KEY, JSON.stringify([rfq, ...list].slice(0, 20)));
  } catch {
    // A failed history write must not lose the submitted confirmation shown in this session.
  }
}

export function readLatestRfq(): SubmittedRfq | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(RFQ_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) && parsed.length > 0 ? (parsed[0] as SubmittedRfq) : null;
  } catch {
    return null;
  }
}

export function useTradeQuote(): {
  lines: TradeQuoteLine[];
  ready: boolean;
  count: number;
  quantityTotal: number;
  estimatedTotalMinor: number;
  currency: string;
  updateQuantity: (offerId: string, quantity: number) => void;
  remove: (offerId: string) => void;
  clear: () => void;
} {
  const [lines, setLines] = useState<TradeQuoteLine[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sync = () => setLines(readTradeQuote());
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
    setTradeQuoteQuantity(offerId, quantity);
  }, []);
  const remove = useCallback((offerId: string) => removeTradeQuoteLine(offerId), []);
  const clear = useCallback(() => clearTradeQuote(), []);

  return {
    lines,
    ready,
    count: lines.length,
    quantityTotal: lines.reduce((sum, line) => sum + line.quantity, 0),
    estimatedTotalMinor: lines.reduce((sum, line) => sum + lineTotal(line), 0),
    currency: lines[0]?.currency ?? "INR",
    updateQuantity,
    remove,
    clear,
  };
}
