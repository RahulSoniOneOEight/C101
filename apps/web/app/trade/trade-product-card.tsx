"use client";

import Link from "next/link";
import { useState } from "react";
import type { ComposedProduct } from "@/lib/experience-api";
import { addToCart } from "@/lib/cart";
import { deliveryPromise } from "@/lib/delivery-promise";
import { formatMoney } from "@/lib/money";
import { productDeliveryNote, productStockNote } from "@/lib/storefront";
import {
  addToTradeQuote,
  removeTradeQuoteLine,
  setTradeQuoteQuantity,
  useTradeQuote,
} from "@/lib/trade-quote";
import { ProductImage } from "../components/product-image";

/**
 * One shared B2B product tile, used by the trade home, catalogue, quick order and related rails.
 * It carries the elements the Flutter trade tile carries: MOQ, selectable quantity tiers, the
 * tier-adjusted unit price, savings, stock state and an add-to-quote action that turns into a
 * quantity stepper once the line is in the quotation cart.
 */
export function TradeProductCard({
  product,
  variant = "grid",
}: {
  product: ComposedProduct;
  variant?: "grid" | "compact" | "rail";
}) {
  const { lines } = useTradeQuote();
  const [tierIndex, setTierIndex] = useState(0);
  const offer = product.best_price;
  if (!offer) return null;

  const line = lines.find((candidate) => candidate.offerId === offer.id);
  const quantity = line?.quantity ?? 0;
  const tiers = offer.b2b_tiers ?? [];
  const moq = Math.max(1, offer.b2b_moq ?? 1);
  const boundedTierIndex = tiers.length === 0 ? 0 : Math.min(tierIndex, tiers.length - 1);
  const selectedTier = tiers[boundedTierIndex];
  const tierQuantity = selectedTier?.min_quantity ?? moq;
  const priceQuantity = quantity > 0 ? quantity : tierQuantity;
  const applicableTier = [...tiers]
    .filter((tier) => priceQuantity >= tier.min_quantity)
    .sort((left, right) => right.min_quantity - left.min_quantity)[0];
  const unitPrice = applicableTier?.amount ?? offer.unit_amount_minor;
  const listPrice = offer.list_amount_minor;
  const savings =
    listPrice && listPrice > unitPrice
      ? Math.round((1 - unitPrice / listPrice) * 100)
      : (offer.discount_percent ?? 0);
  const outOfStock = offer.in_stock === false;
  const stockLabel = outOfStock ? "Out of stock" : (productStockNote(offer) ?? "In stock");
  const deliveryLabel =
    productDeliveryNote(product) ?? `Standard delivery · ${deliveryPromise(product).label}`;
  const href = `/trade/pdp/${encodeURIComponent(product.id)}`;
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
    channel: "b2b" as const,
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
    <article className={`trade-product trade-product-card trade-product-${variant}`}>
      <Link href={href} className="trade-product-media">
        <ProductImage src={product.thumbnail} alt={product.title} />
        {savings > 0 ? <span className="deal-badge">{savings}% off</span> : null}
        <span className={outOfStock ? "stock-flag stock-flag-out" : "stock-flag stock-flag-in"}>
          {outOfStock ? "Out of stock" : "In stock"}
        </span>
      </Link>

      <div className="trade-product-body">
        <div className="trade-card-meta">
          <span className="trade-seller">{offer.seller_name ?? "Trade seller"}</span>
          <span className="trade-card-moq">MOQ {moq}</span>
        </div>
        <Link href={href} className="trade-card-title">
          {product.title}
        </Link>
        <p className="trade-card-sub">
          SKU {offer.sku} · {stockLabel}
        </p>
        <p className="trade-card-delivery">{deliveryLabel}</p>

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

        <div className="trade-card-price">
          <strong>{formatMoney(unitPrice, offer.currency_code)}</strong>
          <span>/ pc</span>
          {listPrice && listPrice > unitPrice ? (
            <s>{formatMoney(listPrice, offer.currency_code)}</s>
          ) : null}
        </div>

        <div className="trade-card-actions">
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
              className="button"
              type="button"
              disabled={outOfStock}
              onClick={() => addToTradeQuote(quoteLine, tierQuantity)}
            >
              {outOfStock ? "Unavailable" : "Add to quote"}
            </button>
          )}
          <button
            className="button button-ghost trade-card-cart"
            type="button"
            disabled={outOfStock}
            onClick={() => addToCart(cartItem, cartQuantity)}
          >
            Add to cart
          </button>
        </div>
      </div>
    </article>
  );
}
