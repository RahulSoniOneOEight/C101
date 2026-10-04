# BuildKart Backend Production Implementation Plan

**Status:** Proposed implementation sequence; requires Change Contracts and human approval before
material business/data/integration implementation.

## 1. Recommended delivery structure

Build a modular shared backend around domain boundaries rather than separate app/web backends:

- **Commerce:** Medusa modules/workflows for customer, catalogue projection, cart, checkout, order,
  B2B account, procurement, credit and approvals.
- **Marketplace:** Mercur modules for seller, offer, allocation, quotation, commission and settlement.
- **ERP:** Tryton adapters/projections for ATP, reservations, warehouse/accounting/AR/AP.
- **Experience API:** versioned customer/seller/operator contracts and composed read models.
- **Integration workers:** outbox/inbox, provider adapters, retries, DLQ and reconciliation.
- **Search/content:** Meilisearch indexing and an approved CMS/DAM composition boundary.
- **Operational web products:** Next.js B2C/B2B, seller portal and admin/ops console, all bound to the
  governed UI registry and the same API contracts as Flutter.

Provider versions, deployment topology and repository package layout are decisions for an approved
architecture Change Contract; this document does not select them.

## 2. Workstream zero — decisions and contract freeze

**Goal:** Remove ambiguity before implementing canonical writes.

1. Resolve Q-005A and update Data Contract/entity/dependency maps through governance.
2. Approve identity, staging-payment simulation, deferred provider payment, logistics and editorial CMS boundaries.
3. Approve seller-ranking/landed-price, reservation, split-order, returns/refunds, B2B credit/RFQ,
   commission and settlement policies.
4. Define launch geography, tax display, expected/peak load, SLO, RTO/RPO and data residency.
5. Name business, architecture, security, finance, operations, UAT and release approvers.
6. Publish initial OpenAPI/event schemas and compatibility policy.

**Exit:** Approved Change Contracts/ADRs; Data Contract no longer draft for the slice; P0 API/event
schemas reviewed; threat model and test strategy accepted.

## 3. Phase 1 — platform and identity foundation

### Backend

- Establish environments, secret management, migrations, health/readiness and structured telemetry.
- Implement identity/session/OTP, business contexts, RBAC and tenant isolation.
- Implement audit envelope, correlation IDs, idempotency store and transactional outbox/inbox.
- Add CI gates: schema lint/backward compatibility, unit/integration/contract/security checks.

### Backend UI/UX

- Create authenticated admin shell with role-aware navigation and audit visibility.
- Provide session/device management, permission-denied, stale-version, maintenance and dependency-
  outage states.
- Use the BuildKart indigo token system and registry components; operational actions show impact,
  require reasons where consequential, and never rely on colour alone.

**Exit:** Identity gate passes; unauthorised tenant access is impossible in automated tests; event
delivery and audit proof exist.

## 4. Phase 2 — production-shaped marketplace order vertical slice

### 2A. Product, offer, availability and search projection

- Seed/ingest approved product variants into Medusa.
- Implement Mercur seller/offer projection and deterministic eligibility/ranking.
- Project Tryton ATP with timestamps and stale-state behavior.
- Expose one composed product response; index eligible discovery fields in Meilisearch.

### 2B. Seller-aware cart and checkout

- Extend cart identity with variant/seller/offer/fulfilment context and offer snapshot.
- Add server validation for quantity, MOQ/case pack, price validity, stock and serviceability.
- Implement seller grouping, shipping/tax/totals and change acknowledgement.
- Implement reservation policy and expiry/release worker.

### 2C. Staging payment simulation and canonical order

- Define a replaceable server-side payment adapter; use only the explicitly labelled simulator in
  development/staging for this increment.
- Support simulated success/failure/pending/duplicate/late/refund transitions with idempotency and
  test markers. Production fails closed if simulation is configured.
- Persist the canonical test order in functional staging Medusa with one idempotent order command and
  immutable commercial snapshot; no fixture or client flag may create success.
- Emit order/allocation/accounting/fulfilment events through outbox.
- Defer Razorpay webhook/query/refund integration to provider G3; simulation cannot satisfy that gate.

### 2D. Allocation, ERP and logistics

- Create and confirm one actual staging Mercur allocation from order lines; split fulfilment remains disabled.
- Execute actual staging Tryton reservation commit/release, stock movement and approved test-clearing accounting projection.
- Reconcile checkout, Medusa order, Mercur allocation and Tryton reservation/movement/accounting references.
- Prevent production ERP, payment, logistics and customer-notification effects through environment routing guards.

### Customer and operator UX

- Replace inferred success with canonical order result and recoverable pending/failure states.
- Build admin order workbench: timeline, payment, seller groups, reservation, shipment and event trace.
- Build allocation exception queue with reasoned manual actions and optimistic concurrency.
- Display projection freshness and degraded-state warnings to operators, not raw provider payloads.
- Bind Flutter, web, seller and operator screens to the same shared backend and preserve test markers.
- Optionally compose editorial app-shell content through a provider-neutral CMS contract; CMS failure
  cannot affect transactional eligibility or order processing.

**Exit demonstration:** One authenticated B2C and one B2B staging test order is traceable from actual
Mercur offer/eligibility through cart, simulated payment, persisted Medusa order, confirmed Mercur
allocation and Tryton reservation/movement/test-clearing accounting projection. Flutter, web and the
operator workbench observe the same correlated state and test markers. G3-SIM passes; provider G3 and
production payment remain deferred. Failure/retry/replay and unsafe-routing guards also pass.

