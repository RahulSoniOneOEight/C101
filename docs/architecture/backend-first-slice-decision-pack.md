# BuildKart First Backend Slice — Decision and Approval Pack

**Change Contract:** `CHG-017`  
**Revision:** 5 — proposed staging-payment simulation amendment  
**Status:** Affected-role approvals recorded; bounded staging runtime authorised; gates remain blocked  
**Target outcome:** One fully traceable staging marketplace order through functional Commerce, Marketplace and ERP services  
**Applicable surfaces:** Flutter app and web, with seller and operator workflows using the same canonical backend

## 1. Decision requested

Approve, reject or amend `CHG-017` as the first production-shaped backend increment:

```text
Authenticated buyer
  → composed product and eligible seller offers
  → explicit seller selection
  → seller-aware canonical cart
  → durable checkout attempt
  → price, tax, serviceability and inventory revalidation
  → time-bound inventory reservation
  → explicit staging simulator or later approved provider payment
  → canonical Medusa order
  → Mercur allocation confirmation
  → customer order confirmation
  → Tryton reservation/accounting projection
  → sandbox shipment and tracking
  → customer, seller and operator status
```

Revision 5 authorises contract drafting only until affected-role approvals and a separate bounded
runtime authorisation are recorded. It does not authorise provider credentials, production payment,
production release, or unrelated P1/P2 journeys.

The sequence describes business milestones. The approved state machine must define exact provider
calls, failure handling and recovery between milestones.

### First-slice boundaries

| Area | Proposed scope |
|---|---|
| Catalogue | Functional Medusa variants plus actual staging Mercur seller offers; optional CMS editorial enrichment remains non-transactional |
| Buyer types | B2C and B2B context; no credit, approval purchasing or partial payment |
| Seller checkout | One seller per checkout |
| Multi-seller cart | Seller-aware lines may coexist; checkout operates on one explicitly selected seller group |
| Fulfilment | One warehouse/fulfilment context, one destination and one shipment per order |
| Payment | Explicit simulated adapter for development/staging; Razorpay remains a deferred candidate; COD disabled |
| Logistics | One sandbox provider, configured serviceability area and supported shipment lifecycle |
| Currency/language | INR; stable error codes with English and Hindi customer messages |
| Operations | Shared-backend order queue/workbench, seller fulfilment view and integration exception queue |
| Recovery | Checkout cancellation, reservation expiry/release, simulated late-result/refund transitions; real payment/refund evidence deferred |
| Exclusions | Split fulfilment, automatic seller substitution, full returns, settlements, RFQ conversion, CMS/DAM and production release |

Deferred return and settlement workflows still require order snapshots for seller, payment, tax and
commission-policy references.

### Functional staging boundary

- Medusa persists the canonical staging cart, checkout reference and test order; fixtures and local
  success flags cannot substitute for Commerce behavior.
- Mercur supplies actual staging sellers/offers, evaluates eligibility and records/confirm allocations.
- Tryton supplies actual staging ATP and reservation, commit/release, stock movement and approved
  staging accounting projections. Test clearing must remain distinct from bank receipt.
- The shared backend correlates checkout, order, allocation, reservation, movement and accounting
  references and exposes reconciliation to app/web, seller and operator surfaces.
- Simulated payment is the only simulated transactional dependency. Its markers propagate to every
  downstream order, allocation, inventory, accounting, audit and operational projection.
- Dedicated staging endpoints and credentials are mandatory. Any route toward production ERP, live
  payment, production logistics or production customer notification fails closed.

### CMS app-content boundary

A provider-neutral CMS contract may supply editorial app-shell content such as banners, onboarding,
help, FAQs, campaign copy and approved legal/content links. CMS content is read through the shared
backend and may be cached as a derived projection. CMS must not own or determine products/variants,
seller offers, eligibility, price, tax, stock, checkout permission, payment, allocation, order,
shipment or accounting state. CMS provider selection, DAM workflows and production publishing remain
outside the transactional staging increment and cannot block order processing.

## 2. Decisions that must be recorded

