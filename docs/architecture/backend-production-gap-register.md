# BuildKart Backend Production Gap Register

**Audit date:** 04 October 2026  
**Scope:** C101 repository at `main` / initial runtime snapshot  
**Workflow stage:** `multi-surface-prototype`  
**Status:** Advisory, read-only audit; no ownership or provider approval implied

## 1. Audit conclusion

The repository contains a tested Flutter experience prototype and governed planning artifacts, but
does not contain a production backend, a standalone Next.js storefront, a seller portal, a commerce
admin, or an operations console. The only live-shaped integration code is a thin Flutter client for
eight Medusa storefront operations covering product listing and basic cart mutation.

All eight stated production blockers are open. The first implementation milestone must be one
traceable marketplace order created by an idempotent backend command, allocated to seller(s),
projected to ERP/logistics, and visible through authorised customer and operator read models.

## 2. Classification

- **Implemented:** production-shaped code and evidence exist.
- **Partial:** some integration code exists, but the production contract or flow is incomplete.
- **Fixture-only:** interactive UI/state exists without canonical persistence.
- **Missing:** no implementation was found in this repository.
- **Blocked:** implementation depends on a recorded approval or unresolved ownership decision.

## 3. Evidence baseline

| Evidence | Finding |
|---|---|
| `apps/prototype_app/lib/data/medusa_api.dart:16-84` | Product list, cart create/get, line add/update/remove, email and address only |
| `apps/prototype_app/lib/screens/checkout_screen.dart:34-69` | Mock payment, local cart clear and success navigation; no order creation |
| `apps/prototype_app/lib/domain/models.dart:234-307` | Cart lines omit variant, seller, offer and fulfilment identity |
| `apps/prototype_app/lib/data/local_store.dart:81-205` | Account, lists and RFQ are device-local stand-ins |
| `apps/prototype_app/lib/providers/orders_providers.dart:7-164` | Orders, cancellation and return are seeded/in-memory |
| `apps/prototype_app/lib/providers/b2b_trade_providers.dart:496-533,712-930` | Seller offers are deterministic fixtures; RFQ submission generates a local reference |
| `apps/prototype_app/lib/screens/b2c_flow_screens.dart:158-353` | Login, OTP and registration navigate without authentication |
| `client-projects/client101/experience/prototype-core-runtime.yaml` | Medusa, Mercur and Tryton real-core runtimes are `planned` |
| `client-projects/client101/experience/integrated-prototype-readiness.yaml` | All seven runtime vertical slices failed/readiness blocked |
| `client-projects/client101/contracts/data-contract.yaml` | Canonical ownership contract is `draft` |
| `client-projects/client101/derived/surface-map.yaml` | Web, seller, admin, ops, analytics and ERP surfaces are required |
| Repository inventory | Only `apps/prototype_app`; no backend, Next.js, seller/admin or worker source package |

## 4. Gap register

### GAP-P0-01 — Identity, OTP, sessions and consent

- **Classification / priority:** Fixture-only; P0 production blocker.
- **Current evidence:** Login and OTP buttons only navigate (`b2c_flow_screens.dart:240,311`); no
  token/session client, secure storage, guards or authenticated API calls were found.
- **Canonical owner:** Identity/Auth boundary; Commerce owns customer/business account and
  entitlements.
- **Missing models/APIs/events:** user identity, credential/OTP challenge, session, refresh-token
  family, device session, consent record, business membership, role/permission; issue/verify/resend
  OTP, sign-in/out, refresh/revoke, recovery, registration/verification, `identity.authenticated`,
  `business-membership.changed`, `consent.recorded`.
- **Impacted surfaces:** Flutter B2C/B2B, web B2C/B2B, seller portal, commerce admin, ops/support.
- **Dependencies / approvals:** Identity provider approach, SMS provider, OTP/rate-limit policy,
  consent text/version, retention, business verification, role matrix. Security/Legal approval.
- **Acceptance criteria:** Server authorises account mode and every protected action; B2B data is
  tenant-isolated; OTP expiry/attempt/resend controls work; logout/revocation invalidates sessions;
  consent is versioned and auditable.
- **Required evidence:** API contract tests, RBAC/tenant-isolation tests, OWASP ASVS review,
  rate-limit/abuse tests, session revocation test, consent audit record and penetration-test report.

