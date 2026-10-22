# Session note — B2B/B2C order channel verification and admin filter (2026-10-22)

## Scope

Verify one B2C and one B2B order, then expose the canonical buyer channel on the admin
orders surface. Staging only; no production authorization.

## Orders used

| Channel | Order | Source | Total | Shipment |
|---|---|---|---|---|
| B2C | `#98` / `order_01M5H927PNYHCK5AGJRHXGMNC5` | Customer app checkout, `b2c_app` channel | ₹2,96,600 | `ship_1e30e7d12e3e4611a10a05c49b29f842`, booked |
| B2B | `#99` / `order_01M5H9TNX4PSJ47EPV3Q87P1T2` | Canonical B2B cart, `b2b_app` channel, `buyer.b2b01@buildkart.test` | ₹92,911 | `ship_59a2160a63134d4798b73679a2ec270c`, booked |

Order `#99` metadata:

```json
{
  "channel": "b2b",
  "test_data": true,
  "payment_mode": "simulated",
  "business_account_id": "business_arjun_traders"
}
```

Order `#98` metadata:

```json
{
  "channel": "b2c",
  "test_data": true,
  "payment_mode": "simulated"
}
```

## Admin channel filter

Added:

- `GET /admin/buildkart/order-channels?channel=all|b2b|b2c`
  - read-only projection of canonical orders
  - uses the native order-list workflow, so totals and dates match the admin list
  - channel comes from `order.metadata.channel`
  - returns `summary` counts for all/B2B/B2C
- Admin page **Order channels** at `/dashboard/order-channels`
  - All orders / B2C / B2B filter
  - order number, channel badge, customer, placed date, total, status
  - rows link to the native order detail page
- Native Orders page widget **Filter orders by channel**
  - shows counts and links into the channel page
  - keeps the native order table and actions unchanged

The native Medusa order query does not accept a metadata filter, so the channel
view is an explicit read-only workbench rather than a fake native column filter.

## Verification

Authenticated admin API and browser checks against staging:

- summary: `all=99`, `b2b=5`, `b2c=94`
- B2B filter contains order `#99`
- B2C filter contains order `#98`
- native Orders page shows the channel widget with matching counts
- channel page and widget render with zero console errors
- temporary verification admin account deleted after the check

## Important gap

The Flutter B2B **Place Business Order** button is still prototype-local:
`B2BOrdersNotifier.placeOrder` writes the order to local history only and does not
create a canonical Medusa cart/order. Therefore an order placed through the B2B UI
will not appear in the admin channel view yet.

Order `#99` was created through the canonical B2B API path
(`POST /v1/carts` with `channel: "b2b_app"`, add offer, address, shipping, complete).
Wiring the B2B UI to that path requires a separate Lane B change covering:

- resolving B2B SKU lines to seller offer ids;
- a governed delivery address and buyer identity;
- credit/UPI/COD presentation mapped to the staging simulated payment path.

## Release

- Code commit: `842d166`
- Backend image release: `/opt/buildkart-releases/release-842d166`
- Current staging symlink: `/opt/buildkart-releases/current`
- Backend/API change was deployed once; no schema change or migration.
- Production remains unauthorized.