| ID | Decision | Recommended baseline | Alternatives / consequence | Required approvers | Status |
|---|---|---|---|---|---|
| D-017-01 | Q-005A slice ownership | Commerce is the commercial domain and owns the order aggregate/lifecycle through Medusa with governed BuildKart extensions; Medusa owns product/variant identity and cart/checkout persistence; Mercur owns seller/offer/allocation; Tryton owns ATP, reservation and warehouse movement; invoice/accounting ownership remains evidence-gated until D-017-12 and D-017-19 conditions close; providers own execution evidence while Commerce owns normalised projections | A different owner changes schemas, projections and operational UI | Product, Architecture, Marketplace, ERP Ops, Finance/Tax | Approved with open evidence conditions |
| D-017-02 | Shared API topology | Versioned BuildKart experience API/composition layer over owner services; OpenAPI 3.1; generated Dart/TypeScript clients | Direct provider APIs make clients join data and increase drift; GraphQL requires equivalent governance | Architecture, Security | Approved |
| D-017-03 | Identity | Approved IdP/Auth boundary with OTP challenge APIs, secure refresh/revocation, explicit buyer/business-account/seller/operator memberships and Commerce business-context projection | Medusa-native auth may be used only if it satisfies B2B/seller/operator RBAC and session requirements | Product, Security, Architecture | Approved with provider evidence pending |
| D-017-04 | Cheapest seller | Lowest **eligible landed payable price** for exact variant, quantity, account and destination | Item-price-only ranking can mislead buyers when freight/tax differs | Product, Marketplace, Finance/Tax, Legal | Approved |
| D-017-05 | Seller tie-break | Full quantity → earliest promise → preferred/contract seller → rating → cancellation rate → stable seller ID | Any different priority must be deterministic and explainable | Product, Marketplace Ops | Approved |
| D-017-06 | Manual seller choice | Buyer may choose another eligible seller; persist choice; never silently replace | Automatic substitution requires explicit separate policy and consent | Product, Marketplace Ops | Approved |
| D-017-07 | Cart identity | `variant_id + seller_id + offer_id + fulfilment_context`; immutable offer snapshot and validation version | Variant-only identity cannot fulfil marketplace orders safely | Architecture, Product | Approved |
| D-017-08 | Inventory reservation | Reserve before prepaid payment starts; atomically commit before customer confirmation; configurable proposed 15-minute TTL; expiry/release and late-payment recovery are idempotent; verify Tryton concurrency capability | A later reservation point risks paid-but-unfulfillable orders | Product, ERP Ops, Finance | Approved with capability evidence pending |
| D-017-09 | Split fulfilment | Enforce one seller, fulfilment context, destination and shipment per checkout; preserve other seller groups; unsupported physical splits enter an exception workflow without added charges/promises | Split fulfilment remains a separately approved increment | Product, Marketplace, Logistics | Approved with implementation evidence pending |
| D-017-10 | Payment slice | Replaceable backend adapter; explicitly labelled simulator in development/staging; success/failure/pending/duplicate/late/refund transitions; production fails closed; Razorpay stays deferred | Simulation proves orchestration only and cannot pass provider G3 | Finance, Security, Product | Approved with amendment; evidence pending |
| D-017-11 | Logistics slice | Select one provider sandbox for serviceability, rate, shipment and tracking; normalise webhooks | A fake shipment may support development but cannot pass G5 | Logistics, Operations, Security | Approved; provider evidence pending |
| D-017-12 | Tax/display | Approved tax boundary calculates tax using persisted basis, jurisdiction, rates, rounding and version; policy must name invoice issuer, issuance timing, numbering, corrections and reconciliation owner before invoice enablement | Unresolved tax or invoice semantics block checkout/invoice enablement | Finance/Tax, Product, Legal | Approved with policy evidence pending |
| D-017-13 | Offer change | Block changed line and require explicit acceptance/new seller/removal; no silent higher charge | Tolerance-based auto-update requires approved threshold and disclosure | Product, Legal, Marketplace | Approved |
| D-017-14 | Operational override | Action-level permissions, optimistic locking, reason and immutable audit; refund, manual financial adjustment, forced allocation/terminal transition and provider-evidence exception closure require an independent second approver | Uncontrolled manual DB edits or role-wide blanket permission are prohibited | Security, Operations, Finance | Approved with amendment |
| D-017-15 | Reliability target | At-least-once delivery with idempotent effects; dependency outcomes classified as retryable, terminal or ambiguous; ambiguous outcomes are queried/reconciled before repetition | Exactly-once transport claims are not relied upon | Architecture, Operations | Approved |

