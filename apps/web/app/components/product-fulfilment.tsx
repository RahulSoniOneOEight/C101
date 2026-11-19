"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_DELIVERY,
  deliveryChangeEventName,
  readDeliveryAddress,
  type DeliveryAddress,
} from "@/lib/delivery";

type Mode = "delivery" | "pickup";
type PromiseState =
  | { status: "loading" }
  | { status: "ready"; serviceable: boolean; etaDays: number }
  | { status: "error" };

export function ProductFulfilment() {
  const [address, setAddress] = useState<DeliveryAddress>(DEFAULT_DELIVERY);
  const [mode, setMode] = useState<Mode>("delivery");
  const [promise, setPromise] = useState<PromiseState>({ status: "loading" });

  useEffect(() => {
    const sync = () => setAddress(readDeliveryAddress());
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
    if (mode !== "delivery") return;
    const controller = new AbortController();
    setPromise({ status: "loading" });
    fetch(`/api/serviceability?postcode=${encodeURIComponent(address.pincode)}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        const data = (await response.json()) as {
          serviceable?: boolean;
          eta_days?: number;
          error?: string;
        };
        if (!response.ok) throw new Error(data.error ?? "Delivery could not be checked.");
        setPromise({
          status: "ready",
          serviceable: data.serviceable === true,
          etaDays: Number(data.eta_days) || 0,
        });
      })
      .catch((error) => {
        if ((error as Error).name === "AbortError") return;
        setPromise({ status: "error" });
      });
    return () => controller.abort();
  }, [address.pincode, mode]);

  return (
    <div className="fulfilment-card">
      <div className="fulfilment-tabs" role="tablist" aria-label="Fulfilment method">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "delivery"}
          className={mode === "delivery" ? "fulfilment-tab active" : "fulfilment-tab"}
          onClick={() => setMode("delivery")}
        >
          Delivery
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "pickup"}
          className={mode === "pickup" ? "fulfilment-tab active" : "fulfilment-tab"}
          onClick={() => setMode("pickup")}
        >
          Pickup
        </button>
      </div>

      {mode === "delivery" ? (
        <div className="fulfilment-body">
          <div>
            <span className="eyebrow">Deliver to</span>
            <strong>
              {address.city}
              {address.pincode ? ` ${address.pincode}` : ""}
            </strong>
            <p className="fulfilment-note">
              {promise.status === "loading"
                ? "Checking delivery…"
                : promise.status === "error"
                  ? "Delivery check unavailable. Confirm at checkout."
                  : promise.serviceable
                    ? `Estimated in ${promise.etaDays} days · simulated staging promise`
                    : "Delivery is not available for this pincode."}
            </p>
          </div>
          <button
            type="button"
            className="text-button"
            onClick={() => window.dispatchEvent(new Event("bazarbee:open-address"))}
          >
            Change
          </button>
        </div>
      ) : (
        <div className="fulfilment-body">
          <div>
            <span className="eyebrow">Pickup point</span>
            <strong>BazarBee staging collection desk</strong>
            <p className="fulfilment-note">
              Bhiwadi, Rajasthan 301019 · Mon–Sat, 9:00–18:00. Pickup ordering is gated in staging.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
