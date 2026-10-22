# Session note — customer cart recovery and order intake (2026-10-22)

## Symptom

A new customer order did not reach the admin panel. There were no new Medusa orders after
`#96`, and the customer saw no reliable failure.

## Discovery

The order pipeline itself was healthy:

- the allocation producer published `marketplace-allocation.created`;
- the event worker booked a shipment;
- the admin order-group projection returned the shipment.

The failure was upstream, in the customer app. Medusa/Experience logs showed repeated:

```text
POST /v1/carts/local_cart/lines  -> 404
```

## Root cause

`CartNotifier.addItem` fell back to an in-memory/persisted `local_cart` on **any** cart API
failure. That fake id is not addressable by the backend, so every later add/checkout returned
404. The UI nevertheless showed “Added to cart”, making the failure look like success.

## Fix

- `local_cart` is discarded on startup instead of being reused.
- A cached server cart that returns 404 is replaced once with a fresh server cart; the add is
  retried once.
- All other failures are surfaced as `CartUnavailable`; no fake cart is persisted in staging or
  production.
- The prototype offline cart is now explicit opt-in:
  `--dart-define=ALLOW_OFFLINE_CART=true`; default is `false`.
- Add-to-cart UI only shows success when the canonical cart accepted the line; otherwise it shows
  “Could not add to cart. Please retry.”
- Cart build, product list, product detail, quick add, related deals and B2C cards use the same
  safe path.

## Verification

- `flutter test`: **271 passed**, including 3 new cart-recovery tests:
  - persisted `local_cart` is discarded;
  - a failed add reports unavailability and never creates `local_cart`;
  - a 404 on a cached server cart recovers once with a fresh cart.
- `flutter analyze`: no issues.
- Customer web build `686cebc` deployed to `https://buildkart-staging.web.app`.
- Real browser flow at 390×844:
  - login, product detail, add to cart, cart, checkout, place order;
  - no console errors;
  - requests were only `POST /v1/carts` and `POST /v1/carts/<cart>/lines`; no `local_cart`;
  - order **#98** (`order_01M5H927PNYHCK5AGJRHXGMNC5`, `cart_01M5H91W3WJHHX0KX75M5EYHZC`) was
    created.
- Allocation `alloc_01M5H927PNYHCK5AGJRHXGMNC5` published; shipment
  `ship_1e30e7d12e3e4611a10a05c49b29f842` booked.
- Admin order-status projection includes order `#98` with `shipment_count=1`,
  `shipment_statuses=["booked"]`.
- Order-confirmation screen rendered successfully.

## Release

- Customer app commit/build: `686cebc`.
- Backend/Experience API unchanged.
- Lane A with an integration check; no backend deploy.
- Production remains unauthorized.