### Revision 5 controls for D-017-01 through D-017-15

- **D-017-01:** Commerce owns the commercial order aggregate and lifecycle; Medusa is the selected
  implementation foundation with governed BuildKart extensions. Medusa owns stable product/variant
  identity and cart/checkout persistence. Tryton owns ATP, reservation, warehouse movement, invoice
  and accounting records, subject to Finance/Tax approval. Provider results remain immutable evidence
  and do not grant ownership of unrelated Commerce fields.
- **D-017-02:** Responses include allowed actions, entity version and freshness; breaking v1 changes
  require migration/version approval.
- **D-017-03:** OTP expiry/attempt/abuse controls, refresh rotation/revocation, tenant membership and
  stronger authentication for approved financial/operator privileges are mandatory. Buyer membership
  binds a subject to a personal context; business-account membership binds subject, account, role and
  active status; seller membership binds subject, seller and permitted fulfilment actions without
  cross-seller access; operator membership grants action-level internal permissions and stronger
  authentication where policy requires it. Provider capability evidence remains mandatory.
- **D-017-04:** Unknown freight, tax or fees prevent a cheapest claim. Multi-line ranking compares the
  complete seller-group total, not independently cheapest lines.
- **D-017-05:** Partial quantity is ineligible for this slice. Missing quality metrics cannot improve
  rank. Persist ranking-policy version and explanation.
- **D-017-06:** Persist selected seller and selection source. Ineligibility blocks checkout and offers
  explicit alternatives; no silent substitution.
- **D-017-07:** Cart identity is `variant_id + seller_id + offer_id + fulfilment_context_id` and stores
  UOM, offer snapshot, validation version/expiry and buyer-context reference.
- **D-017-08:** Cart does not reserve. Checkout reserves before payment. Proposed TTL is a configurable
  15 minutes; configuration changes require audit and do not extend an existing reservation;
  no extension from client activity. Commit and expiry are compare-and-set transitions against the
  same active reservation version, so only one can win. Confirmation requires committed reservation.
  Late captured payment triggers fresh reservation or paid-but-unfulfillable refund recovery.
- **D-017-09:** Split fulfilment is disabled. One seller/context/destination/shipment per checkout;
  other seller groups remain in the cart. A provider-reported physical split is not silently accepted:
  it creates an operational exception and cannot add customer charges or change promises.
- **D-017-10:** Payment contracts expose a replaceable server-side adapter. Development/staging may
  use only an explicitly labelled simulator with `simulated_accepted`, never `captured`. It supports
  success, failure, pending, duplicate and late results plus simulated refund transitions. Adapter
  mode is server-controlled. Production must fail startup or disable checkout when simulation is
  configured, and no provider failure may fall back to simulation. Razorpay remains a planned,
  deferred candidate; provider webhooks, queries, capture and refunds remain unverified. COD is disabled.
  Payment simulation does not simulate Medusa, Mercur or Tryton; those services must execute functional
  staging behavior before a simulated result can drive approved downstream transitions.
- **D-017-11:** Persist booking intent before provider call and resolve ambiguous outcomes by provider
  lookup before retry. Booking failure creates an exception without erasing an accepted order.
- **D-017-12:** Proposed B2C prices are tax-inclusive; B2B prices tax-exclusive and labelled. The
  approved tax boundary calculates tax and persists jurisdiction, rates, basis, line/order rounding
  and calculation version. Before invoice enablement, Finance/Tax and ERP evidence must identify the
  legal invoice issuer, issuance trigger/timing, numbering authority, Tryton/accounting writer,
  credit/debit-note correction and reconciliation owner. Issued invoices are not overwritten. Clients
  never calculate tax.
- **D-017-13:** Commercial changes show previous/revised seller, quantity, price, tax, freight and
  promise. Acceptance creates a new snapshot/version; no silent higher charge.
- **D-017-14:** Each action has its own permission. Consequential actions require expected version,
  reason and audit. Refunds, financial adjustments, forced allocation/terminal transitions and
  provider-evidence exception closure require an independent second approver. Idempotent retries may
  be performed by one authorised operator. No operator may manufacture provider success.
