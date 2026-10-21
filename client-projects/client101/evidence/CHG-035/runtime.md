# CHG-035 — delivery capture and returns (staging runtime)

**Environment:** staging only

**Runtime:** implemented in the staging codebase; deployment and staging acceptance still require the
existing environment/provider evidence.

**Production:** unauthorized

**Commit:** `b6d7684` on `feat/medusa-native-merchandising-admin`

**Staging release:** `/opt/buildkart-releases/release-b6d7684` (`current` symlink)

## Implemented

| Commit | Artefact | Status |
|---|---|---|
| 2 | `src/logistics/shipment-store.ts`, `src/logistics/provider.ts` | Durable Postgres shipment/event/line store and `LogisticsProvider` boundary |
| 3 | `src/workers/event-consumers.ts` | Allocation-driven, idempotent shipment booking; customer booking endpoint removed |
| 4 | `src/index.ts` shipment routes | Owner-scoped customer reads, operator delivery-evidence/simulate/reconcile/exceptions/webhook, auth + privileged audit |
| 5 | `src/store/return-store.ts`, `src/returns/eligibility.ts`, `src/index.ts` | Return case/lines/events/evidence, policy snapshot, eligibility, idempotency, decisions, notification templates |
| 6 | `services/backend/apps/admin/src/routes/shipments`, `returns` | Shipments queue/detail/timeline/reconcile and returns workbench, backed by an authenticated Mercur admin proxy |
| 6b | `services/backend/apps/vendor/src/routes/shipments`, `returns` | Seller-scoped shipment updates and read-only return visibility in the vendor portal |
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
  with status filters, and a returns workbench with status filters. These views refresh every 15
  seconds; shipment/return actions invalidate the order-status list immediately.
- Vendor portal adds seller-scoped shipments and returns. A seller can update only its own
  shipment status and delivery evidence. Admin decides return approval/rejection; the seller follows
  that decision and sees only its own return lines, decision note and current status.
- Seller identity is supplied by the authenticated Mercur vendor session to the Experience API
  through the staging service secret and `x-buildkart-seller-id`; a seller cannot read or update
  another seller's shipment.
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
Vendor panel: bun run build                  PASS (bundles seller pages; SDK base-path warning only)
Flutter: flutter analyze                     PASS (no issues)
Flutter: flutter test                        PASS (266 tests)
Return eligibility test                      PASS
Return no-effects test                       PASS
Shipment ordering test                       PASS
Shipment restart test                        PASS
Shipment exception/reconcile test            PASS
Return idempotency test                      PASS
Shipment auth test                           PASS (with dummy service secret)
Seller shipment isolation test               PASS (seller A updates; seller B gets 404)
```

The schema bootstrap now takes a Postgres advisory lock, so concurrent service/test instances cannot
race `CREATE TABLE IF NOT EXISTS` into a duplicate `pg_type` row.

The DB-backed scripts require `EXPERIENCE_DATABASE_URL` (local staging default:
`postgres://buildkart:buildkart@localhost:5433/buildkart_experience`). The auth script also requires
a running Experience API; the operator branch uses the dummy staging service secret.

## Staging deployment and smoke (2026-10-21)

- Deployed release `b6d7684` to the hosted staging stack.
- Customer web deployed to `https://buildkart-staging.web.app` with `BUILD_ID=b6d7684`.
- Hosted acceptance run inside the event-worker container: **11/11 pass**.
- Public health: `https://api-staging.pinakaplay.cloud/health` — `environment=staging`,
  `payment_mode=simulated`, NATS and identity store connected.
- Admin and vendor panels respond on `https://ops-staging.pinakaplay.cloud`.
- Staging smoke order: `cart_01M5ESQT6VZDV4M1AXHWE7PT8H`.
  - Shipment booked: `ship_569d0a75c40d4925a5cae9967a261c8d`.
  - Seller updated it to `delivered` with proof `staging://smoke/proof` and per-line quantity.
  - Customer order read returned one shipment and eligible return quantity.
  - Customer created return `ret_5ba8c1104472417f8aee93aec14070eb`.
  - Admin approved it; decision event records `money_effect=none`, `stock_effect=none`.
  - Seller view showed `approved`, decided by the admin, with one seller-scoped line.
- Superseded on 2026-10-21: the temporary `order.confirmed` staging booking fallback was removed.
  Mercur now publishes `marketplace-allocation.created` (see the allocation-producer section below).
- Production remains unauthorized.

## Native order detail and populated workbenches (2026-10-21)

