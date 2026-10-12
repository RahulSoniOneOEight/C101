# CHG-028 — Staging commission policies and seller statements

## Outcome

- Added governed Mercur commission presets for bounded staging:
  - global fallback: 10%
  - Building Materials: 8%
  - Power Tools: 12%
  - GST and shipping excluded from the commission base
- Added a persistent marketplace-settlement module and migration.
- Added four reconciled, synthetic September 2026 seller statements.
- Added authenticated, RBAC-scoped, read-only admin list and detail APIs.
- Added operator list and detail pages with explicit simulated/no-payout labels.
- Added a production fail-closed guard. A production-shaped runtime must explicitly declare
  `BUILDKART_ENVIRONMENT=staging` to expose or seed these fixtures.

## Safety boundary

- No payout account, payout provider, transfer, bank movement or webhook is created.
- No Tryton accounting posting is created.
- Every statement stores `test_data: true`, `payment_mode: simulated` and
  `payout_execution_authorized: false`.
- Existing category rules are never silently replaced; the configuration script stops on a
  governed policy conflict.
- Production release remains unauthorized.

## Validation evidence

- `python tooling/validate_contracts.py` — pass.
- `bun run test:staging-finance` — pass; three policies and four statements reconcile.
- `bun run test:payment-safety` — pass.
- `bun run configure:staging-finance` twice — pass; exactly three rates and four statements remain.
- `bun run lint` in `apps/admin` — pass.
- Production-shaped admin, vendor and API builds — pass; both dashboards bundle under their
  configured subpaths.
- Runtime API checks:
  - unauthenticated list returns `401`
  - authenticated list returns four statements
  - held-status filter returns one statement
  - detail returns the expected line and ISO dates
  - `POST` is unavailable

## Deployment status

Repository and pull-request scope only. Hosted staging was not changed.