- **D-017-15:** External side effects use unique operation keys. Retryable failures use bounded retry;
  terminal failures stop and require resolution; ambiguous failures are queried/reconciled before
  repetition. Any non-native outbox adapter requires approval.

### Additional decisions — approval and evidence status

| ID | Decision baseline | Required approvers | Status |
|---|---|---|---|
| D-017-16 | Persist a durable, versioned checkout attempt before reservation/payment calls | Architecture, Product | Approved |
| D-017-17 | Staging confirmation requires a canonical test order, committed reservation, confirmed allocation and backend-recorded simulated acceptance; provider/production confirmation still requires captured payment | Product, Architecture, Marketplace, Finance | Approved with amendment; evidence pending |
| D-017-18 | Keep checkout, payment, allocation, inventory, shipment and accounting statuses separate | Architecture, Operations | Approved |
| D-017-19 | Approve accounting posting triggers, entry ownership, account mappings, reversals and reconciliation; confirm whether Tryton creates entries or receives governed entries; placement does not imply revenue recognition | Finance/Tax, ERP Operations | Approved with policy evidence pending |
| D-017-20 | Include simulated late-result and refund workflow transitions for staging; simulated completion is not a financial refund; real recovery/refund evidence remains deferred | Finance, Product, Operations | Approved with amendment; evidence pending |
| D-017-21 | Keep Razorpay as a planned candidate with provider/version/capability evidence deferred; simulation cannot satisfy provider readiness | Architecture, Security, Integration Owners | Approved with amendment; provider/version evidence pending |
| D-017-22 | Record named approver, outcome, timestamp and exact revision/hash; Release Authority is accountable and Architecture/Security approve the mechanism, while other roles acknowledge governance through their decision records | Release Authority, Architecture, Security | Approved with amendment |
| D-017-23 | Separate staging-simulation acceptance, provider-payment G3 and production readiness; simulator evidence cannot pass the original provider-payment gate | Architecture, Operations, Release Authority | Approved with amendment; gate evidence pending |
| D-017-24 | Store commission-policy reference and order snapshot; settlement execution remains excluded | Marketplace, Finance | Approved |

## 3. Provider and environment details required

Decision-role approvals do not establish provider readiness. The current provider ADRs are `proposed`
and versions are unspecified. Provider selection, exact
versions, sandbox capability evidence, environment owners and the concurrency/load profile remain
explicitly pending. Record:

- Medusa, Mercur, Tryton and PostgreSQL target versions; Meilisearch version only if used, otherwise
  an explicit first-slice exclusion.
- Identity/OTP provider and sandbox credentials owner.
- Razorpay candidate and later sandbox methods; provider evidence is deferred and does not block the
  explicitly approved staging-simulator increment, but remains mandatory for provider G3/production.
- Logistics provider, sandbox geography and supported shipment operations.
- Event broker/queue, object storage and email/SMS choices.
- Local development, CI, integration, staging and pre-production topology.
- Environment-specific Medusa, Mercur and Tryton endpoints, service identities and routing guards.
- Secret manager, observability stack and on-call ownership.
- Expected average/peak orders, catalogue/SKU/seller counts and traffic profile.
- RPO/RTO, API latency/availability and projection-lag targets.

CMS/DAM selection is not required to create the first transactional order. The slice should use a
small governed product seed and must not implement Strapi merely to unblock commerce.

### Proposed operating targets — approval pending

| Metric | Proposed baseline |
|---|---|
| Initial / growth test volume | 1,000 / 10,000 orders per month |
| Initial catalogue | 10 sellers × 30 SKUs; variants counted separately |
| Transactional API availability | 99.9% monthly, dependency failures reported separately |
| Composed reads / local cart mutations | p95 ≤ 750 ms / p95 ≤ 500 ms at approved load |
| Checkout preparation | p95 ≤ 5 seconds including approved dependency calls |
| Projection freshness | 95% within 30 seconds; alert after 2 minutes |
| Reconciliation | Every 5 minutes for pending/unknown; daily financial reconciliation |
| Reservation expiry / failure alert | 15 minutes / within 5 minutes |
| Proposed production recovery | RPO ≤ 5 minutes; RTO ≤ 60 minutes, subject to restore proof |

