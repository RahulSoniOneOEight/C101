"use client";

import Link from "next/link";
import { useState } from "react";
import { formatMoney } from "@/lib/money";
import { useCart } from "@/lib/cart";
import { ProductImage } from "../components/product-image";

type State =
  | { status: "idle" }
  | { status: "busy" }
  | { status: "error"; message: string; signedOut?: boolean }
  | { status: "done"; orderGroupId: string; orderType: string };

export function CheckoutForm({ defaultEmail }: { defaultEmail: string }) {
  const { items, ready, subtotalMinor, currency, clear } = useCart();
  const [state, setState] = useState<State>({ status: "idle" });

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (items.length === 0) return;
    const form = new FormData(event.currentTarget);
    setState({ status: "busy" });
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          lines: items.map((item) => ({ offerId: item.offerId, quantity: item.quantity })),
          email: form.get("email"),
          firstName: form.get("firstName"),
          lastName: form.get("lastName"),
          address1: form.get("address1"),
          city: form.get("city"),
          postalCode: form.get("postalCode"),
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        type?: string;
        order_group?: { id: string };
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
        orderType: data.type,
      });
    } catch (error) {
      setState({ status: "error", message: (error as Error).message });
    }
  }

  if (state.status === "done") {
    return (
      <div className="checkout-success">
        <span className="success-mark" aria-hidden="true">✓</span>
        <span className="eyebrow">Order confirmed</span>
        <h1>Thanks — your order is in.</h1>
        <p className="muted">
          The Experience API returned a canonical {state.orderType.replaceAll("_", " ")} with a
          simulated payment. Your owner-scoped tracking is available in Orders.
        </p>
        <div className="order-reference">
          <span>Order reference</span>
          <code>{state.orderGroupId}</code>
        </div>
        <dl className="checkout-receipt">
          <div>
            <dt>Payment</dt>
            <dd>Simulated prepaid · test data</dd>
          </div>
          <div>
            <dt>Delivery</dt>
            <dd>Standard · 1–3 business days</dd>
          </div>
          <div>
            <dt>Invoice</dt>
            <dd>GST invoice available in your account</dd>
          </div>
        </dl>
        <div className="buy-actions">
          <Link className="button button-lg" href="/orders">
            View my orders
          </Link>
          <Link className="button button-ghost button-lg" href="/search">
            Continue shopping
          </Link>
        </div>
      </div>
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

  return (
    <div className="checkout-layout">
      <form className="checkout-form" onSubmit={onSubmit}>
        <div className="checkout-block">
          <span className="eyebrow">Contact</span>
          <h2>Where should we send the receipt?</h2>
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
              <input name="city" required autoComplete="address-level2" placeholder="Jaipur" />
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
              />
            </label>
          </div>
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

        <button className="button button-lg button-block" type="submit" disabled={state.status === "busy"}>
          {state.status === "busy"
            ? "Placing your order…"
            : `Place order · ${formatMoney(subtotalMinor, currency)}`}
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
            <dd>{formatMoney(subtotalMinor, currency)}</dd>
          </div>
          <div>
            <dt>Delivery</dt>
            <dd>Standard · included</dd>
          </div>
          <div className="total-row">
            <dt>Total</dt>
            <dd>{formatMoney(subtotalMinor, currency)}</dd>
          </div>
        </dl>
        <Link className="text-button" href="/cart">
          ← Edit cart
        </Link>
      </aside>
    </div>
  );
}
