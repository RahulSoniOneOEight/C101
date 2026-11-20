"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { formatMoney } from "@/lib/money";
import { useCart } from "@/lib/cart";
import { deliveryChangeEventName, readDeliveryAddress } from "@/lib/delivery";
import { readPromoCode, writePromoCode } from "@/lib/promo-code";
import type { CartQuote } from "@/lib/experience-api";
import { ProductImage } from "../components/product-image";

type State =
  | { status: "idle" }
  | { status: "busy" }
  | { status: "error"; message: string; signedOut?: boolean }
  | {
      status: "done";
      orderGroupId: string;
      orderNumber: string | null;
      orderType: string;
      totalMinor: number | null;
    };

type QuoteState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: CartQuote };

function CheckoutSteps({ current }: { current: 1 | 2 | 3 }) {
  const steps = ["Cart", "Details & payment", "Confirmation"] as const;
  return (
    <div className="checkout-steps" aria-label="Checkout progress">
      {steps.map((label, index) => {
        const step = (index + 1) as 1 | 2 | 3;
        const className =
          step === current
            ? "checkout-step current"
            : step < current
              ? "checkout-step done"
              : "checkout-step";
        return (
          <span className={className} key={label} aria-current={step === current ? "step" : undefined}>
            {step} · {label}
          </span>
        );
      })}
    </div>
  );
}

