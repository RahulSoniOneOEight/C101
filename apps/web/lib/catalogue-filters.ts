import type { ComposedProduct } from "@/lib/experience-api";

/** Shared filter model for the storefront catalogue. Kept server/client safe: no DOM access. */

export interface CatalogueFilterState {
  brands: string[];
  prices: string[];
  discounts: string[];
  flags: string[];
}

export interface FilterOption {
  value: string;
  label: string;
  count: number;
}

export interface PriceBand {
  value: string;
  label: string;
  minMinor: number;
  maxMinor: number | null;
}

export interface DiscountBand {
  value: string;
  label: string;
  minPercent: number;
}

export const EMPTY_FILTERS: CatalogueFilterState = {
  brands: [],
  prices: [],
  discounts: [],
  flags: [],
};

export const PRICE_BANDS: PriceBand[] = [
  { value: "under-500", label: "Under ₹500", minMinor: 0, maxMinor: 49_999 },
  { value: "500-5000", label: "₹500 – ₹5,000", minMinor: 50_000, maxMinor: 500_000 },
  { value: "5000-25000", label: "₹5,000 – ₹25,000", minMinor: 500_001, maxMinor: 2_500_000 },
  { value: "25000-plus", label: "₹25,000+", minMinor: 2_500_001, maxMinor: null },
];

export const DISCOUNT_BANDS: DiscountBand[] = [
  { value: "10-plus", label: "10% or more", minPercent: 10 },
  { value: "15-plus", label: "15% or more", minPercent: 15 },
  { value: "20-plus", label: "20% or more", minPercent: 20 },
];

export const FLAG_OPTIONS: FilterOption[] = [
  { value: "in-stock", label: "In stock", count: 0 },
  { value: "flash-deal", label: "Flash Deal", count: 0 },
];

/**
 * The catalogue import stores lowercase/munged brand keys. These labels are presentation only and
 * never change the underlying filter value.
 */
const BRAND_LABELS: Record<string, string> = {
  homerun: "HomeRun",
  jaquar: "Jaquar",
  baum: "Baum",
  rasiseeds: "Rasi Seeds",
  asianpaints: "Asian Paints",
  jktyre: "JK Tyre",
  wonder: "Wonder",
  apple: "Apple",
  sumsang: "Sumsang",
};

export function brandOf(product: ComposedProduct): string {
  const brand = product.metadata?.brand;
  return typeof brand === "string" ? brand.trim() : "";
}

export function brandLabel(value: string): string {
  return BRAND_LABELS[value.toLowerCase()] ?? value.replace(/\b\w/g, (character) => character.toUpperCase());
}

export function priceOf(product: ComposedProduct): number | null {
  const amount = product.best_price?.unit_amount_minor;
  return typeof amount === "number" && Number.isFinite(amount) ? amount : null;
}

export function discountPercent(product: ComposedProduct): number {
  const offer = product.best_price;
  if (!offer) return 0;
  if (typeof offer.discount_percent === "number" && offer.discount_percent > 0) {
    return offer.discount_percent;
  }
  const list = offer.list_amount_minor;
  const unit = offer.unit_amount_minor;
  if (typeof list === "number" && typeof unit === "number" && list > unit) {
    return Math.round((1 - unit / list) * 100);
  }
  return 0;
}

export function priceInBand(product: ComposedProduct, bandValue: string): boolean {
  const amount = priceOf(product);
  const band = PRICE_BANDS.find((candidate) => candidate.value === bandValue);
  if (amount === null || !band) return false;
  return amount >= band.minMinor && (band.maxMinor === null || amount <= band.maxMinor);
}

export function discountInBand(product: ComposedProduct, bandValue: string): boolean {
  const band = DISCOUNT_BANDS.find((candidate) => candidate.value === bandValue);
  if (!band) return false;
  return discountPercent(product) >= band.minPercent;
}

export function matchesFlag(product: ComposedProduct, flag: string): boolean {
  if (flag === "in-stock") {
    if (product.best_price?.in_stock === true) return true;
    return (product.variants ?? []).some((variant) => variant.in_stock === true);
  }
  if (flag === "flash-deal") {
    return (product.badges ?? []).some((badge) => {
      const value = badge.toLowerCase();
      return value.includes("flash deal") || value.includes("limited deal");
    });
  }
  return false;
}

export function matchesCatalogueFilters(product: ComposedProduct, filters: CatalogueFilterState): boolean {
  if (filters.brands.length > 0 && !filters.brands.includes(brandOf(product))) return false;
  if (filters.prices.length > 0 && !filters.prices.some((band) => priceInBand(product, band))) return false;
  if (filters.discounts.length > 0 && !filters.discounts.some((band) => discountInBand(product, band))) return false;
  if (filters.flags.length > 0 && !filters.flags.every((flag) => matchesFlag(product, flag))) return false;
  return true;
}

export function parseList(value: string | string[] | undefined): string[] {
  if (!value) return [];
  const list = Array.isArray(value) ? value : [value];
  return [...new Set(list.map((item) => item.trim()).filter(Boolean))];
}

export interface CatalogueHrefState {
  path?: string;
  q?: string;
  cat?: string;
  sort?: string;
  brands?: string[];
  prices?: string[];
  discounts?: string[];
  flags?: string[];
}

export function catalogueHref(state: CatalogueHrefState): string {
  const query = new URLSearchParams();
  if (state.q?.trim()) query.set("q", state.q.trim());
  if (state.cat) query.set("cat", state.cat);
  if (state.sort) query.set("sort", state.sort);
  for (const brand of state.brands ?? []) query.append("brand", brand);
  for (const price of state.prices ?? []) query.append("price", price);
  for (const discount of state.discounts ?? []) query.append("discount", discount);
  for (const flag of state.flags ?? []) query.append("flag", flag);
  const suffix = query.toString();
  const path = state.path ?? "/search";
  return suffix ? `${path}?${suffix}` : path;
}

export function activeFilterCount(filters: CatalogueFilterState): number {
  return filters.brands.length + filters.prices.length + filters.discounts.length + filters.flags.length;
}

export function activeFilterChips(filters: CatalogueFilterState): { key: keyof CatalogueFilterState; value: string; label: string }[] {
  const chips: { key: keyof CatalogueFilterState; value: string; label: string }[] = [];
  for (const brand of filters.brands) {
    chips.push({ key: "brands", value: brand, label: brandLabel(brand) });
  }
  for (const band of filters.prices) {
    chips.push({
      key: "prices",
      value: band,
      label: PRICE_BANDS.find((candidate) => candidate.value === band)?.label ?? band,
    });
  }
  for (const band of filters.discounts) {
    chips.push({
      key: "discounts",
      value: band,
      label: DISCOUNT_BANDS.find((candidate) => candidate.value === band)?.label ?? band,
    });
  }
  for (const flag of filters.flags) {
    chips.push({
      key: "flags",
      value: flag,
      label: FLAG_OPTIONS.find((candidate) => candidate.value === flag)?.label ?? flag,
    });
  }
  return chips;
}
