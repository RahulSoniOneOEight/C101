# U-009 / B004 — Phase 0 provider gate

**Date:** 2026-10-30
**Status:** CODE PROOF PASS — live preview proof pending
**Release under test:** `186a50f` (not deployed by this change)

## 1. What was implemented

- New `delivery-rates` module:
  - `seller_delivery_rate` model.
  - Migration `Migration20261030120000` with unique `(seller_id, pincode)`,
    `(pincode, active)` index, non-negative fee check.
  - `resolveFee(seller, pincode)` returning the active row or ₹99 (`9900` minor).
- New calculated fulfillment provider `pincode`:
  - `canCalculate()` returns true.
  - `getFulfillmentOptions()` returns one `Delivery` option.
  - `calculatePrice(optionData, data, context)` reads
    `optionData.seller_id` and `context.shipping_address.postal_code`, then
    calls `resolveFee`.
  - Missing seller fails closed; missing/inactive rate returns ₹99.
- Registered the module and provider in `medusa-config.ts`.

## 2. Medusa context proof (source inspection)

The deployed Medusa `listShippingOptionsForCartWithPricingWorkflow` builds
calculated-option inputs as:

```js
optionData: so.data,
context: {
  ...setCalculatedShippingPricingContextResult,
  ...cart,
  items: filterCartItemsByShippingProfile(cart.items, so.shipping_profile_id),
  from_location: fulfillmentSetLocationMap[so.service_zone.fulfillment_set_id],
},
data: optionDataMap.get(so.id),
provider_id: so.provider_id,
```

Source:
`/app/node_modules/.bun/node_modules/@medusajs/core-flows/dist/cart/workflows/list-shipping-options-for-cart-with-pricing.js`

Cart fields explicitly include `shipping_address.*` and `items.*`:

```js
exports.cartFieldsForCalculateShippingOptionsPrices = [
  "id", "locale", "currency_code", "region_id",
  "items.*", "items.variant.id", "items.variant.product.id",
  "items.variant.product.shipping_profile.id", ...,
  "shipping_address.*",
];
```

Source:
`/app/node_modules/.bun/node_modules/@medusajs/core-flows/dist/cart/utils/fields.js`

Therefore one shipping option per seller can carry `data: { seller_id }`, and
the provider receives the cart’s `shipping_address.postal_code` unchanged.

## 3. Provider proof output

Command:

```sh
bun run src/scripts/phase0-pincode-provider-proof.ts
```

Output:

```json
{
  "status": "PASS",
  "provider": "pincode",
  "canCalculate": true,
  "option": { "id": "pincode-delivery", "seller_id_required": true },
  "received": { "seller_id": "sel_123", "pincode": "302001" },
  "calculated_amount": 2900,
  "missing_seller_blocked": true
}
```

This exercises the exact input shape Medusa constructs: `optionData.seller_id`
plus `context.shipping_address.postal_code`.

## 4. Static checks

- `bunx tsc -b` in `services/backend/packages/api`: **PASS**
- Jest unit spec at
  `src/modules/delivery-rates/__tests__/provider.unit.spec.ts`: **3/3 PASS**
- Migration up/down not yet run on a preview DB.

## 5. Why this is not yet a live gate PASS

The brief says Phase 0 must prove the calculated provider against a live cart.
Running that requires building the API image and starting a preview container
with the new module + migration. The brief does **not** authorize a staging
deploy, and this worktree has no local Docker/Postgres.

**Gate decision:** code-level context + provider calculation are proven; live
preview proof is pending human authorization to build and run a preview
container (no current-symlink switch, no production).

### Proposed preview gate

1. Build the API image from `feat/u009-pincode-delivery`.
2. Start a temporary Medusa preview against a cloned/staging-preview database.
3. Run migration up/down.
4. Create one calculated `Delivery` option for a test seller with
   `data.seller_id`.
5. Create a cart with an address pincode and that seller’s item; call
   `GET /store/shipping-options?cart_id=...`.
6. Confirm the returned `Delivery` amount equals the seeded rate / ₹99 default.

Only after that should the admin/seller UI and cart/checkout UI proceed.
