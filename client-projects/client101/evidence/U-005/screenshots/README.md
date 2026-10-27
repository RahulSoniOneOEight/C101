# U-005 screenshots

## Before (live `399a969`)

- `delivery-before-1440.png` — order `#145` delivery section: two shipment cards, both show
  **Seller code** with raw `sel_…` IDs. This is the defect.
- `order-before-1440.png` — full order page context for the same order.

## After (release `a13bcb4`)

- `delivery-after-1440.png` — **Seller / Store** names (BuildKart Direct, UrbanBuild Supply) and
  `Sellers (2)` summary; no raw IDs in the primary values.
- `delivery-after-390.png` — same at 390px; actions stack and remain usable.
- `shipments-after-1440.png` — shipments list Seller column with names.
- `shipment-detail-after-1440.png` — shipment detail Seller with the name.
- `orders-list-after-1440.png` — admin orders list shows group `#121` (`#144`, `#145`).
- `order-after-1440.png` — order page with the delivery names.

## Out-of-scope finding

- `web-order-confirmation.png` — web storefront checkout fails with `401 A pilot bearer session is
  required`; no order is created. The web server-side client has no pilot session (CHG-081 gap).

Do not retouch these images; they are evidence.
