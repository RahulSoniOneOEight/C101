# Order page QC — order #113

Date: 2026-10-23
Environment: staging, release `5628fca`
Result: delivery, payment and partial return flow pass; one UX inconsistency recorded.

## Test order

| Item | Value |
|---|---|
| Order | `#113` / `order_01M5MGPWNKX5X6GGZDP2VBCREY` |
| Cart | `cart_01M5MGPSBAZ1YE1VAGNBETKGGR` |
| Order group | `og_01M5MGPWP4H06D52WJAH8BE1Y9` |
| Customer | `rsoni001@gmail.com` |
| Seller | BuildMaster Supplies |
| Product | VoltEdge Modular Switch 1-Way |
| Quantity | 2 |
| Payment | Captured, ₹40,500 |
| Delivery | Delivered v5, 2 of 2 units |
| Return | Closed v4, 1 of 2 units requested and approved |

The order was created through the real customer checkout API, not inserted into the database.

## Flow verified

1. Customer login and cart creation.
2. Offer line added with quantity 2.
3. Customer address and shipping method set.
4. Checkout completed; one canonical Medusa order and order group created.
5. Shipment booked by the allocation flow.
6. Native payment captured through the Admin order page/API.
7. Delivery updated: booked → picked up → in transit → out for delivery → delivered.
8. Full delivered quantities persisted: 2 of 2.
9. Customer requested a partial return: 1 of 2 delivered units.
10. Admin approved 1 unit.
11. Return advanced to waiting for pickup and then return completed.
12. No refund, payment mutation or stock movement was produced by the return.

## Verification data

- Shipment: `ship_2317f395fb2e41cfb07a8b43834d6240`
  - final status `delivered`
  - version `5`
  - line delivered qty `2` of ordered `2`
- Payment: `pay_01M5MGPWWQW6CG7TYKG3YCBFCJ`
  - captured at `2026-10-23T13:56:38.854Z`
  - order payment status `captured`
- Return: `ret_9dfbff43b64f4fd0844d2f63c15aaf70`
  - final status `closed`
  - version `4`
  - delivered qty `2`, requested qty `1`, approved qty `1`
  - return status events record `money_effect: none` and `stock_effect: none`

The machine-readable result is at
`client-projects/client101/evidence/CHG-035/order-113-qc-result.json`.

## UI checks

| Check | Result |
|---|---|
| Operational status tiles | Removed |
| Staging banner | Removed |
| Technical details | Removed |
| Delivery card | Delivered, v5, 2 of 2 units |
| Delivery update control on terminal shipment | Hidden |
| Return card | Return Completed, 1 unit |
| Return update control on terminal return | Hidden |
| Payment section | Captured, paid total ₹40,500 |
| Seller page | Same delivered/return state, no terminal controls |
| Console errors | 0 |

Screenshots:

- `client-projects/client101/evidence/CHG-035/order-workbench-screenshots/qc-order-113-payment.png`
- `client-projects/client101/evidence/CHG-035/order-workbench-screenshots/qc-order-113-delivery-return.png`
- `client-projects/client101/evidence/CHG-035/order-workbench-screenshots/qc-order-113-seller.png`

## Finding

The native Medusa section still shows **Not fulfilled / Unfulfilled Items / Awaiting fulfillment**
while the BuildKart Delivery card shows **Delivered, 2 of 2 units**.

This is expected under the current design: delivery is an independent logistics projection and does
not silently mutate native Medusa fulfilment. However, it is visually confusing on the same page.
Two options need a product decision:

1. Keep the independence and add a short, static label explaining that delivery is separate from
   native Medusa fulfilment.
2. Integrate a native fulfilment/shipment action when delivery is marked delivered, with the same
   RBAC/audit controls.

No change was made to native fulfilment in this QC.

## Residual gaps

- Selected-SKU delivery status is still deferred.
- Payment/refund manual overrides are not exposed; native finance flows are used.
- Real carrier integration remains a separate governed change.
- Production release is not authorized.