- Deployed staging release `6c291a5`; the native admin order widget was introduced in `cdad481`.
- Added a `Delivery & returns` widget at `orders.detail.main.before` on the Mercur admin order page.
  It resolves the native seller order through Mercur's order-group relation and reads lifecycle truth
  from the Experience API.
- The widget shows shipment status, tracking, seller, delivered/ordered quantity, proof, event count,
  return status, reason, requested quantity and decision note. Operators can record delivery evidence
  and approve/reject requested returns without leaving the native order page.
- Customer return initiation remains customer-owned; the widget explicitly directs operators to
  review rather than create customer requests.
- The Shipments workbench now shows customer checkout/order-group correlation, delivered quantity
  and proof state. The Returns workbench now shows order group, reason, resolution, quantity and
  decision details.
- Native order `#87` (`order_01M5ESQWMSTFWBEHMBZX3D0JNQ`) resolves to
  `og_01M5ESQWN32RNWWM1DN9AZ1JG5` and returns one delivered shipment plus one approved return.
- Ran the governed staging lifecycle fixture through real checkout, seller-status, customer-return
  and admin-decision APIs:

| Native order | Scenario | Shipment | Return |
| --- | --- | --- | --- |
| `#88` | booked | booked | none |
| `#89` | in transit | in_transit | none |
| `#90` | delivery exception | delivery_failed | none |
| `#91` | awaiting decision | delivered | requested |
| `#92` | approved return | delivered | approved |
| `#93` | rejected return | delivered | rejected |

- Staging workbench totals after fixture creation: **7 shipments** (`4 delivered`, `1 booked`,
  `1 in_transit`, `1 delivery_failed`) and **4 returns** (`2 approved`, `1 requested`, `1 rejected`).
- Return decision events for the approved and rejected fixtures both record `money_effect=none` and
  `stock_effect=none`.
- Fixed JetStream coverage by adding and idempotently reconciling the `return.>` stream subject.
  The return-event outbox drained from seven unpublished records to **zero**, with no continuing 503
  publish warnings.
- Final hosted acceptance: **11/11 pass**. Extended shipment/order-group authorization test: pass.
- Admin root, Shipments and Returns routes each respond `200`; the deployed admin bundle contains the
  order-detail widget.
- Production remains unauthorized.

## Allocation-driven booking producer (2026-10-21)

- Deployed staging release `7eb7689`; producer introduced in `1c1435e`, with native order-line
  projection corrected in `7eb7689`.
- The Mercur worker subscribes to the documented `order_group.created` event, reads the completed
  cart, order-group, seller-order and order-line projection, and publishes one canonical
  `marketplace-allocation.created` event per seller order to
  `marketplace-allocation.created.v1`.
- Allocation and event IDs are deterministic:
  `allocation_id = alloc_<native seller order suffix>`, event ID derived from the allocation ID.
  Redelivery and retry therefore converge instead of creating a second allocation.
- Line evidence comes from the native order-line `detail` (quantity, variant, SKU) and the canonical
  cart line key. The producer fails closed when a seller order cannot be traced to its source cart
  lines or when the native projection has unmatched lines.
- The payload carries `order_id`, `order_group_id`, `seller_id`, `seller_order_id`,
  `order_line_ids`, per-line `line_key`/`sku`/`variant_id`/`quantity`, `destination_postcode`,
  `status=confirmed`, `environment=staging` and `test_data=true`.
- The Experience API consumer filter is now `marketplace-allocation.>`; the old catch-all filter was
  reconciled in place. The `order.confirmed` booking fallback is removed from the worker.
- Real staging proof:
  - Fresh order `cart_01M5EZYVTCPMWQGNNJSAYCTS47` / `og_01M5EZYZ4KKWAP9H9Z49SX32C7` produced
    allocation `alloc_01M5EZYZ3QBQXT9QPZVYS7RAS9` and shipment
    `ship_f41f6f25780f4829963d4ab9ce76349d` with no fallback.
  - Delivery recorded with proof `staging://allocation-cycle/...` and `3/3` delivered units.
  - Customer requested return `ret_986e2124bf7745dc8b99bc3477bc00df` for 2 units (damaged).
  - Admin approved it as `support_operator`; the decision event records `money_effect=none` and
    `stock_effect=none`.
- The one order that failed during the producer rollout (`og_01M5EZB5WTR8MRDKGHNW5JNA98`) was
  repaired through the governed staging repair script; it now has allocation
  `alloc_01M5EZB5W5QWK03V7SFFC7S9JD` and shipment `ship_058caf6fbaf1437797c6810c221541c1`.
