# BuildKart Experience API

Shared backend composition layer for the CHG-017 vertical slice. Composes owner-service data and
implements the replaceable payment adapter. Only payment is simulated.

## Endpoints (staging)

- `GET /health` — liveness, environment, payment mode.
- `POST /v1/checkouts/{checkoutId}/payment-sessions` — create a simulator-control session.
- `POST /v1/payments/{paymentId}/simulate` — record `success|failure|pending|duplicate|late|refund`.
- `GET /v1/payments/{paymentId}` — read payment state.
- `POST /v1/carts/{cartId}/customer-details` — attach validated checkout contact/address details.
- `GET /v1/carts/{cartId}/shipping-options` — list eligible options with explicit seller ownership.
- `POST /v1/carts/{cartId}/shipping-methods` — persist one buyer-selected option; repeat per seller.
- `POST /v1/checkouts/{cartId}/complete` — idempotently initialize the canonical Medusa payment
  collection/session with `pp_simulated_simulated`, then complete the cart into an order group.
- `GET /v1/content/app-shell?locale=en-IN` — editorial content (non-transactional).

## Run

```sh
bun install
bun run dev
```

## Safety

- `PAYMENT_ADAPTER_MODE=simulated` is staging-only.
- Production fails closed: startup throws if simulated mode is configured for production.
- Provider mode (`provider`) throws — Razorpay is deferred and unverified.
- All simulated records carry `payment_mode=simulated` and `test_data=true`.
- Medusa independently applies the same production fail-closed rule before registering the
  simulated provider.

## Status

The bounded-pilot checkout creates canonical Medusa/Mercur order groups with an explicitly simulated
payment session. Razorpay and all production payment credentials remain deferred.
