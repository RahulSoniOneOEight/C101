"use client";

import { useState } from "react";
import type { ComposedProduct } from "@/lib/experience-api";
import { addToCart } from "@/lib/cart";
import { formatMoney } from "@/lib/money";
import {
  addToTradeQuote,
  removeTradeQuoteLine,
  setTradeQuoteQuantity,
  useTradeQuote,
} from "@/lib/trade-quote";

export function TradePricingPanel({ product }: { product: ComposedProduct }) {
  const { lines } = useTradeQuote();
  const [tierIndex, setTierIndex] = useState(0);
  const offer = product.best_price;
  if (!offer) {
    return <div className="notice err">No active trade terms for this product.</div>;
  }

  const tiers = offer.b2b_tiers ?? [];
  const moq = Math.max(1, offer.b2b_moq ?? 1);
  const line = lines.find((candidate) => candidate.offerId === offer.id);
  const quantity = line?.quantity ?? 0;
  const boundedTierIndex = tiers.length === 0 ? 0 : Math.min(tierIndex, tiers.length - 1);
  const selectedTier = tiers[boundedTierIndex];
  const tierQuantity = selectedTier?.min_quantity ?? moq;
  const priceQuantity = quantity > 0 ? quantity : tierQuantity;
  const applicableTier = [...tiers]
    .filter((tier) => priceQuantity >= tier.min_quantity)
    .sort((left, right) => right.min_quantity - left.min_quantity)[0];
  const unitPrice = applicableTier?.amount ?? offer.unit_amount_minor;
  const listPrice = offer.list_amount_minor;

  const quoteLine = {
    productId: product.id,
    offerId: offer.id,
    sku: offer.sku,
    title: product.title,
    seller: offer.seller_name ?? "",
    image: product.thumbnail ?? null,
    moq,
    basePriceMinor: offer.unit_amount_minor,
    currency: offer.currency_code,
    tiers,
  };
  const cartQuantity = quantity > 0 ? quantity : tierQuantity;
  const cartItem = {
    productId: product.id,
    offerId: offer.id,
    sku: offer.sku,
    title: product.title,
    seller: offer.seller_name ?? "",
    priceMinor: unitPrice,
    currency: offer.currency_code,
    image: product.thumbnail ?? null,
  };

  const selectTier = (index: number) => {
    setTierIndex(index);
    const next = tiers[index];
    if (quantity > 0 && next) {
      setTradeQuoteQuantity(offer.id, Math.max(moq, next.min_quantity));
    }
  };

  const updateQuantity = (next: number) => {
    if (!Number.isFinite(next) || next < moq) {
      removeTradeQuoteLine(offer.id);
      return;
    }
    setTradeQuoteQuantity(offer.id, Math.min(999, next));
  };

  return (
    <div className="trade-pricing-panel">
      <div className="trade-pricing-head">
        <span className="eyebrow">Trade pricing</span>
        <span className="trade-moq">MOQ {moq}</span>
      </div>

      <div className="trade-pricing-price">
        <strong>{formatMoney(unitPrice, offer.currency_code)}</strong>
        <span>/ pc</span>
        {listPrice && listPrice > unitPrice ? (
          <s>{formatMoney(listPrice, offer.currency_code)}</s>
        ) : null}
      </div>

      <p className="muted">
        {offer.seller_name ?? "Trade seller"} · SKU {offer.sku}
      </p>

      {tiers.length > 0 ? (
        <div className="trade-tier-chips" role="group" aria-label="Quantity tier">
          {tiers.map((tier, index) => (
            <button
              key={`${tier.min_quantity}-${tier.max_quantity ?? "up"}`}
              type="button"
              className={index === boundedTierIndex ? "trade-tier-chip active" : "trade-tier-chip"}
              aria-pressed={index === boundedTierIndex}
              onClick={() => selectTier(index)}
            >
              {tier.min_quantity}
              {tier.max_quantity === null ? "+" : `–${tier.max_quantity}`}
            </button>
          ))}
        </div>
      ) : (
        <p className="tier-single">Single trade rate · MOQ {moq}</p>
      )}

      <div className="trade-pricing-actions">
        {quantity > 0 ? (
          <div className="quantity-stepper quantity-stepper-sm">
            <button
              type="button"
              aria-label="Decrease quote quantity"
              onClick={() => updateQuantity(quantity - 1)}
            >
              −
            </button>
            <input
              aria-label={`Quote quantity for ${product.title}`}
              inputMode="numeric"
              value={quantity}
              onChange={(event) => {
                const parsed = Number(event.target.value.replace(/\D/g, ""));
                updateQuantity(Number.isFinite(parsed) ? parsed : moq);
              }}
            />
            <button
              type="button"
              aria-label="Increase quote quantity"
              onClick={() => updateQuantity(quantity + 1)}
            >
              +
            </button>
          </div>
        ) : (
          <button
            className="button button-lg"
            type="button"
            onClick={() => addToTradeQuote(quoteLine, tierQuantity)}
          >
            Add to quote
          </button>
        )}
        <button
          className="button button-ghost"
          type="button"
          onClick={() => addToCart(cartItem, cartQuantity)}
        >
          Add to cart
        </button>
      </div>

      <p className="field-hint">
        Quantity tiers apply automatically in the quotation cart. GST invoice and trade terms are
        confirmed on the RFQ.
      </p>
    </div>
  );
}