- JetStream stream subjects now include `marketplace-allocation.>`. The active durable consumers are
  `pilot-notification-dispatch`, `reconciliation-tracker`, `tryton-reservation` and
  `marketplace-allocation-shipment-booking`; the retired `order-confirmed-staging-shipment-fallback`
  and an obsolete experimental consumer were deleted.
- Staging totals after the allocation cycle: **9 shipments** (`5 delivered`, `2 booked`,
  `1 in_transit`, `1 delivery_failed`) and **5 returns** (`3 approved`, `1 requested`, `1 rejected`).
- Historical shipments created before the switch retain their `order-confirmed:` allocation IDs as
  immutable staging evidence; every shipment created after the switch uses `alloc_...`.
- Verification: allocation-event unit tests **3/3 pass**, backend typecheck pass, hosted acceptance
  **11/11 pass**, shipment/order-group authorization test pass, and the event outbox backlog is
  **zero**.
- Production remains unauthorized.

## Vendor identity and admin proxy (2026-10-21)

- Deployed staging release `796f14a`.
- A real hosted vendor login (`/auth/member/emailpass`) returns a **member** actor (`mem_...`), not a
  seller ID. The custom vendor proxy previously used `req.auth_context.actor_id` as the seller ID,
  which made the Vendor UI unable to resolve its shipments.
- Fixed all six vendor Experience API proxies to use Mercur's server-resolved
  `req.seller_context.seller_id` (populated by `ensureSellerMiddleware` after verifying the member's
  `x-seller-id` membership). The member actor is still forwarded for audit.
- Hosted verification as BuildMaster Supplies (`sel_01M4EC9C7YNSFGCG6A4B3Q6PG8`): **9 shipments**
  and **5 returns**, including the allocation-cycle delivery and approved return.
- Hosted verification as PowerMax Depot (`sel_01M4EC9CVVHG168X1DHHBY29HY`): **0 shipments**, **0
  returns**. Sending PowerMax's token with BuildMaster's seller header is rejected with **400**.
- The admin proxy preferred the public `EXPERIENCE_API_URL`, which the dashboard container cannot
  resolve. It now prefers the private `EXPERIENCE_OPERATOR_BASE_URL`
  (`http://experience-api:9020`). A direct in-container proxy call returned **200** with one shipment.
- Native admin order `#95` renders the delivery/returns widget with one delivered shipment (3/3 units,
  proof captured, 2 events) and one approved return (2 units, decision note).

## Customer detail and mobile review (2026-10-21)

- Deployed customer web build `8b811a7` at `https://buildkart-staging.web.app`.
- Visual and console review at **390×844** and **360×800**, using the real pilot login
  (`rsoni001@gmail.com`, OTP `123456`):
  - home, account, order list, order detail and return status pages render without horizontal
    overflow or console errors;
  - order detail shows tracking `SIM-70DFBB2C2F71`, proof captured, **delivered 3 of 3**, timeline
    `Order placed → Booked → Delivered`, and the approved return;
  - return detail shows **Requested 2 · Approved 2** and the no-refund/no-stock notice.
- Fixed the customer order model to accept the Experience API's camelCase projection
  (`trackingNumber`, `orderedQty`, `deliveredQty`, `requestedQty`, `approvedQty`, `eventType`,
  `occurredAt`) while retaining legacy snake_case compatibility. Previously these cards rendered
  `delivered 0 of 0` and `0 item(s)`.
- Fixed the return status screen to read the same camelCase/approved quantities.
- Added `test/order_models_api_test.dart` (2 passing tests) covering the API projection, legacy
  compatibility and completed shipment timeline events.
- Final admin widget layout check at 1440×1200: long order-group/checkout IDs wrap instead of
  overlapping, and the widget states that native Medusa fulfilment/payment status is not mutated by
  staging delivery or return evidence. A short-lived staging verifier account was used for this
  browser check and then deleted from the user, identity and provider tables.
- Final staging release `c05116e`; hosted acceptance remains **11/11**, shipment authorization test
  passes, and the event outbox backlog is **zero**. The final widget also displays approved quantity
  (rather than requested quantity) once a return is approved.
- Production remains unauthorized.

## Open decisions still requiring human approval

| ID | Decision | Implemented staging default |
|---|---|---|
| OD-035-01 | Return window and reason/category matrix | 7 days; damaged, wrong item, not as described |
| OD-035-02 | Evidence upload vs reference-only | Reference-only |
| OD-035-03 | Return approver roles | Resolved 2026-10-21: admin-only; seller follows the admin decision |
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
