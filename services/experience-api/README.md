# BuildKart Experience API

Shared backend composition layer for the CHG-017 vertical slice. Composes owner-service data and
implements the replaceable payment adapter. Only payment is simulated.

## Endpoints (staging)

- `GET /health` — liveness, environment, payment mode.
- `POST /v1/checkouts/{checkoutId}/payment-sessions` — create a simulated payment session.
- `POST /v1/payments/{paymentId}/simulate` — record `success|failure|pending|duplicate|late|refund`.
- `GET /v1/payments/{paymentId}` — read payment state.
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

## Status

The checkout orchestration across Medusa (Commerce), Mercur (Marketplace) and Tryton (ERP) and the
cross-system reconciliation endpoint are the next increments; the payment simulator and fail-closed
guard are implemented here.
