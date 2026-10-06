# CHG-017 ERP movement, reconciliation and connectivity

Date: 2026-10-06
Scope: local isolated staging only; synthetic data; no production authorization

## E-017-017 — Tryton staging movement and accounting

Command: `bun run test:erp` from `services/experience-api`.

```text
PASS: Tryton executes staging movements with test-clearing accounting.
  commit move 76: draft -> assigned
  release move 77: -> cancelled
  accounting: staging_test_clearing, bank_receipt_claimed=false, posted account.move=0
```

Proves:

- Tryton executes **real** reservation commit and release as `stock.move` transitions
  (`draft → assigned` on commit, `→ cancelled` on release);
- the accounting projection uses `accounting_treatment=staging_test_clearing`;
- `bank_receipt_claimed=false`, and no `account.move` is posted to the ledger (no production
  accounting effect).

## E-017-018 — Cross-system reconciliation

Command: `bun run test:reconciliation` from `services/experience-api`.

```text
PASS: cross-system reconciliation is visible, recoverable and test-marked.
  cart=cart_01M48W705KQ8NQ0GXH2WM90EPZ order_group=og_01M48W74YAKD5G67Q02TNVTR8G
  mismatch (before) -> reserve+commit -> reconciled (after)
```

Proves:

- a canonical checkout, its Mercur allocation and its Tryton reservation share one correlation
  reference (the cart/checkout id);
- a checkout completed **without** a reservation is visible as `reconciled=false` with
  `mismatch_codes=["RESERVATION_OR_ORDER_MISSING"]` and offered `recovery_actions`;
- the mismatch is recoverable through the API (`POST /v1/checkouts/{id}/reserve` +
  `.../commit`) — **no direct database edits** — after which `reconciled=true` with empty
  `mismatch_codes`;
- `environment`, `test_data` and simulated markers are preserved in every projection
  (checkout/order/allocation/reservation/movement/accounting).

`GET /v1/admin/orders/{id}/reconciliation` was extended to report the **actual** reservation state
(reserved / committed / released, read from the Tryton move) instead of assuming "committed" when a
move exists, and to return `recovery_actions`.

## E-017-019 — Shared-backend client and operations connectivity

Command: `bun run test:connectivity` from `services/experience-api`.

```text
PASS: shared-backend app + operator surfaces expose environment/freshness/test markers.
  app: catalogue + product detail (payment_eligibility=simulated, freshness medusa/mercur)
  operator: /v1/admin/* + /ops + /metrics
  note: web surface deferred (Phase 6)
```

Proves the implemented surfaces consume the shared backend with visible markers:

- **app**: composed catalogue and product detail carry `environment=staging`, `test_data=true`,
  server-selected `commercial.payment_eligibility=["simulated"]`, and `freshness` entries for Medusa
  and Mercur (`stale=false`);
- **operator**: `/v1/admin/events`, `/v1/admin/orders`, `/v1/admin/collections` carry
  environment/test markers; `/ops` renders the operator console; `/metrics` exposes telemetry;
- **no client can manufacture success**: the Flutter checkout shows success only after the server
  returns a canonical simulated order (see `payment-simulation-acceptance.md`).

**Remaining for E-017-019:** the web (Next.js B2C/B2B) surface is deferred (Phase 6, not
scaffolded), so the item stays `in-progress`.

## Boundary

Bounded staging only. No production accounting, bank receipt, or production release is authorized.