export function CheckoutForm({
  defaultEmail,
  signedIn,
}: {
  defaultEmail: string;
  signedIn: boolean;
}) {
  const { items, ready, subtotalMinor, currency, clear } = useCart();
  const idempotencyKeyRef = useRef("");
  const cartChannels = new Set(items.map((item) => item.channel ?? "b2c"));
  const cartChannel =
    cartChannels.size === 1 ? (Array.from(cartChannels)[0] as "b2c" | "b2b") : null;
  const [state, setState] = useState<State>({ status: "idle" });
  const [postalCode, setPostalCode] = useState("302001");
  const [city, setCity] = useState("Jaipur");
  const [quote, setQuote] = useState<QuoteState>({ status: "idle" });
  const [promoDraft, setPromoDraft] = useState("");
  const [appliedPromo, setAppliedPromo] = useState("");
  const [promoError, setPromoError] = useState("");
  const linesKey = items.map((item) => `${item.offerId}:${item.quantity}`).join("|");

  // The home delivery selector is the source of truth for this browser. It pre-fills the quote
  // postcode and the city field, while the customer still enters the street address.
  useEffect(() => {
    const sync = () => {
      const saved = readDeliveryAddress();
      setPostalCode(saved.pincode);
      setCity(saved.city);
    };
    sync();
    const event = deliveryChangeEventName();
    window.addEventListener(event, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(event, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  useEffect(() => {
    const saved = readPromoCode();
    if (saved) setAppliedPromo(saved);
  }, []);

  // Load an authoritative quote (subtotal, automatic discount, delivery, total) from the API.
  useEffect(() => {
    if (!ready || items.length === 0 || !cartChannel) return;
    // Keep the last valid quote while a six-digit postal code is being typed.
    if (!/^\d{6}$/.test(postalCode)) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setQuote({ status: "loading" });
      try {
        const response = await fetch("/api/cart/quote", {
          method: "POST",
          headers: { "content-type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            lines: items.map((item) => ({
              offerId: item.offerId,
              quantity: item.quantity,
              channel: item.channel ?? "b2c",
            })),
            postalCode,
            promoCode: appliedPromo || undefined,
            channel: cartChannel,
          }),
        });
        const data = (await response.json()) as CartQuote & { error?: string };
        if (!response.ok) {
          const failure = new Error(data.error ?? "Could not calculate the order total.") as Error & {
            status?: number;
          };
          failure.status = response.status;
          throw failure;
        }
        setQuote({ status: "ready", data });
      } catch (error) {
        if ((error as Error).name === "AbortError") return;
        const message = (error as Error).message;
        const status = (error as Error & { status?: number }).status;
        if (appliedPromo && status === 400) {
          // The server rejected the code and kept the existing offer. Surface the reason and
          // re-quote without the rejected code. A transport/service failure must not be blamed
          // on the code, so only a 400 rejection clears it.
          setPromoError(message);
          writePromoCode("");
          setAppliedPromo("");
          setQuote({ status: "loading" });
          return;
        }
        setQuote({ status: "error", message });
      }
    }, 450);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [items, linesKey, postalCode, ready, appliedPromo, cartChannel]);

  useEffect(() => {
    if (!cartChannel) setQuote({ status: "idle" });
  }, [cartChannel]);

  const quoted = quote.status === "ready" ? quote.data : null;
  const summarySubtotal = quoted?.subtotal ?? subtotalMinor;
  const summaryCurrency = quoted?.currency ?? currency;
  const autoPromotion =
    quoted?.autoOffer ??
    quoted?.promotions?.find((promotion) => promotion.isAutomatic) ??
    null;
  const selectedPromotion =
    quoted?.promotions?.find((promotion) => !promotion.isAutomatic) ?? null;
  const applyingPromo = quote.status === "loading" && Boolean(appliedPromo);

  function applyPromo(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const code = promoDraft.trim().toUpperCase();
    if (!code) return;
    setPromoError("");
    setAppliedPromo(code);
    writePromoCode(code);
    setPromoDraft("");
  }

  function clearPromo() {
    setPromoError("");
    setAppliedPromo("");
    writePromoCode("");
    setPromoDraft("");
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (items.length === 0) return;
    if (!cartChannel) {
      setState({
        status: "error",
        message:
          "Your cart mixes Shop and Trade items. Remove one channel before placing the order.",
      });
      return;
    }
    const form = new FormData(event.currentTarget);
    if (!signedIn && !idempotencyKeyRef.current) {
      idempotencyKeyRef.current = crypto.randomUUID();
    }
    setState({ status: "busy" });
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(!signedIn ? { "idempotency-key": idempotencyKeyRef.current } : {}),
        },
        body: JSON.stringify({
          lines: items.map((item) => ({
            offerId: item.offerId,
            quantity: item.quantity,
            channel: item.channel ?? "b2c",
          })),
          email: form.get("email"),
          mobile: signedIn ? undefined : form.get("mobile"),
          firstName: form.get("firstName"),
          lastName: form.get("lastName"),
          address1: form.get("address1"),
          city: form.get("city"),
          postalCode: form.get("postalCode"),
          promoCode: appliedPromo || undefined,
          channel: cartChannel,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        type?: string;
        order_group?: { id: string };
        order_number?: string | null;
        total_minor?: number | null;
        payment?: { payment_mode?: string; test_data?: boolean };
      };
      if (!res.ok) {
        setState({
          status: "error",
          message: data.error ?? `request failed (${res.status})`,
          signedOut: res.status === 401,
        });
        return;
      }
      // Success is the server's canonical simulated order group — never assumed client-side.
      if (
        data.type !== "order_group" ||
        !data.order_group?.id ||
        data.payment?.payment_mode !== "simulated" ||
        data.payment?.test_data !== true
      ) {
        setState({ status: "error", message: "Server did not return a canonical simulated order." });
        return;
      }
      clear();
      setState({
        status: "done",
        orderGroupId: data.order_group.id,
        orderNumber: data.order_number ?? null,
        orderType: data.type,
        totalMinor: data.total_minor ?? quoted?.total ?? null,
      });
    } catch (error) {
      setState({ status: "error", message: (error as Error).message });
    }
  }

  if (state.status === "done") {
    return (
      <>
        <CheckoutSteps current={3} />
        <div className="checkout-success">
          <span className="success-mark" aria-hidden="true">✓</span>
        <span className="eyebrow">Order confirmed</span>
        <h1>Thanks — your order is in.</h1>
        <p className="muted">
          {signedIn
            ? `The Experience API returned a canonical ${state.orderType.replaceAll(
                "_",
                " ",
              )} with a simulated payment. Your owner-scoped tracking is available in Orders.`
            : "Your guest order is confirmed with a simulated payment. No sign-in account or password was created. Keep this reference for support; the mobile you entered is recorded for delivery."}
        </p>
        <div className="order-reference">
          <span>Order reference</span>
          <code>{state.orderNumber ?? state.orderGroupId}</code>
        </div>
        <dl className="checkout-receipt">
          {state.totalMinor !== null ? (
            <div>
              <dt>Order total</dt>
              <dd>{formatMoney(state.totalMinor, summaryCurrency)}</dd>
            </div>
          ) : null}
          <div>
            <dt>Payment</dt>
            <dd>Simulated payment · test data</dd>
          </div>
          <div>
            <dt>Delivery</dt>
            <dd>Standard · 3–5 business days</dd>
          </div>
          <div>
            <dt>Invoice</dt>
            <dd>
              {signedIn
                ? "GST invoice available in your account"
                : "GST invoice will be issued for this order"}
            </dd>
          </div>
        </dl>
        <div className="buy-actions">
          {signedIn ? (
            <Link className="button button-lg" href="/orders">
              View my orders
            </Link>
          ) : (
            <Link
              className="button button-lg"
              href={`/sign-in?next=${encodeURIComponent("/orders")}`}
            >
              Sign in to track orders
            </Link>
          )}
          <Link className="button button-ghost button-lg" href="/search">
            Continue shopping
          </Link>
        </div>
        </div>
      </>
    );
  }

  if (!ready) {
    return <p className="muted">Loading your cart…</p>;
  }

  if (items.length === 0) {
    return (
      <div className="empty-panel">
        <h1>Your cart is empty</h1>
        <p className="muted">Add a product before starting checkout.</p>
        <Link className="button" href="/search">
          Browse the catalogue
        </Link>
      </div>
    );
  }

  if (!signedIn && cartChannel === "b2b") {
    return (
      <div className="empty-panel">
        <h1>Trade checkout needs a sign-in</h1>
        <p className="muted">
          Guest checkout is available for Shop orders. Sign in with a trade-enabled account to
          place this quotation order.
        </p>
        <Link
          className="button"
          href={`/sign-in?next=${encodeURIComponent("/checkout")}`}
        >
          Sign in to continue
        </Link>
      </div>
    );
  }

  return (
    <>
      <CheckoutSteps current={2} />
      {!cartChannel ? (
        <div className="notice err" role="alert">
          Your cart mixes Shop and Trade items. Remove one channel before checkout.{" "}
          <Link href="/cart">Review cart</Link>
        </div>
      ) : null}
      <div className="checkout-layout">
      <form className="checkout-form" onSubmit={onSubmit}>
        <div className="checkout-block">
          <span className="eyebrow">Contact</span>
          <h2>Where should we send the receipt?</h2>
          {!signedIn ? (
            <p className="muted">
              Guest checkout — no account needed. We will use this mobile for delivery updates.
            </p>
          ) : null}
          <label>
            Email
            <input
              name="email"
              type="email"
              required
              defaultValue={defaultEmail}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </label>
          {!signedIn ? (
            <label>
              Mobile number
              <input
                name="mobile"
                type="tel"
                required
                inputMode="tel"
                autoComplete="tel"
                placeholder="+91 98765 43210"
                maxLength={16}
              />
            </label>
          ) : null}
        </div>

        <div className="checkout-block">
          <span className="eyebrow">Delivery address</span>
          <h2>Where is this going?</h2>
          <div className="form-grid">
            <label>
              First name
              <input name="firstName" required autoComplete="given-name" placeholder="Pilot" />
            </label>
            <label>
              Last name
              <input name="lastName" autoComplete="family-name" placeholder="Buyer" />
            </label>
            <label className="form-span">
              Address
              <input
                name="address1"
                required
                autoComplete="address-line1"
                placeholder="101 Test Yard"
              />
            </label>
            <label>
              City
              <input
                name="city"
                required
                autoComplete="address-level2"
                placeholder="Jaipur"
                value={city}
                onChange={(event) => setCity(event.target.value)}
              />
            </label>
            <label>
              Postal code
              <input
                name="postalCode"
                required
                inputMode="numeric"
                pattern="\d{6}"
                autoComplete="postal-code"
                placeholder="302001"
                value={postalCode}
                onChange={(event) =>
                  setPostalCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                }
              />
            </label>
          </div>
        </div>

        <div className="checkout-block">
          <span className="eyebrow">Offers &amp; promo codes</span>
          <h2>Save on this order</h2>
          <div className="promo-status">
            {selectedPromotion ? (
              <span className="promo-chip">
                <span>Applied code</span>
                <strong>{selectedPromotion.label}</strong>
                <small>{selectedPromotion.code}</small>
              </span>
            ) : autoPromotion ? (
              <span className="promo-chip auto">
                <span>Auto applied</span>
                <strong>{autoPromotion.label}</strong>
                <small>{autoPromotion.code}</small>
              </span>
            ) : (
              <span className="muted">No offer applied yet.</span>
            )}
          </div>
          <div className="promo-form">
            <label className="sr-only" htmlFor="promo-code">
              Promo code
            </label>
            <input
              id="promo-code"
              value={promoDraft}
              onChange={(event) => setPromoDraft(event.target.value.toUpperCase())}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  applyPromo();
                }
              }}
              placeholder="Enter promo code"
              autoComplete="off"
              maxLength={40}
            />
            <button
              className="button"
              type="button"
              disabled={applyingPromo || !promoDraft.trim()}
              onClick={() => applyPromo()}
            >
              {applyingPromo ? "Checking…" : "Apply"}
            </button>
          </div>
          {appliedPromo ? (
            <p className="promo-applied">
              {applyingPromo ? `Checking ${appliedPromo}…` : `Code ${appliedPromo} applied.`}{" "}
              <button type="button" className="text-button" onClick={clearPromo}>
                Use automatic offer
              </button>
            </p>
          ) : null}
          {promoError ? (
            <p className="promo-error" role="alert">
              {promoError}
            </p>
          ) : null}
          <p className="field-hint">
            The store applies the best automatic offer by default. Applying a code replaces it;
            only one offer applies at a time.
          </p>
        </div>

        <div className="checkout-block">
          <span className="eyebrow">Payment</span>
          <h2>Simulated prepaid payment</h2>
          <p className="muted">
            This staging pilot records a simulated payment only. No card is charged and no money
            moves.
          </p>
          <div className="payment-choice">
            <span className="payment-radio" aria-hidden="true">●</span>
            <div>
              <strong>Simulated prepaid</strong>
              <p>Server-verified test payment · no production effect</p>
            </div>
            <span className="status-pill">Selected</span>
          </div>
        </div>

        {state.status === "error" ? (
          <div className="notice err" role="alert">
            Checkout failed: {state.message}{" "}
            {state.signedOut ? <Link href="/sign-in?next=%2Fcheckout">Sign in again</Link> : null}
          </div>
        ) : null}

        <button
          className="button button-lg button-block"
          type="submit"
          disabled={state.status === "busy" || !cartChannel}
        >
          {state.status === "busy"
            ? "Placing your order…"
            : quoted
              ? `Place order · ${formatMoney(quoted.total, summaryCurrency)}`
              : "Place order"}
        </button>
        <p className="field-hint checkout-terms">
          By placing the order you confirm this is a staging test. Prices are composed by the
          shared Experience API and re-checked server-side.
        </p>
      </form>

      <aside className="checkout-summary">
        <h2>Order summary</h2>
        <div className="checkout-lines">
          {items.map((item) => (
            <div className="checkout-line" key={item.offerId}>
              <div className="checkout-line-media">
                <ProductImage src={item.image} alt={item.title} />
                <span className="checkout-qty">{item.quantity}</span>
              </div>
              <div>
                <strong>{item.title}</strong>
                <p className="muted">
                  {item.seller}
                  {item.sku ? ` · ${item.sku}` : ""}
                </p>
              </div>
              <span className="checkout-line-total">
                {formatMoney(item.priceMinor * item.quantity, item.currency)}
              </span>
            </div>
          ))}
        </div>
        <dl className="cart-summary-list">
          <div>
            <dt>Subtotal</dt>
            <dd>{formatMoney(summarySubtotal, summaryCurrency)}</dd>
          </div>
          {quoted && quoted.discount > 0 ? (
            <div className="discount-row">
              <dt>{selectedPromotion ? `Promo ${selectedPromotion.code}` : "Automatic offer"}</dt>
              <dd>− {formatMoney(quoted.discount, summaryCurrency)}</dd>
            </div>
          ) : null}
          <div>
            <dt>Standard delivery</dt>
            <dd>
              {quoted
                ? quoted.shipping === 0
                  ? "Free"
                  : formatMoney(quoted.shipping, summaryCurrency)
                : quote.status === "error"
                  ? "At confirmation"
                  : "Calculating…"}
            </dd>
          </div>
          <div className="total-row">
            <dt>Total</dt>
            <dd>
              {quoted
                ? formatMoney(quoted.total, summaryCurrency)
                : formatMoney(summarySubtotal, summaryCurrency)}
            </dd>
          </div>
        </dl>
        {quote.status === "loading" ? (
          <p className="field-hint">Recalculating delivery for {postalCode || "your address"}…</p>
        ) : null}
        {quote.status === "error" ? (
          <p className="field-hint">
            Delivery and discounts will be confirmed when you place the order.
          </p>
        ) : null}
        <Link className="text-button" href="/cart">
          ← Edit cart
        </Link>
      </aside>
      </div>
    </>
  );
}
