# CHG-067 — B2C checkout shipping repair (BuildKart Direct)

**Date:** 2026-10-20
**Environment:** staging only
**App build:** `8d5d5a0` (no app rebuild required)
**Reported symptom:** B2C checkout showed `Checkout failed.` after **Place order**.
**Production release authorized:** no.

## Root cause

`BuildKart Direct` is a legacy seller created outside the four-seller demo seed. Its 20 imported
B2C products had valid offers, prices and stock, but its warehouse had:

- no seller-to-stock-location link;
- no fulfilment set;
- no manual fulfilment-provider link;
- no service zone;
- no shipping options.

A cart containing a BuildKart Direct product therefore returned no shipping rate for that seller.
Medusa rejected completion with:

```text
Medusa store request failed (400):
No shipping method selected but the cart contains seller items that require shipping.
```

Carts with only the other four sellers continued to work, which is why the failure looked
intermittent.

## What was repaired

Only staging fulfilment configuration was changed. No product, variant, SKU, price, offer, seller
allocation, commission, payout, tax or category data changed.

| Item | Value |
|---|---|
| Seller | `BuildKart Direct` · `sel_01M5897CE4PTBHS4AA7H0G79G7` |
| Stock location | `BuildKart Direct Warehouse` · `sloc_01M589898F6DHEVYX1ZPYMFA1V` |
| Seller ↔ location link | created |
| Fulfilment set | `fuset_01M5B7NQ2AQADDNRH26PZ54YCG` |
| Service zone | `BuildKart Direct India` · `serzo_01M5B7NQ3JDZPAACDYKHC2ESTE` |
| Standard Shipping | ₹99 · `so_01M5B7NQ4V9SW32SK5W8G803HA` |
| Express Shipping | ₹199 · `so_01M5B7NQ4WJXDZ6N4GT5N6PVA2` |
| Shipping profile | `Marketplace Shipping` (shared) |
| Provider | `manual_manual` |

The repair is repeatable and idempotent:

```sh
cd services/backend/packages/api
bun run ensure:buildkart-direct-shipping
```

Script: `services/backend/packages/api/src/scripts/ensure-buildkart-direct-shipping.ts`.

It was executed on staging inside `buildkart-hosted-pilot-medusa-api-1` with `medusa exec`. A second
run detected the existing link, fulfilment set, service zone and two options and created nothing.

## Verification

### Before the fix

Mixed cart `cart_01M5B7GFDX4SRVPH8CAZMVPDJC` (UrbanBuild + BuildKart Direct):

- shipping options returned only UrbanBuild Supply;
- completion returned `502 upstream-error` with the Medusa shipping message above.
- Raw: `before-fix-mixed-cart.json`.

After creating the options but before linking the warehouse to the seller, a BuildKart Direct-only
cart still returned no options. That intermediate failure is retained as
`before-seller-link-still-failing.json`.

### After the fix

| Check | Result |
|---|---|
| BuildKart Direct-only cart shipping options | pass — Standard ₹99 and Express ₹199 |
| Mixed UrbanBuild + BuildKart Direct shipping options | pass — four options across both sellers |
| Mixed cart completion | pass — `order_group` with `seller_count: 2` |
| Flutter B2C checkout with a BuildKart Direct product | pass — **Order Confirmed** |
| Console errors | none |
| Real payment | none — simulated adapter, `test_data: true` |

Staging test orders created by this verification:

- Mixed API completion: `og_01M5B7TW9Y05XVFSWJM76F8641` (2 sellers).
- Flutter UI completion: `og_01M5B7XJTR47M88RPXT551G9CP` (RANGER A/T, ₹939.06 + ₹99 shipping =
  ₹1,038.06).

A control mixed cart across two seeded sellers (`UrbanBuild + PowerMax`) also completed successfully
before the repair, confirming the defect was specific to the legacy seller. Raw evidence:

- `after-fix-mixed-cart.json`
- `seeded-multi-seller-success.json`
- `ui-buildkart-direct-shipping.png`
- `ui-order-confirmed.png`

## Known gaps

- BuildKart Direct still has no seller member/vendor dashboard login. That is separate from B2C
  checkout and was not changed.
- Full app regression and human visual acceptance for CHG-066 remain outstanding.
- Production remains unauthorized.

No credentials, session tokens or customer production data are included in this evidence.