Peak request rate and concurrency still require an approved load profile.

## 4. Proposed first-slice contract package

Review drafts of the first two artifacts and representative fixtures now exist. Before runtime
implementation, they must be amended to the approved decisions and the full package completed:

1. `openapi/buildkart-experience-v1.yaml`
2. `asyncapi/buildkart-events-v1.yaml` or an equivalent governed event schema package
3. Identity/business-context schema
4. Composed product/eligible-offer schema
5. Seller-aware Cart and Checkout schema
6. Payment session/result and webhook-normalisation schema
7. Canonical Order and marketplace-allocation schema
8. ATP/reservation and shipment-projection schema
9. Standard problem/error, pagination, money, timestamp, version and idempotency conventions
10. Consumer contract fixtures for Flutter, web, seller and operator clients
11. Provider-neutral CMS app-shell content schema and freshness/fallback semantics

Revision 5 additionally requires checkout-attempt/state-machine, reservation/commit/release, recovery
refund, tax/invoice/accounting projection, permission/audit and seller fulfilment contracts. Money
uses integer minor units and currency; quantities include unit and precision; timestamps use UTC;
idempotency keys are tenant/operation scoped and bound to a request fingerprint.

Schemas are contracts, not provider payload mirrors. Each field must identify its canonical source,
freshness semantics and whether it is an immutable snapshot or current projection.

## 5. Minimum backend administration UX for the slice

### Order queue

- Search/filter by order, customer/account, seller, payment, allocation and exception state.
- Default view prioritises blocked and ageing work, not vanity metrics.
- Saved filters and URL-addressable state for support/operations handoff.

### Order workbench

- Immutable commercial snapshot and separate live payment/shipment projections.
- Seller allocation groups, inventory reservation, payment and shipment status.
- Correlated event timeline with freshness and provider references.
- Allowed actions supplied by backend permissions and current entity version.

### Integration exception queue

- Dependency, error code, retryability, attempt/next retry, entity and correlation ID.
- Guarded retry/replay/quarantine; reason required; raw sensitive payload hidden by default.
- Resolution links to runbook and reconciliation outcome.

### Seller fulfilment view

- Show only allocated orders and approved customer/delivery fields.
- Provide only permitted fulfilment and shipment actions.
- Exclude other sellers' data and unrestricted financial controls.

### UX acceptance baseline

- Responsive desktop/tablet; keyboard complete; WCAG 2.2 AA.
- Loading, empty, permission denied, stale version, degraded dependency and recoverable error states.
- No colour-only status; destructive/financial actions have consequence and confirmation.
- Optimistic conflict explains what changed; no last-write-wins for consequential state.
- Direct database edits are not an operational workflow.

### Action-level permission baseline

| Action | Minimum control | Independent second approver |
|---|---|---|
| Retry known idempotent integration operation | Operator permission, expected version, reason and audit | No |
| Quarantine/release integration delivery | Integration-operations permission and reason | Policy-dependent |
| Force allocation or terminal state | Specific override permission and full impact preview | Yes |
| Initiate/approve recovery refund | Separate initiate and approve permissions | Yes |
| Manual financial adjustment | Finance adjustment permission and immutable evidence | Yes |
| Close conflicting provider-evidence exception | Operations plus applicable Finance/Security permission | Yes |

The same actor cannot satisfy both approval steps. Backend enforcement is mandatory; hiding UI
controls is not authorisation.

## 6. Transaction and recovery baseline

### Staging-simulator state machine

1. Authenticate buyer and resolve business context.
2. Create or recover durable checkout attempt by idempotency key.
3. Validate cart ownership, selected seller group and expected version.
4. Revalidate offer, price, tax, serviceability and delivery promise.
5. Obtain Tryton reservation using a unique operation key.
6. Persist accepted commercial snapshot and reservation reference.
7. Invoke the server-selected staging simulator and persist an explicitly simulated result.
8. Create or recover canonical Medusa order linked to checkout attempt.
9. Confirm Mercur allocation and atomically commit the active reservation.
10. Confirm a staging test order only when canonical order, confirmed allocation, committed reservation
    and backend-recorded `simulated_accepted` hold; mark payment, refund and order data as simulated.