### GAP-P0-02 — Composed product and eligible seller offer

- **Classification / priority:** Fixture-only; P0 dependency for marketplace sale.
- **Current evidence:** `ProductSeller` has no `offerId`, eligibility or fulfilment context
  (`models.dart:200-232`); seller sets are generated from base prices
  (`b2b_trade_providers.dart:496-533` and `catalog_providers.dart:238-284`).
- **Canonical owner:** Medusa product/variant and commerce pricing; Mercur seller/offer/ranking;
  Tryton availability; logistics serviceability. A backend composition layer returns the read model.
- **Missing models/APIs/events:** `ComposedProduct`, `EligibleOffer`, landed-price breakdown,
  eligibility reason, MOQ/case pack, price validity, availability timestamp, delivery promise;
  product list/detail/offer APIs and product/offer/availability projection events.
- **Impacted surfaces:** All storefront product cards/PDPs, B2B catalogue/Quick Order/RFQ, seller
  offer editor and admin catalogue.
- **Dependencies / approvals:** Q-005A, landed-price formula, tax display, ranking tie-breakers,
  manual seller choice, rating/suspension rules, master-catalogue owner.
- **Acceptance criteria:** Exact variant/quantity/account/location returns only eligible offers;
  lowest eligible landed payable offer is deterministic; an explicitly selected eligible seller is
  preserved; every price/stock/promise includes source and freshness.
- **Required evidence:** Contract fixtures for B2C/B2B and postcode/account variants, ranking
  property tests, stale projection tests, cross-provider reconciliation and UI state tests.

### GAP-P0-03 — Multi-seller cart identity and revalidation

- **Classification / priority:** Partial; P0 production blocker.
- **Current evidence:** Medusa add-line sends only `variant_id` and quantity
  (`medusa_api.dart:40-49`); local lines use variant as ID and can merge seller choices
  (`cart_providers.dart:80-93`); cart models omit seller/offer/fulfilment identity.
- **Canonical owner:** Medusa cart with Mercur offer/allocation projection.
- **Missing models/APIs/events:** line identity `variant_id + seller_id + offer_id + fulfilment
  context`, immutable offer snapshot, validation version, blocked/change reason, seller totals;
  idempotent add/update/remove/merge/revalidate APIs; `cart.line-revalidated` and `offer.changed`.
- **Impacted surfaces:** Flutter/web carts and checkout, seller allocation, admin order preview.
- **Dependencies / approvals:** Cart merge/substitution policy, offer-change acknowledgement,
  split-seller shipping presentation, cart/offer expiry.
- **Acceptance criteria:** Different sellers never merge; no silent seller replacement; every
  mutation validates MOQ, price, stock and serviceability; stale lines block checkout with actionable
  reasons; retries cannot duplicate lines.
- **Required evidence:** Contract, concurrency and idempotency tests; price/stock race tests;
  explicit-seller persistence tests; multi-device cart consistency and security tests.

### GAP-P0-04 — Canonical checkout, payment and order creation

- **Classification / priority:** Partial/unsafe prototype; P0 production blocker.
- **Current evidence:** Mock gateway always captures (`payment_gateway.dart:22-50`); checkout clears
  cart and reports success without calling an order endpoint (`checkout_screen.dart:56-69`).
- **Canonical owner:** Medusa order; payment provider owns payment result; Commerce stores status
  projection; Mercur owns seller allocation.
- **Missing models/APIs/events:** checkout session/version, totals/tax/shipping/credit breakdown,
  payment intent/session, idempotency record, immutable order snapshot, allocation status;
  prepare/validate checkout, initiate/confirm payment, complete cart/create order, recover status;
  payment webhooks and `order.created`/`payment.*`/`allocation.requested` events.
- **Impacted surfaces:** B2C/B2B Flutter and web checkout/confirmation, admin order view, seller queue,
  ERP/logistics workers.
- **Dependencies / approvals:** Payment provider, COD rules, tax source, shipping policy, reservation
  point, B2B credit/approval and PO policy.
- **Acceptance criteria:** Same idempotency key produces one order; success UI requires canonical
  order ID; payment failure/timeout is recoverable; webhook replay is harmless; commercial snapshot
  is immutable and seller allocations reconcile to order lines.
