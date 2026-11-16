# Seller order channel and reservation copy — local verification

**Scope:** seller dashboard display only. No checkout, reservation, payment, fulfillment,
product, or stock changes. **Status:** locally verified; not deployed to staging or production.

## Outcome

- Identify B2B/B2C order type from checkout metadata instead of the shared Medusa
  sales-channel name.
- Suppress the misleading sales-channel phrase in the native header.
- For an inventory-linked offer with Mercur inventory management disabled, explain why
  it has no Mercur item reservation and distinguish that from Tryton stock reservation.
- Relabel the native missing-reservation badge to “Unreserved”; do not allocate stock
  or turn on inventory management as a display workaround.

## Evidence

- `bun test tests/order-channel.test.ts tests/order-inventory.test.ts`: 6 passed.
- Targeted ESLint and `tsc -b`: passed. Staging-configured seller Vite build: passed
  with `/seller/` asset base and plugin extensions.
- Read-only local Vite proxy preview of staging seller order #195 (B2C) and #196
  (B2B): labels and conditional inventory note rendered as expected, no misleading
  “B2C Storefront” phrase, no post-login vendor HTTP failures or page errors.
- Desktop and 390px mobile screenshots were viewed locally and removed afterward.
  Mercur's native mobile order-summary row still crowds the price and reservation
  badge; the new badge is shorter than the previous native “Not allocated” copy,
  but this upstream layout defect remains.

## Boundaries

- The B2B offer has `manage_inventory=false` by design, one inventory link, and
  available staging stock. The absent Mercur reservation is therefore expected
  under that offer policy; the native “Allocate items” action is not used here.
- Tryton reservation remains absent and is a separate, deferred checkout decision.
- A staging UI release must be reconciled against the active release baseline and
  published by an operator with deployment access. No production release is authorized.