11. Book shipment and project tracking asynchronously.

COD remains disabled until eligibility, collection and reconciliation policies are approved. If
subsequently enabled, replace payment-session handling with backend eligibility, use `cod_due`, then
create/recover order, confirm allocation/reservation and continue fulfilment.

The simulator is available only in development/staging. Production fails closed if it is configured;
clients cannot select adapter mode or manufacture success. Simulated refunds test workflow behavior
only and never constitute financial evidence. The later provider state machine retains verified
captured payment, webhook/query reconciliation and real refund requirements.

Every simulated acceptance drives real staging Commerce, Marketplace and ERP transitions. Downstream
records preserve `payment_mode=simulated`, `test_data=true`, environment and correlation references.
Tryton posts only to an approved staging test-clearing treatment; no record may claim bank receipt.

Reservation commitment and expiry are atomic compare-and-set operations against reservation ID,
version and state. Expiry may release only an active, uncommitted reservation; commitment may succeed
only before expiry. A late captured payment starts a new reservation attempt and otherwise creates a
durable recovery-refund case without customer confirmation.

### Independent status dimensions

| Dimension | Example states |
|---|---|
| Checkout | validating, awaiting_acceptance, reserved, payment_pending, finalising, completed, recovery_required, expired, cancelled |
| Payment | pending, simulated_accepted, simulated_refund_pending, simulated_refunded; later provider-only authorised, captured, unknown, refund_pending, refunded |
| Allocation | pending, confirmed, failed |
| Inventory | unreserved, reserved, committed, released, exception |
| Shipment | not_requested, booking_pending, booked, in_transit, delivered, exception |
| Accounting | pending, projected, exception |

Authorisation and capture are never treated as interchangeable. Enable only provider-supported states.

### Confirmation prerequisites

- Canonical order ID and immutable accepted commercial snapshot.
- Confirmed seller allocation and committed inventory reservation.
- For staging only, backend-recorded simulated acceptance with test-order markers.
- For provider/production checkout, verified captured prepaid payment; simulator evidence is prohibited.
- Durable evidence that downstream work can resume.

Shipment booking and accounting projection may remain asynchronous and must show separate status and
freshness.

### Recovery requirements

| Failure | Required response |
|---|---|
| Commercial change | Require acceptance before payment |
| Reservation unavailable | Block payment with recoverable checkout result |
| Simulated payment failure/expiry | Release reservation idempotently and retain test-data markers |
| Simulated pending/late result | Reconcile by simulator operation key; do not create duplicate effects |
| Payment after reservation expiry | Re-reserve; otherwise enter refund recovery |
| Order timeout | Recover by checkout reference before retry |
| Simulated acceptance but finalisation fails | Persist test recovery case; bounded retry; simulate refund workflow if fulfilment cannot be secured |
| Allocation failure | Do not confirm; retry/investigate or unwind payment/reservation |
| Shipment booking failure | Preserve accepted order; queue exception and communicate delay |
| Accounting failure | Preserve order; retry/reconcile and surface exception |
| Duplicate event | Return prior result with no repeated effect |
| Stale operator action | Reject and return current state |

### Dependency-failure classification

| Class | Meaning | Required handling |
|---|---|---|
| Retryable | Provider positively reports a transient failure and repeating is safe with the same operation key | Bounded backoff, attempt limit, alert/DLQ after exhaustion |
| Terminal | Provider positively rejects the operation or policy makes it invalid | Stop automatic retry; expose actionable reason and unwind as approved |
| Ambiguous | Timeout/transport failure leaves external outcome unknown | Query by operation/provider reference before any repeat; reconcile or escalate |

Adapters must map provider-specific errors into one of these classes and retain the original evidence.

## 7. Acceptance gates and approval checklist

