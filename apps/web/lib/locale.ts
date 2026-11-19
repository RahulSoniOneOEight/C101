import { cookies } from "next/headers";
import {
  STOREFRONT_LOCALE_COOKIE,
  normalizeLocale,
  type StorefrontLocale,
} from "./locale-shared";

/** Server-side locale preference. Defaults to English (en-IN) for every storefront surface. */
export async function getStorefrontLocale(): Promise<StorefrontLocale> {
  const value = (await cookies()).get(STOREFRONT_LOCALE_COOKIE)?.value;
  return normalizeLocale(value);
}
