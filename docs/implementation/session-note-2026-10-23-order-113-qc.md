# Order page QC — order #113

Date: 2026-10-23
Environment: staging, release `5628fca`
Result: Admin order page now demonstrates payment capture, partial refund, delivery and partial return.
The native refund required a one-off staging link repair; the underlying checkout link gap is recorded.

## Demo order

| Item | Value |
|---|---|
| Order | `#113` / `order_01M5MGPWNKX5X6GGZDP2VBCREY` |
| Cart | `cart_01M5MGPSBAZ1YE1VAGNBETKGGR` |
| Order group | `og_01M5MGPWP4H06D52WJAH8BE1Y9` |
| Customer | `rsoni001@gmail.com` |
| Seller | BuildMaster Supplies |
| Product | VoltEdge Modular Switch 1-Way |
| Quantity | 2 |
| Payment | Captured ₹40,500; order status `partially_refunded` |
| Refund | ₹15,300, native Medusa refund `ref_01M5MH8358QECHSKV88NWADSSX` |
| Delivery | Delivered v5, 2 of 2 units |
| Return | Closed v4, 1 of 2 units requested and approved |

The order was created through the real customer checkout API, not inserted into the database.

The Admin page therefore shows all four update areas on one order:

- Payments: `Partially refunded`
- Payment row: `Captured ₹40,500`
- Refund row: `-₹15,300`
- Delivery: `Delivered, 2 of 2 units`
- Returns: `Return Completed, 1 unit`

## Flow verified

1. Customer login and cart creation.
2. Offer line added with quantity 2.
3. Customer address and shipping method set.
4. Checkout completed; one canonical Medusa order and order group created.
5. Shipment booked by the allocation flow.
6. Native payment captured through the Admin payment flow.
7. Delivery updated: booked → picked up → in transit → out for delivery → delivered.
8. Full delivered quantities persisted: 2 of 2.
9. Customer requested a partial return: 1 of 2 delivered units.
10. Admin approved 1 unit.
11. Return advanced to waiting for pickup and then return completed.
12. Return stayed money-effect-free: no automatic refund, payment mutation or stock movement.
13. Admin processed a separate native partial refund of ₹15,300 for one returned unit.

## Verification data

- Shipment: `ship_2317f395fb2e41cfb07a8b43834d6240`
  - final status `delivered`
  - version `5`
  - line delivered qty `2` of ordered `2`
- Payment: `pay_01M5MGPWWQW6CG7TYKG3YCBFCJ`
  - captured at `2026-10-23T13:56:38.854Z`
  - captured amount ₹40,500
  - order payment status `partially_refunded`
- Refund: `ref_01M5MH8358QECHSKV88NWADSSX`
  - amount ₹15,300
  - created `2026-10-23T14:04:44.072Z`
  - note: `Staging QC partial refund — returned 1 of 2 units (ret_9dfbff43b64f4fd0844d2f63c15aaf70)`
  - refunded total ₹15,300
- Return: `ret_9dfbff43b64f4fd0844d2f63c15aaf70`
  - final status `closed`
  - version `4`
  - delivered qty `2`, requested qty `1`, approved qty `1`
  - return status events record `money_effect: none` and `stock_effect: none`

Machine-readable results:

- `client-projects/client101/evidence/CHG-035/order-113-qc-result.json`
- `client-projects/client101/evidence/CHG-035/order-113-refund-result.json`

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
| Payment section | Captured, partially refunded |
| Refund row | `-₹15,300` |
| Seller page | Same delivered/return state, no terminal controls |
| Console errors | 0 |

Screenshots:

- `client-projects/client101/evidence/CHG-035/order-workbench-screenshots/qc-order-113-payment-refund.png`
- `client-projects/client101/evidence/CHG-035/order-workbench-screenshots/qc-order-113-final-operations.png`
- `client-projects/client101/evidence/CHG-035/order-workbench-screenshots/qc-order-113-payment.png`
- `client-projects/client101/evidence/CHG-035/order-workbench-screenshots/qc-order-113-delivery-return.png`
- `client-projects/client101/evidence/CHG-035/order-workbench-screenshots/qc-order-113-seller.png`

## Defect: missing order/payment collection link

The first native refund attempt failed with:

`LinkOrderPaymentCollection payment_collection_id not found: pay_col_...`

The `order_payment_collection` table had **zero rows** for checkout-created orders. The cart/payment
link existed, but the order/payment link did not. The order page still displayed the payment, so this
was not visible until a refund was attempted.

For order `#113` only, the missing link was inserted in staging:

- order: `order_01M5MGPWNKX5X6GGZDP2VBCREY`
- payment collection: `pay_col_01M5MGPWC8ET3J5A76TAGYN65S`

The failed refund created no refund record. The retry then succeeded.

This is a real checkout/order-group integration gap. It should be fixed in the code that creates
orders so the link is created for every checkout order, with a regression test that performs a
native refund. The manual database insert must not be repeated in production.

## Finding: native summary is not reconciled on #113

The native Medusa summary on #113 still shows:

- **Unfulfilled Items / Awaiting fulfillment**, while the BuildKart Delivery card shows Delivered.
- **Paid Total ₹25,200**, **Credit Lines ₹15,300**, and **Outstanding amount ₹40,500**.

Delivery is intentionally independent of native fulfilment, so the unfulfilled section is expected
but visually confusing. The outstanding amount is a consequence of the capture happening before the
link repair: no capture transaction was added to the native order summary. The payment/refund records
themselves are correct.

A clean financial validation should be run on a new order after the checkout link is fixed, with the
link present before payment capture. Order `#113` should not be used as the authoritative native
accounting example.

No production action was taken.

## Residual gaps

- Selected-SKU delivery status is still deferred.
- Payment/refund manual overrides are not exposed; native finance flows are used.
- The checkout order/payment link must be fixed systemically.
- Real carrier integration remains a separate governed change.
- Production release is not authorized.
