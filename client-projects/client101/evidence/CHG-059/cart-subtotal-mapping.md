# CHG-059 — checkout item-subtotal mapping

**Date:** 2026-10-19
**Status:** Implemented and unit-verified; staging deployment pending
**Change:** `client-projects/client101/changes/CHG-059.yaml`

## Defect

After a delivery method was attached, checkout showed:

| Row | Shown | Expected |
|---|---|---|
| Subtotal | ₹4,089 | ₹3,990 |
| Shipping | ₹99 | ₹99 |
| Total | ₹4,089 | ₹4,089 |

The engine total was already correct. `composeCartView` forwarded Medusa
`cart.subtotal`, which includes shipping once a method is attached, so the
Subtotal row overstated the product amount and the rows did not add up.

## Fix

`services/experience-api/src/commerce/cart-totals.ts` — `itemSubtotalMinor`:

1. Prefer the engine `item_subtotal` when present and non-negative.
2. Otherwise sum line-item `subtotal`.
3. Otherwise sum `unit_price × quantity`.
4. Never subtract shipping on the client.

`composeCartView` now returns:

- `subtotal` — item-only amount (storefront semantics);
- `item_subtotal` — the same value, explicit;
- `engine_subtotal` — the untouched engine value, kept for audit/debugging.

Every cart response is composed: read, promotion apply/remove, create,
customer details, shipping method, line add/update/remove. That mattered —
selecting shipping previously returned a raw Medusa cart, which bypassed the
corrected mapping until the next refresh.

## Verification

| Check | Result |
|---|---|
| ₹3,990 item + ₹99 shipping | Subtotal ₹3,990, Shipping ₹99, Total ₹4,089 |
| Missing `item_subtotal` | line subtotals used |
| Missing line subtotal | unit × quantity used |
| Item promotion | product subtotal unchanged, discount shown separately |
| Free shipping | shipping discount shown, item subtotal unchanged |
| `bun run typecheck` | pass |
| `bun run test:cart-totals` | pass |
| `flutter test --exclude-tags golden` | 209 pass |

Tests: `services/experience-api/src/scripts/cart-totals-test.ts`.

## Deployment

Requires a new `experience-api` container alongside the next app build.
Until the API is redeployed, the deployed UI still receives the old mapping.

Staging only; production release remains unauthorized.
