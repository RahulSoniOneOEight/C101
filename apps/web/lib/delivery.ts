"use client";

export interface DeliveryAddress {
  pincode: string;
  city: string;
  state: string;
  label: string;
}

const STORAGE_KEY = "bazarbee.delivery.v1";
const CHANGE_EVENT = "bazarbee-delivery-change";

export const DEFAULT_DELIVERY: DeliveryAddress = {
  pincode: "301019",
  city: "Bhiwadi",
  state: "Rajasthan",
  label: "Bhiwadi, Rajasthan 301019",
};

export const DELIVERY_SUGGESTIONS: DeliveryAddress[] = [
  DEFAULT_DELIVERY,
  { pincode: "302001", city: "Jaipur", state: "Rajasthan", label: "Jaipur, Rajasthan 302001" },
  { pincode: "110001", city: "New Delhi", state: "Delhi", label: "New Delhi, Delhi 110001" },
  { pincode: "400001", city: "Mumbai", state: "Maharashtra", label: "Mumbai, Maharashtra 400001" },
  { pincode: "560001", city: "Bengaluru", state: "Karnataka", label: "Bengaluru, Karnataka 560001" },
];

export function deliveryLabel(address: DeliveryAddress): string {
  return address.label || `${address.city}, ${address.state} ${address.pincode}`.replace(/^, |, $/g, "");
}

export function readDeliveryAddress(): DeliveryAddress {
  if (typeof window === "undefined") return DEFAULT_DELIVERY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_DELIVERY;
    const parsed = JSON.parse(raw) as Partial<DeliveryAddress>;
    if (
      typeof parsed.pincode !== "string" ||
      !/^\d{6}$/.test(parsed.pincode) ||
      typeof parsed.city !== "string" ||
      !parsed.city.trim()
    ) {
      return DEFAULT_DELIVERY;
    }
    const address: DeliveryAddress = {
      pincode: parsed.pincode,
      city: parsed.city.trim(),
      state: typeof parsed.state === "string" ? parsed.state.trim() : "",
      label: "",
    };
    return { ...address, label: deliveryLabel(address) };
  } catch {
    return DEFAULT_DELIVERY;
  }
}

export function writeDeliveryAddress(address: DeliveryAddress): void {
  if (typeof window === "undefined") return;
  const next = { ...address, label: deliveryLabel(address) };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function deliveryChangeEventName(): string {
  return CHANGE_EVENT;
}