- **Required evidence:** Provider sandbox evidence, payment success/failure/timeout/replay tests,
  double-submit/concurrency tests, accounting totals reconciliation and end-to-end order trace.

### GAP-P0-05 — Inventory projection and reservation

- **Classification / priority:** Fixture-only/blocked; P0 production blocker.
- **Current evidence:** B2B catalogue hardcodes `stockQty`; runtime records Tryton as planned; no
  inventory API, projection consumer, reservation model or worker exists.
- **Canonical owner:** Tryton inventory; Commerce consumes timestamped availability projection.
- **Missing models/APIs/events:** stock location, ATP, safety stock, reservation, expiry/release,
  projection cursor/freshness; availability query, reserve/confirm/release commands;
  `inventory.changed`, `reservation.created|expired|released`.
- **Impacted surfaces:** Product/PDP/cart/checkout, seller catalogue, admin exceptions, warehouse.
- **Dependencies / approvals:** Q-005A, reservation point/TTL, backorder and exact-stock display,
  warehouse/seller-stock responsibility.
- **Acceptance criteria:** Oversell is prevented under concurrency; stale projections are detected;
  failed/expired payment releases stock; reservation state reconciles with Tryton.
- **Required evidence:** Load/concurrency tests, reservation expiry test, outage/recovery and replay
  tests, projection lag alerts and daily reconciliation report.

### GAP-P0-06 — Serviceability, shipment and logistics events

- **Classification / priority:** Fixture-only/blocked; P0 production blocker.
- **Current evidence:** Checkout hardcodes `Free`; split shipment provider hardcodes seller/AWB/status;
  logistics candidates are unselected and integration events/commands are empty.
- **Canonical owner:** Logistics integration owns shipment; Commerce and ERP consume status
  projections; Mercur supplies seller allocation context.
- **Missing models/APIs/events:** serviceability result, rate, delivery promise, shipment/leg,
  package, label, manifest, tracking event, exception; serviceability/rate/ship/cancel/track APIs and
  normalised carrier webhook events.
- **Impacted surfaces:** PDP/cart/checkout/tracking, seller fulfilment, admin/ops, support.
- **Dependencies / approvals:** Provider selection, Q-005A, split-shipment/charge policy, carrier SLA,
  restricted goods and launch geography.
- **Acceptance criteria:** Unserviceable lines cannot checkout; promise and charges are shown before
  confirmation; allocation creates traceable shipment legs; duplicate/out-of-order webhooks are safe;
  exceptions have operator recovery actions.
- **Required evidence:** Provider sandbox, postcode/rate cases, webhook replay/order tests, shipment
  state-machine tests, SLA monitoring and reconciliation.

### GAP-P0-07 — Item-level return and refund

- **Classification / priority:** Fixture-only/blocked; P0 required journey.
- **Current evidence:** `requestReturn` immediately changes an in-memory order stage
  (`orders_providers.dart:40-57`); no return case, evidence, inspection or refund tracking API exists.
- **Canonical owner:** Commerce return case with Mercur allocation/seller decision, logistics reverse
  pickup, Tryton receipt/accounting and payment-provider refund result; final boundary needs Q-005A.
- **Missing models/APIs/events:** return case/line/reason/evidence/pickup/inspection/disposition,
  refund/adjustment; eligibility, create, review, receive, inspect, approve/reject, refund and track
  APIs; immutable transition events.
- **Impacted surfaces:** Customer apps/web, seller returns, admin/ops, warehouse, finance/support.
- **Dependencies / approvals:** Q-005A, windows/reasons/evidence, replacement policy, inspection and
  refund SLA, partial-return/tax/accounting policy.
- **Acceptance criteria:** Eligibility is line/quantity/actor specific; transitions are permissioned
  and versioned; refund starts only after approved trigger; customer sees actual provider status;
  replacement creates a linked new fulfilment obligation.
- **Required evidence:** State-machine, RBAC, partial-return, duplicate refund, inspection rejection,
  provider failure/retry and finance reconciliation tests.

### GAP-P0-08 — Seller operational surfaces

