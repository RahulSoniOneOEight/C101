# CHG-017 web surface (E-017-019)

Date: 2026-10-06
Scope: local isolated staging only; synthetic data; no production authorization

## What was added

`apps/web/` — a minimal Next.js (App Router) web storefront that consumes the shared Experience API.
It is the web counterpart of the Flutter app and re-implements no commerce rules: it renders the
server's composed, authoritative result.

| Route | Behaviour |
| --- | --- |
| `/` | composed hardware catalogue (`GET /v1/products`) |
| `/products/{id}` | product detail with `environment`, `test_data`, `freshness` and `commercial.payment_eligibility` markers |
| `/checkout?productId=…` | address form → canonical checkout |
| `POST /api/checkout` | server route handler performing the shared checkout |

All Experience API calls are server-side (SSR / route handler), so no CORS configuration is required.

## No client can manufacture success

The `/checkout` page shows success only when `/api/checkout` returns `type=order_group` **and**
`payment.payment_mode=simulated` **and** `payment.test_data=true`. The route handler calls the shared
Experience API; the browser cannot fabricate a canonical order. This mirrors the Flutter guarantee.

## Verification

```sh
cd apps/web
npm ci && npm run typecheck && npm run build   # build: 5 routes, clean
```

Live end-to-end run against the staging stack (Experience API `:9020`, Medusa/Mercur `:9010`):

- `GET /` rendered the catalogue (52 products, e.g. "TileCraft Tile Adhesive 20kg ₹543 · AquaFlow Supplies · 2 offers").
- `GET /products/prod_01M4609EK402P9G80DQY5FT97W` rendered the `environment` / `test_data` /
  `payment` / `freshness` markers.
- `POST /api/checkout` returned a canonical simulated order:

```json
{
  "type": "order_group",
  "order_group": { "id": "og_01M48X9RG0CBP9DW2009ECJY9Q", "total": 64200, "seller_count": 1 },
  "payment": { "provider_id": "pp_simulated_simulated", "payment_mode": "simulated", "test_data": true },
  "environment": "staging",
  "test_data": true
}
```

CI: `.github/workflows/web.yml` runs `npm ci` + `typecheck` + `build` on PR/push.

## Boundary

Bounded staging pilot. Synthetic data only; simulated payment; no production effect. This is the
first web surface; the full customer/B2B web experience (accounts, B2B pricing, RFQ, cart
persistence) remains Phase 6.
