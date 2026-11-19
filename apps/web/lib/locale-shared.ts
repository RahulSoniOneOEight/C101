export const STOREFRONT_LOCALE_COOKIE = "bazarbee_locale";

export type StorefrontLocale = "en-IN" | "hi-IN";

export const STOREFRONT_LOCALES: ReadonlyArray<{ value: StorefrontLocale; label: string }> = [
  { value: "en-IN", label: "English" },
  { value: "hi-IN", label: "हिंदी" },
];

export function normalizeLocale(value: unknown): StorefrontLocale {
  return value === "hi-IN" ? "hi-IN" : "en-IN";
}
