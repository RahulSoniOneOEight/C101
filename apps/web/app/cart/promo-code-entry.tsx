"use client";

import { useEffect, useState } from "react";
import { readPromoCode, writePromoCode } from "@/lib/promo-code";

export function PromoCodeEntry() {
  const [saved, setSaved] = useState("");
  const [draft, setDraft] = useState("");

  useEffect(() => {
    setSaved(readPromoCode());
  }, []);

  const apply = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const code = draft.trim().toUpperCase();
    if (!code) return;
    writePromoCode(code);
    setSaved(code);
    setDraft("");
  };

  return (
    <section className="cart-promo" aria-labelledby="cart-promo-title">
      <div className="cart-promo-head">
        <div>
          <span className="eyebrow">Offers &amp; promo codes</span>
          <h2 id="cart-promo-title">Save on this order</h2>
        </div>
        <span className="promo-chip auto compact">
          <span>At checkout</span>
          <strong>Automatic offers</strong>
        </span>
      </div>
      <p className="muted">
        The store applies the best automatic offer at checkout. Have a code? Save it here and it will
        be checked when you continue.
      </p>
      <form className="promo-form" onSubmit={apply}>
        <label className="sr-only" htmlFor="cart-promo-code">
          Promo code
        </label>
        <input
          id="cart-promo-code"
          value={draft}
          onChange={(event) => setDraft(event.target.value.toUpperCase())}
          placeholder="Enter promo code"
          autoComplete="off"
          maxLength={40}
        />
        <button className="button" type="submit" disabled={!draft.trim()}>
          Save code
        </button>
      </form>
      {saved ? (
        <p className="promo-applied">
          Code {saved} saved.{" "}
          <button
            type="button"
            className="text-button"
            onClick={() => {
              writePromoCode("");
              setSaved("");
            }}
          >
            Remove
          </button>
        </p>
      ) : null}
    </section>
  );
}
