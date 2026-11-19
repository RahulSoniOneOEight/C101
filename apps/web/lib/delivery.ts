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

/**
 * A small, local directory keeps the selector useful without a network dependency. A six-digit
 * pincode in this list fills the city and state as soon as it is typed; anything else stays manual.
 */
export const PINCODE_DIRECTORY: Record<string, { city: string; state: string }> = {
  "110001": { city: "New Delhi", state: "Delhi" },
  "122001": { city: "Gurugram", state: "Haryana" },
  "160017": { city: "Chandigarh", state: "Chandigarh" },
  "201301": { city: "Noida", state: "Uttar Pradesh" },
  "226001": { city: "Lucknow", state: "Uttar Pradesh" },
  "301019": { city: "Bhiwadi", state: "Rajasthan" },
  "302001": { city: "Jaipur", state: "Rajasthan" },
  "380001": { city: "Ahmedabad", state: "Gujarat" },
  "400001": { city: "Mumbai", state: "Maharashtra" },
  "411001": { city: "Pune", state: "Maharashtra" },
  "440001": { city: "Nagpur", state: "Maharashtra" },
  "500001": { city: "Hyderabad", state: "Telangana" },
  "560001": { city: "Bengaluru", state: "Karnataka" },
  "600001": { city: "Chennai", state: "Tamil Nadu" },
  "641001": { city: "Coimbatore", state: "Tamil Nadu" },
  "682001": { city: "Kochi", state: "Kerala" },
  "700001": { city: "Kolkata", state: "West Bengal" },
  "751001": { city: "Bhubaneswar", state: "Odisha" },
  "800001": { city: "Patna", state: "Bihar" },
  "834001": { city: "Ranchi", state: "Jharkhand" },
};

export const DELIVERY_SUGGESTIONS: DeliveryAddress[] = [
  DEFAULT_DELIVERY,
  { pincode: "302001", city: "Jaipur", state: "Rajasthan", label: "Jaipur, Rajasthan 302001" },
  { pincode: "110001", city: "New Delhi", state: "Delhi", label: "New Delhi, Delhi 110001" },
  { pincode: "400001", city: "Mumbai", state: "Maharashtra", label: "Mumbai, Maharashtra 400001" },
  { pincode: "560001", city: "Bengaluru", state: "Karnataka", label: "Bengaluru, Karnataka 560001" },
  { pincode: "411001", city: "Pune", state: "Maharashtra", label: "Pune, Maharashtra 411001" },
];

export function deliveryLabel(address: DeliveryAddress): string {
  return address.label || `${address.city}, ${address.state} ${address.pincode}`.replace(/^, |, $/g, "");
}

export function lookupPincode(pincode: string): { city: string; state: string } | undefined {
  return PINCODE_DIRECTORY[pincode];
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