- **Classification / priority:** Missing; P0 for marketplace launch.
- **Current evidence:** Required seller journeys exist in `journey-graph.yaml:857-1503`, but no seller
  application package or routes exist.
- **Canonical owner:** Mercur for seller/onboarding/offers/allocations/commission/settlement; linked
  verification, Tryton, logistics and payments boundaries.
- **Missing models/APIs/events:** seller/KYC/document, catalogue mapping/offer/tier, seller order,
  fulfilment task, return inspection, settlement statement/payout; all corresponding commands/events.
- **Impacted surfaces:** New responsive seller portal plus warehouse/finance handoffs.
- **Dependencies / approvals:** KYC/provider/policy, seller roles, commission/settlement cycle,
  catalogue/stock ownership, fulfilment and returns responsibility.
- **Acceptance criteria:** Seller sees only authorised organisation data; onboarding has remediation;
  offer changes are versioned; orders progress through controlled fulfilment; return and settlement
  actions are auditable; destructive/financial actions require confirmation and step-up permission.
- **Required evidence:** Journey E2E tests, tenant isolation, accessibility/visual QA, audit-log tests,
  finance statement reconciliation and operational UAT.

### GAP-P0-09 — Marketplace administration and exception operations

- **Classification / priority:** Missing; P0 for marketplace launch.
- **Current evidence:** `surface-map.yaml` requires commerce-admin and ops-console; repository has
  neither. `integration-map.yaml` has no event/command definitions.
- **Canonical owner:** Medusa/Mercur administration with integration operations and audited RBAC.
- **Missing models/APIs/events:** allocation plan/version, manual assignment reason, exception,
  dead-letter, retry, reconciliation run/mismatch, operational note; receive/split/allocate/release,
  retry/replay/reconcile and controlled override commands.
- **Impacted surfaces:** Commerce admin, ops console, seller portal, support and finance.
- **Dependencies / approvals:** Operator role matrix, separation of duties, override policy, audit
  retention, alert/escalation ownership.
- **Acceptance criteria:** Every order is automatically or manually allocated exactly once; stale
  version updates fail; operators can identify and recover failed handoffs without DB edits; all
  overrides capture actor/reason/before/after.
- **Required evidence:** RBAC/SoD tests, event replay and poison-message tests, reconciliation drills,
  audit export and incident runbook exercise.

### GAP-P1-10 — Procurement Lists and Quick Order persistence

- **Classification / priority:** Device-local; P1 after core order foundation.
- **Current evidence:** Lists use SharedPreferences (`local_store.dart:169-177`); scan/upload are
  explicitly unwired. Quantity separation is implemented in prototype behavior.
- **Canonical owner:** Commerce business-account/procurement module.
- **Missing models/APIs/events:** account-scoped list/version/item/default quantity/share permission,
  import job/error row; CRUD/duplicate/version/import/barcode resolution APIs.
- **Impacted surfaces:** B2B Flutter/web and account admin.
- **Dependencies / approvals:** List sharing/RBAC, optimistic concurrency, import formats/limits,
  malware/parser provider and initial purchase-quantity rule.
- **Acceptance criteria:** Cross-device/account persistence; no tenant leakage; preserve independent
  `list.defaultQuantity`, `quickOrder.purchaseQuantity`, `cart.quantity`; stale edits conflict safely;
  imports never silently drop invalid rows.
- **Required evidence:** CRUD/RBAC/concurrency/import tests, app/web parity and migration tests.

### GAP-P1-11 — RFQ, quotation, negotiation and conversion

- **Classification / priority:** Device-local/fixture; P1.
- **Current evidence:** RFQ draft is SharedPreferences and submit creates `RFQ-nnnn` locally without
  an API (`b2b_trade_providers.dart:712-930`); received quotes are static UI.
- **Canonical owner:** Commerce RFQ/workflow plus Mercur seller routing/quotation.
- **Missing models/APIs/events:** RFQ/version/line/target/destination/attachment/invite, quotation
  revision/line/terms/validity, decision/approval/conversion; full draft-submit-route-respond-negotiate-
  accept-convert APIs and events.
- **Impacted surfaces:** Buyer Flutter/web, seller portal, approver/admin and order service.
- **Dependencies / approvals:** Eligibility/minimums, partial/alternate quote policy, response SLA,
  validity, negotiation and approval rules.
