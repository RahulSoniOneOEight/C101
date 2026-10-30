# U-009 / B004 — Phase 0 provider gate

**Date:** 2026-10-30
**Status:** PASS (live, isolated preview)
**Commit:** `6d622aa` on `feat/u009-pincode-delivery`
**Preview image:** `buildkart-hosted-pilot-medusa:u009-preview` (ID `43715f5957af`)
**Preview DB:** `buildkart_u009_preview` (clone of staging `buildkart`)
**Staging:** not switched; `release-186a50f` remains current.

## 1. Gate question

Can Medusa's calculated shipping provider read the cart's pincode **and** the
seller, then return a per-seller fee — without faking a line item?

**Answer: yes.** The supported chain is:

1. One `price_type = calculated` shipping option per seller, with
   `data.seller_id` (the option is what carries the seller).
2. Medusa's `listShippingOptionsForCartWithPricingWorkflow` builds
   `optionData: shipping_option.data` and
   `context: { ...cart, items, from_location }`, which includes
   `shipping_address.postal_code`.
3. A fulfillment provider is instantiated inside the **fulfillment module's**
   container, so it cannot resolve the app's `delivery_rates` module.
4. Medusa's `setCalculatedShippingPricingContext` hook result is spread
   **as-is** into the provider's `calculatePrice` context. The hook runs in the
   app container, resolves the fee map from `delivery_rates`, and passes it
   under `u009_delivery_rates`.

## 2. What was implemented

- **`delivery-rates` module**
  - `seller_delivery_rate` model: `seller_id`, `pincode char(6)`,
    `flat_fee_minor`, `currency_code`, `active`, `updated_by`.
  - Migration `Migration20261030120000`:
    - unique `(seller_id, pincode)` where `deleted_at is null`
    - index `(pincode, active)` where `deleted_at is null`
    - check `flat_fee_minor >= 0`
    - check `updated_by in ('admin','seller')`
  - `resolveFee(seller, pincode)` → active row or ₹99 (`9900` minor).
  - `listFeesForPincode(pincode)` → `{ [seller_id]: fee_minor }`.
- **Calculated fulfillment provider `pincode`**
  - `canCalculate() = true`, one `Delivery` option.
  - Reads `optionData.seller_id` and `context.u009_delivery_rates`.
  - Missing fee for a seller → ₹99.
  - Missing `seller_id` → throws.
  - Missing hook context → throws (fails closed; never silently charges ₹99).
  - `is_calculated_price_tax_inclusive: false`, matching the store's
    `price_preference.is_tax_inclusive = false` for both regions.
- **Pricing hook** — `src/workflows/hooks/pincode-delivery-pricing.ts`.
  Registered on `listShippingOptionsForCartWithPricingWorkflow`.
  > `src/loaders/*` is **not** loaded by Medusa v2.20 (verified in
  > `@medusajs/medusa/dist/loaders/index.js` and the framework's
  > `MedusaAppLoader`). The hook must live under `src/workflows`, which the
  > `WorkflowLoader` imports at boot.

## 3. Live proof (isolated preview)

Command inside the preview API container:

```sh
./node_modules/.bin/medusa exec ./src/scripts/u009-live-gate.ts
```

Output:

```json
{
  "status": "PASS",
  "checks": {
    "seeded_is_2900": true,
    "missing_is_9900": true,
    "inactive_is_9900": true
  },
  "steps": [
    { "step": "link_provider", "status": "created" },
    { "step": "create_calculated_option", "status": "created",
      "optionId": "so_01M66EPQ34KSFQ16ZR0EKK9M9J" },
    { "step": "seed_rate", "status": "created",
      "rateId": "sdr_01M66EPQ4ZHGYGR9SM3Q40ZPJX" },
    { "step": "create_cart", "status": "created",
      "cartId": "cart_01M66EPQ56FYMX8R6AJSD9R33D" },
    { "step": "seeded_pincode", "pincode": "302001", "amount": 2900 },
    { "step": "missing_pincode", "pincode": "999999", "amount": 9900 },
    { "step": "inactive_pincode", "pincode": "302001", "amount": 9900 }
  ]
}
```

What the gate did, against the real Medusa runtime:

1. Linked `pincode_pincode` to PowerMax Depot's stock location.
2. Created `U009 Delivery` — a **calculated** option in PowerMax's service zone
   with `data.seller_id = sel_01M4EC9CVVHG168X1DHHBY29HY`.
3. Seeded `(PowerMax, 302001) → 2900`.
4. Created a cart with a PowerMax variant and a 302001 address; listed
   shipping options → **₹29.00**.
5. Changed the address to `999999`; listed → **₹99.00** (default).
6. Deactivated the rate row; listed at `302001` → **₹99.00**.

The fee is returned by Medusa's calculated-price pipeline, not inserted as a
line item.

## 4. Static checks

- `bunx tsc -b` (`services/backend/packages/api`): **PASS**
- Jest `provider.unit.spec.ts` inside the preview image: **5/5 PASS**
  (seeded fee, default, missing seller, missing hook context, option shape).
- Migration up on `buildkart_u009_preview`: **PASS** (`seller_delivery_rate`,
  unique index, check constraints, `pincode_pincode` enabled).
- Migration down: not executed on the preview DB (the table is now used by the
  gate); `down()` drops the table.

## 5. What this gate does not cover

- Admin/Seller CRUD and bulk import (next step).
- Cart binding to the home address, cart/checkout UI.
- Order-level fee display and the "Shipping Free" lie fix.
- Free-shipping discount line.
- Staging deploy (not authorized by the brief; requires a separate release).
- Cleanup: the preview DB, container and image are still present on the host
  and can be removed after the feature branch is ready.