| Gate | Required evidence |
|---|---|
| G0 — Governance | Revision 5 affected decisions, staging-simulator boundary, pending-provider register and verification plan approved; real-payment evidence is non-blocking only for staging |
| G1 — Contracts/access | Validated contracts/generated clients, shared app/web/operator backend connectivity, auth, RBAC and isolation tests |
| G2 — Checkout integrity | Functional Medusa/Mercur cart, offers, eligibility, landed totals and actual Tryton reservation evidence |
| G3-SIM — Staging simulation | Simulator success/failure/pending/duplicate/late/refund tests and production fail-closed guard; does not satisfy G3 provider payment |
| G3 — Provider payment | Real sandbox payment, verified webhook, query reconciliation and refund evidence; remains blocked/deferred |
| G4 — Order/allocation | Persisted Medusa test order, confirmed Mercur allocation, committed Tryton inventory, correlation and retry safety |
| G5 — Fulfilment/accounting | Tryton staging movements/test-clearing accounting and cross-system reconciliation; production logistics remains blocked |
| G6 — Operations | Queues/workbench, audited actions, alerts, load evidence, runbooks and restore proof |

G0 approves governance and the verification plan only. It does not assert provider capability or
runtime readiness. G1–G6 require subsequent implementation/sandbox evidence and permit release review
only; production release remains separately authorised.

- [x] Product approved Revision 5 D-017-10, D-017-17 and D-017-20 amendments.
- [x] Architecture approved Revision 5 D-017-17, D-017-21 and D-017-23 amendments.
- [x] Security approved Revision 5 D-017-10 and D-017-21 amendments.
- [x] Finance approved Revision 5 D-017-10, D-017-17 and D-017-20 amendments.
- [x] Marketplace approved Revision 5 D-017-17 amendment.
- [x] Operations approved Revision 5 D-017-20 and D-017-23 amendments.
- [x] Integration Owners approved Revision 5 D-017-21 amendment.
- [x] Release Authority approved Revision 5 D-017-23 gate separation.
- [x] Marketplace Operations decision approval recorded for seller eligibility and exception handling.
- [x] ERP Operations decision approval recorded for ATP/reservation/projection semantics.
- [x] Finance/Tax decision approval recorded; tax/accounting/provider evidence remains open.
- [x] Logistics decision approval recorded; sandbox provider evidence remains open.
- [x] Named Release Authority accepts that production release remains separately gated.
- [ ] `CHG-017` status is changed from `proposed` only by the governed human approval process.

Every decision approval records the decision ID, exact outcome/baseline, named accountable approver,
evidence, UTC timestamp, revision/hash, conditions and unresolved dependencies. Silence is not
approval. A rejected or deferred required decision blocks G0. An approved-with-amendment decision
remains blocking until its amendment is incorporated into the referenced revision and its explicit
blocking conditions are closed. Batch submissions are permitted only when they preserve an individual
outcome and role set for every decision. Release Authority is accountable for this mechanism;
Architecture and Security approve it. Other roles acknowledge it through their own decision records.
Approval from one role never substitutes for another required role unless the named human is explicitly
authorised for each recorded role.

## 8. Stop conditions

Implementation must stop and return for decision if:

- two systems claim canonical write ownership for the same field;
- provider capabilities cannot support the approved state machine or idempotency requirement;
- a client must infer seller eligibility, price, stock, permission or order success;
- payment/order/allocation effects cannot be reconciled;
- tax or invoice semantics remain unresolved;
- recovery could duplicate charge, order, allocation, shipment or accounting entry;
- a proposed shortcut would expose cross-tenant data or require routine database edits;
- the slice would report success using a fixture rather than a canonical result;
- implementation expands into excluded journeys without approval.

## 9. Execution sequence

1. Record named Revision 5 outcomes for D-017-10, D-017-17, D-017-20, D-017-21 and D-017-23.
2. Approve the staging-simulator boundary and retain Razorpay as deferred provider evidence.
3. Amend and approve contracts, state machines and recovery policies.
4. Implement identity, business context and tenant isolation.
5. Implement product composition, offers and seller-aware cart.
6. Implement durable checkout validation and reservation.
7. After separate runtime authorisation, implement and test the staging simulator and production guard.
8. Implement canonical order finalisation and Mercur allocation.
9. Add accounting, shipment and tracking projections.
10. Complete seller/operator interfaces and recovery actions.
11. Demonstrate G0, G1, G2, G3-SIM and G4–G6; later complete provider G3 before prepaid production review.
12. Submit the bounded slice for separate production-release review.
