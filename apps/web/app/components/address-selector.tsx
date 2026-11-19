"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_DELIVERY,
  DELIVERY_SUGGESTIONS,
  deliveryChangeEventName,
  deliveryLabel,
  readDeliveryAddress,
  writeDeliveryAddress,
  type DeliveryAddress,
} from "@/lib/delivery";

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" width="18" height="18">
      <path
        d="M12 21s7-6.1 7-12a7 7 0 1 0-14 0c0 5.9 7 12 7 12Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="9" r="2.4" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" width="15" height="15">
      <path d="m8 10 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function AddressSelector({ locale = "en-IN" }: { locale?: "en-IN" | "hi-IN" }) {
  const hindi = locale === "hi-IN";
  const [address, setAddress] = useState<DeliveryAddress>(DEFAULT_DELIVERY);
  const [open, setOpen] = useState(false);
  const [pincode, setPincode] = useState(DEFAULT_DELIVERY.pincode);
  const [city, setCity] = useState(DEFAULT_DELIVERY.city);
  const [state, setState] = useState(DEFAULT_DELIVERY.state);
  const [error, setError] = useState("");

  useEffect(() => {
    const sync = () => {
      const saved = readDeliveryAddress();
      setAddress(saved);
      setPincode(saved.pincode);
      setCity(saved.city);
      setState(saved.state);
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
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const apply = (next: DeliveryAddress) => {
    writeDeliveryAddress(next);
    setAddress(next);
    setOpen(false);
    setError("");
  };

  const save = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!/^\d{6}$/.test(pincode)) {
      setError(hindi ? "6 अंकों का पिनकोड डालें।" : "Enter a six-digit pincode.");
      return;
    }
    if (!city.trim()) {
      setError(hindi ? "शहर डालें।" : "Enter a city.");
      return;
    }
    const next: DeliveryAddress = {
      pincode,
      city: city.trim(),
      state: state.trim(),
      label: "",
    };
    apply({ ...next, label: deliveryLabel(next) });
  };

  return (
    <>
      <button
        type="button"
        className="delivery-selector"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        data-testid="address-selector"
      >
        <span className="delivery-selector-icon" aria-hidden="true">
          <PinIcon />
        </span>
        <span className="delivery-selector-copy">
          <small>{hindi ? "यहाँ डिलीवरी" : "Deliver to"}</small>
          <strong>{address.label}</strong>
        </span>
        <span className="delivery-selector-chevron" aria-hidden="true">
          <ChevronIcon />
        </span>
      </button>

      {open ? (
        <div className="address-modal-scrim" role="presentation" onClick={() => setOpen(false)}>
          <section
            className="address-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="address-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="address-modal-head">
              <div>
                <span className="eyebrow">{hindi ? "डिलीवरी स्थान" : "Delivery location"}</span>
                <h2 id="address-modal-title">
                  {hindi ? "कहाँ डिलीवरी करें?" : "Where should we deliver?"}
                </h2>
              </div>
              <button
                type="button"
                className="address-modal-close"
                aria-label={hindi ? "बंद करें" : "Close"}
                onClick={() => setOpen(false)}
              >
                ✕
              </button>
            </header>

            <p className="muted address-modal-lede">
              {hindi
                ? "पिनकोड से डिलीवरी उपलब्धता और चेकआउट का पता सेट होता है।"
                : "Your pincode sets delivery availability and pre-fills checkout for this browser."}
            </p>

            <form className="address-form" onSubmit={save}>
              <label>
                {hindi ? "पिनकोड" : "Pincode"}
                <input
                  name="pincode"
                  inputMode="numeric"
                  autoComplete="postal-code"
                  maxLength={6}
                  value={pincode}
                  onChange={(event) => setPincode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="301019"
                  required
                />
              </label>
              <label>
                {hindi ? "शहर" : "City"}
                <input
                  name="city"
                  autoComplete="address-level2"
                  value={city}
                  onChange={(event) => setCity(event.target.value)}
                  placeholder="Bhiwadi"
                  required
                />
              </label>
              <label>
                {hindi ? "राज्य" : "State"}
                <input
                  name="state"
                  autoComplete="address-level1"
                  value={state}
                  onChange={(event) => setState(event.target.value)}
                  placeholder="Rajasthan"
                />
              </label>
              {error ? (
                <p className="address-error" role="alert">
                  {error}
                </p>
              ) : null}
              <button className="button button-block" type="submit">
                {hindi ? "इस पते पर डिलीवर करें" : "Deliver to this address"}
              </button>
            </form>

            <div className="address-suggestions">
              <span>{hindi ? "लोकप्रिय शहर" : "Popular cities"}</span>
              <div>
                {DELIVERY_SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion.pincode}
                    type="button"
                    onClick={() => apply(suggestion)}
                    className={suggestion.pincode === address.pincode ? "active" : ""}
                  >
                    {suggestion.city} · {suggestion.pincode}
                  </button>
                ))}
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
