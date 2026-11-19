"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import {
  DEFAULT_DELIVERY,
  DELIVERY_SUGGESTIONS,
  deliveryChangeEventName,
  deliveryLabel,
  lookupPincode,
  readDeliveryAddress,
  writeDeliveryAddress,
  type DeliveryAddress,
} from "@/lib/delivery";

function PinIcon({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" width={size} height={size}>
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

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" width="14" height="14">
      <path d="m5 12.5 4.2 4.2L19 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
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
  const [pulse, setPulse] = useState(false);
  const pulseTimer = useRef<number | null>(null);
  const mounted = useRef(false);

  useEffect(() => {
    const sync = () => {
      const saved = readDeliveryAddress();
      setAddress(saved);
      if (!open) {
        setPincode(saved.pincode);
        setCity(saved.city);
        setState(saved.state);
      }
    };
    sync();
    const event = deliveryChangeEventName();
    window.addEventListener(event, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(event, sync);
      window.removeEventListener("storage", sync);
    };
  }, [open]);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    setPulse(true);
    if (pulseTimer.current !== null) window.clearTimeout(pulseTimer.current);
    pulseTimer.current = window.setTimeout(() => setPulse(false), 700);
    return () => {
      if (pulseTimer.current !== null) window.clearTimeout(pulseTimer.current);
    };
  }, [address.label]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const openSelector = () => {
    setPincode(address.pincode);
    setCity(address.city);
    setState(address.state);
    setError("");
    setOpen(true);
  };

  const apply = (next: DeliveryAddress) => {
    writeDeliveryAddress(next);
    setAddress(next);
    setOpen(false);
    setError("");
  };

  const onPincode = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 6);
    setPincode(digits);
    setError("");
    const match = lookupPincode(digits);
    if (match) {
      setCity(match.city);
      setState(match.state);
    }
  };

  const save = (event: FormEvent<HTMLFormElement>) => {
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

  const matched = lookupPincode(pincode);
  const suggestionActive = (suggestion: DeliveryAddress) =>
    suggestion.pincode === address.pincode && suggestion.city === address.city;

  return (
    <>
      <button
        type="button"
        className={`delivery-selector header-delivery${pulse ? " is-updated" : ""}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${hindi ? "डिलीवरी स्थान" : "Delivery location"}: ${address.label}`}
        onClick={openSelector}
        data-testid="address-selector"
      >
        <span className="delivery-selector-icon" aria-hidden="true">
          <PinIcon />
        </span>
        <span className="delivery-selector-copy">
          <small>{hindi ? "यहाँ डिलीवरी" : "Deliver to"}</small>
          <strong>
            <span className="delivery-city">{address.city}</span>
            <span className="delivery-pin">{address.pincode}</span>
          </strong>
        </span>
        <span className="delivery-selector-chevron" aria-hidden="true">
          <ChevronIcon />
        </span>
      </button>

      {open
        ? createPortal(
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

            <div className="address-current" aria-live="polite">
              <span className="address-current-icon" aria-hidden="true">
                <PinIcon size={16} />
              </span>
              <div>
                <small>{hindi ? "अभी डिलीवरी" : "Delivering to"}</small>
                <strong>{address.label}</strong>
              </div>
              <span className="address-current-check" aria-hidden="true">
                <CheckIcon />
              </span>
            </div>

            <form className="address-form" onSubmit={save}>
              <label className="address-pincode">
                {hindi ? "पिनकोड" : "Pincode"}
                <input
                  name="pincode"
                  inputMode="numeric"
                  autoComplete="postal-code"
                  maxLength={6}
                  value={pincode}
                  onChange={(event) => onPincode(event.target.value)}
                  placeholder="301019"
                  required
                />
                {matched ? (
                  <span className="address-match">
                    {matched.city}, {matched.state}
                  </span>
                ) : null}
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
                    className={suggestionActive(suggestion) ? "active" : ""}
                  >
                    {suggestion.city}
                    <small>{suggestion.pincode}</small>
                  </button>
                ))}
              </div>
            </div>

            <p className="address-footnote">
              {hindi
                ? "इस ब्राउज़र के लिए सहेजा गया · चेकआउट में इस्तेमाल होता है"
                : "Saved for this browser · used to pre-fill checkout"}
            </p>
              </section>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
