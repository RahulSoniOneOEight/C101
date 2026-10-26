/**
 * Money units at the Medusa boundary.
 *
 * Medusa (and the Mercur modules that extend it) store money in **major currency units** — numeric
 * decimals such as `3990.00`. The Experience API's public contract is **integer minor units**
 * (paise), because every client formats with a `/100` rule.
 *
 * Historically this deployment wrote minor units into Medusa, so the same number meant different
 * things on each side of the boundary. `MEDUSA_MONEY_UNITS` makes the intent explicit and lets the
 * data migration and the code switch over together:
 *
 *   MEDUSA_MONEY_UNITS=minor  (default)  Medusa currently holds minor units — pass values through.
 *   MEDUSA_MONEY_UNITS=major             Medusa holds major units — convert at the boundary.
 *
 * Rollback is therefore: restore the database snapshot, unset the variable, restart the API.
 */

const configured = (process.env.MEDUSA_MONEY_UNITS ?? "minor").trim().toLowerCase();
const factor = configured === "major" ? 100 : 1;

/** True when Medusa amounts must be scaled into minor units before leaving the API. */
export const medusaStoresMajorUnits = configured === "major";

/** Medusa amount -> API minor units. Null/undefined/NaN pass through as null. */
export function medusaToMinor(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  return Math.round(amount * factor);
}

/** Medusa amount -> API minor units with a numeric fallback. */
export function medusaToMinorOr(value: number | null | undefined, fallback = 0): number {
  return medusaToMinor(value) ?? fallback;
}

/** API minor units -> the amount to send to Medusa for a write. */
export function minorToMedusa(valueMinor: number): number {
  if (!Number.isFinite(valueMinor)) return 0;
  return valueMinor / factor;
}
