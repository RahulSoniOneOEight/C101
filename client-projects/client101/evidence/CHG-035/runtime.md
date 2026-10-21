# CHG-035 — delivery capture and returns (staging runtime)

**Environment:** staging only

**Runtime:** implemented in the staging codebase; deployment and staging acceptance still require the
existing environment/provider evidence.

**Production:** unauthorized

## Implemented

| Commit | Artefact | Status |
|---|---|---|
| 2 | `src/logistics/shipment-store.ts`, `src/logistics/provider.ts` | Durable Postgres shipment/event/line store and `LogisticsProvider` boundary |
| 3 | `src/workers/event-consumers.ts` | Allocation-driven, idempotent shipment booking; customer booking endpoint removed |
| 4 | `src/index.ts` shipment routes | Owner-scoped customer reads, operator delivery-evidence/simulate/reconcile/exceptions/webhook, auth + privileged audit |
| 5 | `src/store/return-store.ts`, `src/returns/eligibility.ts`, `src/index.ts` | Return case/lines/events/evidence, policy snapshot, eligibility, idempotency, decisions, notification templates |
| 6 | `services/backend/apps/admin/src/routes/shipments`, `returns` | Shipments queue/detail/timeline/reconcile and returns workbench, backed by an authenticated Mercur admin proxy |
| 7 | `apps/prototype_app` | Async API-backed orders, shipment timeline, per-line eligibility, return request/status routes |
| 8 | `src/scripts/*shipment*`, `src/scripts/*return*` | Verification scripts for ordering, restart, auth, reconcile, idempotency, eligibility and no-effects |

## Key implementation notes

- Shipment booking is idempotent on `allocation_id`; provider events are unique on
  `(provider, provider_event_id)`.
- Status is monotonic by rank. `delivered` cannot be reversed by a normal event; reconcile is the
  only repair path and writes a privileged audit record through the route.
- Delivery evidence stores `delivered_at`, per-line `delivered_qty` and `proof_ref` only.
- Returns have no Medusa client and no Tryton client. Decisions record
  `money_effect: "none"` and `stock_effect: "none"`.
- Return requests are idempotent on `(user_id, idempotency_key)`; same key + different payload is
  `409 idempotency-key-reuse`.
- Customer order detail returns `lines`, `shipments`, `return_eligibility` and `returns`.
- Admin console calls the Experience API through a staging service secret. Staging uses the dummy
  default `buildkart-staging-dummy-admin-service-secret`; production never reaches this branch and
  must supply a real secret. The logistics webhook likewise uses
  `buildkart-staging-dummy-logistics-webhook-secret` in staging.
- Admin console has three status views: a combined order delivery/returns list, a shipment queue
  with status filters, and a returns workbench with status filters.
- Customer order detail renders shipment events, per-shipment delivered quantities, and return cases
  with a link to return status.
- Flutter order history has no seeded success fallback; loading, empty and error states are explicit.
- Order stage remains based on shipment state while return status is a separate field.

## Verification

```text
Experience API: bun run typecheck            PASS
Mercur API package: bunx tsc --noEmit        PASS
Contract validation                          PASS (38 paths, 25 event channels)
Rule registry                                PASS (59 rules)
CHG-017 approvals                            PASS (G0)
Admin panel: bun run build                   PASS
Flutter: flutter analyze                     PASS (no issues)
Flutter: flutter test                        PASS (266 tests)
Return eligibility test                      PASS
Return no-effects test                       PASS
Shipment ordering test                       PASS
Shipment restart test                        PASS
Shipment exception/reconcile test            PASS
Return idempotency test                      PASS
Shipment auth test                           PASS (with dummy service secret)
```

The schema bootstrap now takes a Postgres advisory lock, so concurrent service/test instances cannot
race `CREATE TABLE IF NOT EXISTS` into a duplicate `pg_type` row.

The DB-backed scripts require `EXPERIENCE_DATABASE_URL` (local staging default:
`postgres://buildkart:buildkart@localhost:5433/buildkart_experience`). The auth script also requires
a running Experience API; the operator branch uses the dummy staging service secret.

## Open decisions still requiring human approval

| ID | Decision | Implemented staging default |
|---|---|---|
| OD-035-01 | Return window and reason/category matrix | 7 days; damaged, wrong item, not as described |
| OD-035-02 | Evidence upload vs reference-only | Reference-only |
| OD-035-03 | Return approver roles | `support_operator`, `marketplace_operator`, `super_admin` |
| OD-035-04 | Approved return changes order stage | No |

These defaults are staging-only and must not be treated as approved production business rules.

## Deployment notes

Staging works with dummy defaults; production must override them from a secret manager.

```text
# Experience API (staging defaults shown)
LOGISTICS_WEBHOOK_SECRET=buildkart-staging-dummy-logistics-webhook-secret
BUILDKART_ADMIN_SERVICE_SECRET=buildkart-staging-dummy-admin-service-secret

# Mercur backend (staging defaults shown)
EXPERIENCE_API_URL=http://localhost:9020
EXPERIENCE_ADMIN_SERVICE_SECRET=buildkart-staging-dummy-admin-service-secret
```

No production release is authorized.
