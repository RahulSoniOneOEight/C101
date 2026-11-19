"use client";

import Link from "next/link";
import { useTradeQuote } from "@/lib/trade-quote";

export function TradeQuoteLink() {
  const { count, ready, currency, estimatedTotalMinor } = useTradeQuote();
  return (
    <Link className="trade-quote-link" href="/trade/quote">
      <span>Quotation cart</span>
      <strong>
        {ready && count > 0
          ? `${count} line${count === 1 ? "" : "s"} · ${estimatedTotalMinor > 0 ? new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(estimatedTotalMinor / 100) : "—"}`
          : "Empty"}
      </strong>
    </Link>
  );
}
