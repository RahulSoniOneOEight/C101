"use client";

import Link from "next/link";
import { useState } from "react";
import { addToCart } from "@/lib/cart";
import { formatMoney } from "@/lib/money";
import {
  addToTradeQuote,
  tierUnitPrice,
  type TradeQuoteLine,
} from "@/lib/trade-quote";

export function AddToQuote({ line }: { line: Omit<TradeQuoteLine, "quantity"> }) {
  const [quantity, setQuantity] = useState(line.moq);
  const [added, setAdded] = useState(false);
  const [cartAdded, setCartAdded] = useState(false);
  const unit = tierUnitPrice({ ...line, quantity }, quantity);

  return (
    <div className="add-to-quote">
      <div className="quote-price-line">
        <span>
          {formatMoney(unit, line.currency)} <small>/ unit</small>
        </span>
        <span className="quote-line-total">{formatMoney(unit * quantity, line.currency)}</span>
      </div>
      <div className="quote-controls">
        <div className="quantity-stepper quantity-stepper-sm">
          <button
            type="button"
            aria-label="Decrease quantity"
            onClick={() => setQuantity((value) => Math.max(line.moq, value - 1))}
            disabled={quantity <= line.moq}
          >
            −
          </button>
          <input
            aria-label={`Quantity for ${line.title}`}
            inputMode="numeric"
            value={quantity}
            onChange={(event) => {
              const parsed = Number(event.target.value.replace(/\D/g, ""));
              setQuantity(
                Number.isFinite(parsed) && parsed > 0
                  ? Math.max(line.moq, Math.min(999, parsed))
                  : line.moq,
              );
            }}
          />
          <button
            type="button"
            aria-label="Increase quantity"
            onClick={() => setQuantity((value) => Math.min(999, value + 1))}
          >
            +
          </button>
        </div>
        <span className="moq-note">MOQ {line.moq}</span>
      </div>
      <div className="trade-action-row">
        <button
          className="button button-ghost"
          type="button"
          onClick={() => {
            addToCart(
              {
                productId: line.productId,
                offerId: line.offerId,
                sku: line.sku,
                title: line.title,
                seller: line.seller,
                priceMinor: unit,
                currency: line.currency,
                image: line.image ?? null,
                channel: "b2b" as const,
              },
              quantity,
            );
            setCartAdded(true);
          }}
        >
          Add to cart
        </button>
        <button
          className="button"
          type="button"
          onClick={() => {
            addToTradeQuote(line, quantity);
            setAdded(true);
          }}
        >
          Add to quote
        </button>
      </div>
      {cartAdded ? (
        <p className="quote-added" role="status">
          Added to cart. <Link href="/cart">View cart →</Link>
        </p>
      ) : null}
      {added ? (
        <p className="quote-added" role="status">
          Added to quotation cart. <Link href="/trade/quote">Review quote →</Link>
        </p>
      ) : null}
    </div>
  );
}
