import type { ComposedProduct } from "@/lib/experience-api";

/**
 * Delivery promise used by the "Fastest delivery" sort.
 *
 * The catalogue does not yet expose a per-seller distance. It does carry an optional Product Studio
 * delivery note; when absent, the storefront's standard staging promise (3–5 days, also used on the
 * Flutter PDP) applies. Out-of-stock lines always rank last.
 */
export interface DeliveryPromise {
  minDays: number;
  maxDays: number;
  label: string;
  explicit: boolean;
}

const STANDARD: DeliveryPromise = {
  minDays: 3,
  maxDays: 5,
  label: "3–5 days",
  explicit: false,
};

export function deliveryPromise(product: ComposedProduct): DeliveryPromise {
  const raw = product.metadata?.delivery_note ?? product.metadata?.delivery_estimate;
  if (typeof raw !== "string" || !raw.trim()) return STANDARD;
  const text = raw.toLowerCase();
  if (text.includes("same day")) {
    return { minDays: 0, maxDays: 0, label: "Same day", explicit: true };
  }
  if (text.includes("next day")) {
    return { minDays: 1, maxDays: 1, label: "Next day", explicit: true };
  }
  const range = text.match(/(\d+)\s*(?:-|–|to)\s*(\d+)/);
  if (range) {
    const minDays = Number(range[1]);
    const maxDays = Number(range[2]);
    return {
      minDays,
      maxDays,
      label: `${minDays}–${maxDays} days`,
      explicit: true,
    };
  }
  const single = text.match(/(\d+)\s*(?:business\s*)?day/);
  if (single) {
    const days = Number(single[1]);
    return { minDays: days, maxDays: days, label: `${days} days`, explicit: true };
  }
  return STANDARD;
}

export function deliveryRank(product: ComposedProduct): number {
  const offer = product.best_price;
  if (!offer || offer.in_stock === false) return 999;
  return deliveryPromise(product).minDays;
}