- **Acceptance criteria:** RFQ, cart and order stay distinct; revisions are immutable; quote compare
  uses landed total/terms; expired quote cannot be accepted; acceptance revalidates stock/credit/site
  and produces one canonical order.
- **Required evidence:** State-machine/RBAC/concurrency/expiry tests, seller-routing E2E, approval and
  idempotent conversion evidence.

### GAP-P1-12 — B2B accounts, credit, approvals, projects and sites

- **Classification / priority:** Fixture-only; P1.
- **Current evidence:** Credit/account/projects/team/approval providers are constants; project tabs
  include “coming soon”.
- **Canonical owner:** Commerce business account, credit and workflow; Tryton consumes account
  projection and owns accounting/receivables projection.
- **Missing models/APIs/events:** organisation/membership/role, credit facility/exposure/hold,
  approval policy/request/decision, project/site/budget/cost centre, PO uniqueness/version/audit.
- **Impacted surfaces:** B2B Flutter/web, account admin, finance/ERP and operator support.
- **Dependencies / approvals:** Credit and override policy, approver role/thresholds, PO rules, audit
  retention, project/site governance.
- **Acceptance criteria:** Credit is checked server-side at checkout; self-approval is policy-bound;
  stale actions fail; account/project/site scope is enforced; ERP receives only approved projection.
- **Required evidence:** RBAC/tenant, threshold matrix, concurrent approval, credit exposure and ERP
  projection reconciliation tests.

### GAP-P1-13 — Search and merchandising composition

- **Classification / priority:** Fixture-only; P1.
- **Current evidence:** Search is local filtering; home modules and trade offers are provider fixtures;
  no Meilisearch/CMS client or indexing worker exists.
- **Canonical owner:** Meilisearch derived search; CMS editorial composition; Commerce/Mercur own
  transactional values; Analytics supplies approved derived signals.
- **Missing models/APIs/events:** search document/query/facets/suggestions, index version; CMS page,
  module, audience, schedule, locale and commerce references; index/content publish events.
- **Impacted surfaces:** All Flutter/web discovery pages and CMS editorial UI.
- **Dependencies / approvals:** CMS/DAM provider, search ranking/synonyms, localization, sponsored
  placement/legal, editorial roles/approval.
- **Acceptance criteria:** CMS cannot write price/stock/seller/order; modules resolve commerce IDs at
  read time; only eligible products are indexed; locale/audience/schedule/fallback work; stale/broken
  links block publish.
- **Required evidence:** Index consistency, zero-result/facet, CMS preview/publish/rollback, locale,
  accessibility metadata and transactional-boundary tests.

### GAP-P1-14 — Customer account, support, documents and notifications

- **Classification / priority:** Device-local/fixture; P1.
- **Current evidence:** Profile/address/wishlist/payment/GST/ticket/settings use LocalStore;
  notifications/invoices/support are fixtures; invoice “PDF” is locally generated.
- **Canonical owner:** Commerce customer profile, Chatwoot support, Tryton invoice/document service,
  source-domain events plus automation/notification provider.
- **Missing models/APIs/events:** verified profile/address/wishlist/token reference/preferences,
  support conversation/SLA, signed document, notification event/dedupe/deep link/delivery/read.
- **Impacted surfaces:** Customer Flutter/web, support workspace, finance documents and notification
  operations.
- **Dependencies / approvals:** Chatwoot integration, messaging provider, privacy/retention, signed
  document policy, notification preference/legal exceptions.
- **Acceptance criteria:** Cross-channel account state is authorised; no raw payment credentials are
  stored; support links only authorised entities; downloads are signed/expiring; notifications are
  deduplicated and re-authorised at deep-link open.
- **Required evidence:** Account isolation, signed URL expiry, support authorisation, notification
  replay/preference and privacy export/deletion tests.

### GAP-P1-15 — Shared API contract and cross-channel compatibility

- **Classification / priority:** Missing; P1 architecture enabler.
- **Current evidence:** Flutter calls provider-shaped Medusa endpoints directly; no OpenAPI/GraphQL
  schema, generated SDK, API gateway/BFF, compatibility policy or standalone web source exists.