## 5. Phase 3 — seller portal and marketplace operations

### Backend

- Seller onboarding/KYC/remediation and approval.
- Master-product mapping and seller offer/tier/MOQ/validity management.
- Seller order, pick/pack/dispatch and exception workflows.
- Commission calculation, settlement statement, accounting post and payout reconciliation.

### Seller UI/UX

- **Home:** task-first dashboard for orders at risk, KYC actions, inventory mismatches and payouts.
- **Onboarding:** resumable checklist with document status, clear remediation and review timeline.
- **Catalogue:** dense table plus focused editor; bulk actions always preview impact/errors.
- **Orders/Fulfilment:** queue → order workbench → pick/pack/label/dispatch; barcode-friendly and
  keyboard accessible; exceptions remain visible until resolved.
- **Returns:** evidence and inspection checklist with financial consequence before confirmation.
- **Settlements:** transparent order/fee/tax/adjustment lines, downloadable statement and dispute link.

### Admin/ops UI/UX

- Seller review queue, document comparison, four-eyes approval where configured.
- Allocation, fulfilment, return, settlement and reconciliation exception workbenches.
- Guarded retry/replay controls tied to correlation IDs and runbooks.

**Exit:** All six governed seller journeys pass tenant/RBAC, accessibility, audit and operational UAT.

## 6. Phase 4 — B2B procurement and commercial workflows

### Backend

- Account-scoped Procurement Lists with versions, sharing and import jobs.
- Quick Order batch resolution while preserving independent list/session/cart quantities.
- Durable RFQ, seller invitations, quotation revisions, comparison, negotiation and acceptance.
- Credit/PO/approval/project/site policies integrated into checkout.
- Idempotent accepted-quote conversion to canonical order.

### Buyer/seller/admin UX

- Preserve existing Operate Lists vs Manage Lists separation across Flutter and web.
- Show unresolved/import errors per row; never silently drop or replace SKUs.
- RFQ workspace remains distinct from Cart and compares landed totals, validity and terms.
- Approval inbox exposes requester, reason, policy, version, allowed actions and audit timeline.

**Exit:** Cross-device list continuity and RFQ-to-order flow pass, including expiry, rejection,
partial seller response, stale version and insufficient-credit branches.

## 7. Phase 5 — returns, account services, CMS and reverse flows

Return/refund P0 foundations should begin alongside Phase 2 and must pass before launch.

- Complete line-level cancellation, reverse logistics, seller inspection, refund and replacement.
- Move profile, addresses, wishlist, documents, tickets, notifications and preferences to canonical
  services where cross-channel continuity is promised.
- After approval, implement CMS/DAM editorial workflow, preview, scheduling, localization and media
  accessibility metadata; keep transactional values outside CMS.
- Add support context and event-driven notifications with dedupe and preference enforcement.

**Exit:** Return/refund and account cross-channel release gates pass; editorial publish/rollback and
transactional-boundary tests pass.

## 8. Phase 6 — web channels and full production readiness

- Build dedicated responsive Next.js B2C and B2B experiences against the shared contract. Flutter
  Web files in the current app do not satisfy the selected Next.js direction.
- Run shared consumer contracts across Flutter and web.
- Complete performance, load/soak, accessibility, security, privacy, backup/restore and DR tests.
- Run payment/logistics outage and reconciliation game days.
- Complete UAT for customer, seller, admin, finance, warehouse and support roles.

## 9. Backend UI/UX best-practice checklist

- Design around **tasks and exceptions**, not provider databases.
- Every page has loading, empty, permission-denied, stale, partial/degraded and recoverable-error states.
- Show canonical state separately from payment/shipment/projection state.
- Display entity ID, version, freshness, owner and correlation ID where operationally useful.
- Use optimistic locking; on conflict show what changed and allow safe refresh/reapply.
- Require reason and confirmation for overrides, reassignments, refunds, suspensions and replay.
- Enforce role/tenant scope server-side; hiding a button is not authorisation.
- Provide keyboard operation, visible focus, WCAG 2.2 AA contrast/targets and screen-reader labels.
- Tables support filters, saved views, pagination, export permissions and URL-addressable state.
- Bulk actions provide dry-run counts, validation errors and partial-result reports.
- Never expose raw secrets, full payment credentials or unnecessary KYC/PII.
- Keep audit/event timelines readable, immutable and linked across order/allocation/payment/shipment.

## 10. Suggested engineering increments

| Increment | Demonstrable outcome | Must not be claimed yet |
|---|---|---|
| I1 | Authenticated user and tenant-safe empty admin shell | Production identity readiness without security evidence |
| I2 | Real composed product/offer/ATP read | Purchasability without cart revalidation |
| I3 | Seller-aware canonical cart | Reserved inventory or guaranteed price |
| I4 | Sandbox checkout creates one canonical order | Production payment approval |
| I5 | Allocation + ERP + logistics projections visible | Operational readiness without retries/reconciliation |
| I6 | Seller fulfilment and admin exception recovery | Marketplace launch without returns/settlement |
| I7 | Return/refund and finance reconciliation | Release without all gate sign-offs |

## 11. Definition of done for every backend feature

- Approved contract and owner; migration/rollback plan.
- Positive, validation, permission, stale-version, dependency-failure and retry behavior.
- Unit, integration, consumer-contract and E2E tests.
- Audit, metrics, logs, traces, alert and runbook.
- Accessibility and responsive QA for associated UI.
- Fixture/prototype behavior clearly disabled outside development.
- Human acceptance and release evidence linked to the applicable gate.
