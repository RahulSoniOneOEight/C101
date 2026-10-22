# Session note — QC checkout order #108 and admin/seller visibility

Date: 2026-10-22  
Environment: staging  
Result: pass

## Order placed through the customer app

- Customer: `rsoni001@gmail.com`
- Product: **1/2in Drive 24 Pcs Socket Set**
- SKU: `BAUM-237S1-SET-HEX`
- Seller: **BuildMaster Supplies**
- Order: **#108** / `order_01M5J8J4FQTSWBEFAWBHDVFJC0`
- Cart: `cart_01M5J8HS5R8TDQ70F6YTTY1MH6`
- Order group: `og_01M5J8J4G1MB72YWMZFP8WXRGF`
- Displayed total: **₹408,900**
- Payment: simulated, authorized
- Shipment: `ship_cfde0ee50f7a4b0ea7a0d2c3bdf6c367`, **booked**
- Customer confirmation screen rendered successfully

The order was placed through the real customer app flow:
product detail → add to cart → cart → checkout → address/shipping → simulated payment → place order.

## Admin visibility

Native Medusa admin opened:

`/dashboard/orders/order_01M5J8J4FQTSWBEFAWBHDVFJC0`

Verified:

- order **#108** is present
- product, SKU, variant and quantity are correct
- line shows **Allocated**
- payment is **Authorized**
- fulfilment is **Not fulfilled**
- totals and shipping are present
- no browser console errors

## Seller visibility

BuildMaster Supplies seller portal opened:

`/seller/orders`

Verified:

- order **#108** appears at the top
- customer is `rsoni001@gmail.com`
- payment is **Authorized**
- fulfilment is **Not fulfilled**
- total is **₹408,900**
- no browser console errors

## Cleanup

Temporary admin verification account `qc-order-20261022@buildkart.test` was removed after the check.

## Notes

- The order is a staging/test order (`test_data: true`, `payment_mode: simulated`).
- No production authorization is implied.
- A previous unrelated test order `#107` also exists from checkout verification.