- **Canonical owner:** Shared experience API/composition boundary; domain services retain canonical
  ownership.
- **Missing models/APIs/events:** versioned customer/seller/operator APIs, standard error/problem,
  pagination, money/time/version/idempotency conventions, client capability/version policy.
- **Impacted surfaces:** Four customer channels plus seller/admin/ops.
- **Dependencies / approvals:** BFF vs modular API topology, authentication approach, API version/SLA,
  provider versions (currently null/proposed).
- **Acceptance criteria:** Clients do not join provider payloads for transactional decisions; Flutter
  and web pass the same consumer contract suite; breaking changes are detected before deploy.
- **Required evidence:** Published schema, lint/backward-compatibility check, generated client smoke
  tests, consumer-driven contracts and deprecation runbook.

### GAP-P1-16 — Durable integration, idempotency and reconciliation

- **Classification / priority:** Missing; P0 dependency for reliable order slice, otherwise P1.
- **Current evidence:** `integration-map.yaml` declares queue-and-retry but has empty commands/events;
  no outbox/inbox, workers, DLQ, replay or reconciliation source exists.
- **Canonical owner:** Integration platform/workers; each domain owns emitted facts and command
  outcomes.
- **Missing models/APIs/events:** event envelope, outbox/inbox, idempotency record, delivery attempt,
  DLQ item, reconciliation run/mismatch; replay/retry/quarantine/resolve operations.
- **Impacted surfaces:** All domains plus ops/admin observability.
- **Dependencies / approvals:** Broker/worker technology, retention/PII policy, SLOs and on-call.
- **Acceptance criteria:** At-least-once delivery cannot duplicate effects; ordering rules are
  explicit; poison messages are visible; replay is controlled/audited; scheduled reconciliation
  detects missing/mismatched projections.
- **Required evidence:** Fault-injection, replay, duplicate/out-of-order, dependency outage/recovery,
  DLQ and reconciliation game-day reports.

### GAP-P1-17 — Security, audit, observability and production operations

- **Classification / priority:** Missing; P0 security dependency/P1 platform track.
- **Current evidence:** No backend deployment/config, audit service, telemetry, SLO, backup or
  recovery implementation exists in this repository; stakeholder/volume targets are open.
- **Canonical owner:** Platform/Security/Operations with domain-owned audit events.
- **Missing models/APIs/events:** audit record, correlation/trace ID, security event, metric/SLO,
  feature flag, secret reference, retention class and data-subject operation.
- **Impacted surfaces:** Every service and operator surface.
- **Dependencies / approvals:** Data classification/residency, load targets, RTO/RPO, audit retention,
  approver identities, environments and release authority.
- **Acceptance criteria:** Least privilege, encrypted transport/storage, secret rotation, complete
  consequential-action audit, end-to-end trace, alerting/runbooks, tested backup/restore and safe
  rollout/rollback.
- **Required evidence:** Threat model, SAST/SCA/secret scan, pentest, load/soak, restore/DR test,
  observability screenshots, alert drill and release sign-offs.

## 5. Human approvals required before material implementation

1. Resolve **Q-005A**: detailed master catalogue, inventory, fulfilment and returns responsibility.
2. Approve identity/OTP provider and customer/business/seller/operator role model.
3. Approve landed-price formula, seller eligibility/ranking and tie-breakers.
4. Approve cart substitution/offer-change, split-order and reservation policies.
5. Select payment and logistics providers; approve COD, refund and reconciliation rules.
6. Approve B2B credit, PO, approval, RFQ and quotation policies.
7. Select CMS and DAM; Strapi remains a candidate, not an approved implementation.
8. Approve seller KYC, commission, settlement, return/dispute and payout policies.
9. Confirm launch geography, expected/peak volume, performance/SLA and RTO/RPO targets.
10. Name Product, Architecture, Security, Finance, Operations, UAT and Release approvers.

## 6. Recommended first slice

Do not start with all modules. First deliver the smallest production-shaped path:

`authenticated buyer → composed product/eligible offer → seller-aware cart → serviceable checkout →
payment sandbox → canonical order → seller allocation → inventory reservation → shipment placeholder/
sandbox → customer + admin order status`.

The slice must include failure, retry, idempotency, authorisation and reconciliation evidence before
it is called complete.
