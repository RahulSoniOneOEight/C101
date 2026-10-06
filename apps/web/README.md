# BuildKart web storefront (bounded staging pilot)

Minimal Next.js (App Router) web surface that consumes the shared BuildKart Experience API. It is
the web counterpart of the Flutter app: it renders the composed, authoritative server result and
never re-implements commerce rules.

## Pages

- `/` — composed hardware catalogue (`GET /v1/products`).
- `/products/{id}` — product detail with `environment`, `test_data`, `freshness` and
  `commercial.payment_eligibility` markers.
- `/checkout?productId=…` — collects the address, then completes the canonical checkout
  server-side. Success is shown only when the server returns a canonical order group with
  `payment_mode=simulated` and `test_data=true`; the browser cannot manufacture it.

## Run

```sh
cd apps/web
npm install
EXPERIENCE_API_BASE_URL=http://localhost:9020 npm run dev   # :3000
```

## Configure

- `EXPERIENCE_API_BASE_URL` — shared Experience API base URL (default `http://localhost:9020`).
  All calls are server-side, so no CORS configuration is required.

## Validate

```sh
npm run typecheck
npm run build
```

## Boundary

Bounded staging pilot. Synthetic data only; simulated payment; no production effect. The full
customer/B2B web experience is Phase 6 work; this is the first web surface.
