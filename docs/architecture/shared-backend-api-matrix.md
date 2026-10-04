# BuildKart Shared Backend API Matrix

**Status:** Proposed contract baseline for review; not an approved API or ownership change  
**Consumers:** Flutter B2C/B2B, web B2C/B2B, seller portal, commerce admin, ops console

## 1. API principles

1. Clients consume versioned BuildKart business contracts, not ad hoc joins across Medusa, Mercur,
   Tryton, CMS and logistics.
2. Canonical writes stay with the owner recorded in the Data Contract.
3. Transactional commands require authentication, authorisation, validation, an idempotency key,
   correlation ID and optimistic version where applicable.
4. Money uses integer minor units plus ISO currency; times use UTC ISO-8601 plus explicit business
   timezone where scheduling is involved.
5. Errors use a stable problem shape: `code`, `title`, `detail`, `field_errors`, `retryable`,
   `correlation_id`, and optional `current_version`/`required_action`.
6. Read models include `version`, `generated_at`, source freshness and permitted actions. The UI does
   not infer permissions or transactional eligibility.
7. Personally identifiable, payment and KYC data are minimised; provider tokens/references replace
   raw sensitive credentials.

## 2. Customer/shared API matrix

| Capability | Proposed API operations | Canonical owner / composer | Consumers | Current state | Required events / evidence |
|---|---|---|---|---|---|
| Identity | `POST /v1/auth/password/sign-in`; `/otp/challenges`; `/otp/verify`; `/refresh`; `/logout`; `GET /sessions`; `DELETE /sessions/{id}` | Identity/Auth; Commerce entitlement projection | All | Missing; navigation-only UI | Auth/session/RBAC/security tests; `identity.authenticated`, `session.revoked` |
| Registration/consent | `POST /v1/registrations`; `/verifications`; `GET/POST /v1/consents` | Identity + Commerce + Privacy | Customer/seller | Missing | Duplicate identity, verification, versioned consent evidence |
| Business context | `GET /v1/me/contexts`; `POST /v1/me/active-context`; `GET /v1/business-accounts/{id}/permissions` | Commerce business account | B2B/seller/admin | Fixture | Tenant isolation and mode-switch contract tests |
| Product browse | `GET /v1/products`; `GET /v1/products/{id}` | Composed read model over Medusa/Mercur/Tryton/logistics | Customer channels | Partial Medusa product list | Contract fixtures, freshness and unavailable states |
| Eligible offers | `GET /v1/products/{variantId}/offers?quantity&destination&account` | Mercur-led composition | Customer channels | Fixture-generated | Ranking/eligibility/landed-price tests; `offer.*` |
| Search | `GET /v1/search/products`; `/suggestions`; `/facets` | Meilisearch derived index | Customer channels | Local filtering | Index consistency, relevance/facet tests; `search-index.*` |
| CMS composition | `GET /v1/compositions/{placement}?channel&locale&audience` | CMS composition service resolving Commerce IDs | Customer channels | Hardcoded | Preview/publish/expiry/fallback tests; `content.published` |
| Cart | `POST /v1/carts`; `GET /v1/carts/{id}`; `POST /lines`; `PATCH/DELETE /lines/{id}`; `POST /revalidate`; `POST /acknowledgements` | Medusa + Mercur projections | Customer channels | Partial, variant-only | Idempotency/concurrency/seller identity tests; `cart.*` |
| Checkout | `POST /v1/checkouts`; `POST /validate`; `GET /serviceability`; `GET /shipping-options`; `POST /complete` | Commerce orchestration | Customer channels | Missing | Totals/version/race/failure tests; `checkout.*` |
| Payment | `POST /v1/payment-sessions`; `POST /confirm`; `GET /{id}`; provider webhook endpoint | Payment integration; Commerce projection | Customer/admin | Mock | Sandbox/replay/reconciliation; `payment.*` |
| Orders | `GET /v1/orders`; `GET /v1/orders/{id}`; `POST /cancel-requests`; `POST /reorder-preview` | Medusa | Customer/admin | Fixture | Immutable snapshot/idempotent create/read auth; `order.*` |
| Shipments | `GET /v1/orders/{id}/shipments`; `GET /v1/shipments/{id}/events` | Logistics projection composed in Commerce | Customer/seller/admin | Fixture | Carrier webhook/state ordering/SLA evidence; `shipment.*` |
| Returns/refunds | `GET /v1/orders/{id}/return-eligibility`; `POST /v1/returns`; `GET /v1/returns/{id}`; evidence upload; `GET /refunds/{id}` | Commerce + Mercur/logistics/payment projections | Customer/seller/admin | In-memory status flip | State/RBAC/refund replay/reconciliation; `return.*`, `refund.*` |
| Profile/addresses | `GET/PATCH /v1/me`; CRUD `/v1/me/addresses` | Commerce customer | Customer channels | Device-local | Verification, ownership and concurrency tests |
| Wishlist | `GET/POST/DELETE /v1/me/wishlist` | Commerce customer profile | Customer channels | Device-local | Cross-device and access tests |
| Notifications | `GET /v1/me/notifications`; `POST /{id}/read`; preferences CRUD | Source events + automation/notification projection | Customer channels | Fixture | Dedupe, deep-link auth and preference tests |
| Support | `POST/GET /v1/support/tickets`; conversation/attachment operations | Chatwoot adapter | Customer/support | Device-local/in-memory | Entity authorisation, SLA and attachment security |
| Documents | `GET /v1/me/invoices`; `POST /exports`; signed download | Tryton + document service | Customer/finance | Fixture/local PDF | Signed URL, account scope, hash and audit evidence |

## 3. B2B API matrix

| Capability | Proposed API operations | Canonical owner | Current state | Critical rules / evidence |
|---|---|---|---|---|
| Procurement Lists | CRUD `/v1/business-accounts/{id}/procurement-lists`; duplicate; item CRUD; import job; barcode resolution | Commerce procurement | SharedPreferences | Independent list/session/cart quantities; RBAC/version/import tests |
| Quick Order | `POST /v1/quick-order/resolve`; `POST /v1/carts/{id}/batch-lines`; optional session read model | Commerce composition | Client state | Per-line validation; atomic/partial policy; unresolved-line report |
| RFQ drafts | CRUD `/v1/rfqs`; line/attachment CRUD; `POST /submit` | Commerce RFQ | SharedPreferences | RFQ distinct from cart/order; version and permission tests |
| Seller routing | `POST /v1/rfqs/{id}/route`; `GET /invitations` | Mercur | Missing | Eligibility and routing audit; SLA evidence |
| Quotations | Seller create/revise/withdraw; buyer list/compare/accept/reject/negotiate | Mercur quotation + Commerce approval | Static fixtures | Immutable revisions, validity, landed total and concurrency tests |
| Quote conversion | `POST /v1/quotations/{id}/convert-to-order` | Commerce orchestrator | Missing | Revalidate stock/credit/site/approval; one order per acceptance |
| Credit | `GET /v1/business-accounts/{id}/credit`; holds/override request; transactions | Commerce credit; Tryton AR projection | Fixture | Exposure/concurrency/finance approval/reconciliation |
| Approvals | CRUD/read `/v1/approval-requests`; `POST /approve|reject|cancel` | Commerce workflow | Fixture | No unauthorised self-approval; stale version fails; audit required |
| Projects/sites | CRUD projects/sites/members/budgets/material lists | Commerce business account/procurement | Fixture/partial | Tenant/RBAC/serviceability/version tests |
| PO/order metadata | Checkout PO/project/cost-centre fields; duplicate PO validation | Commerce; Tryton projection | Hardcoded/fixture | Account policy and override audit |

## 4. Seller portal API matrix

| Journey | Proposed operations | Owner | Required UX states | Release evidence |
|---|---|---|---|---|
| Onboarding/KYC | Create seller application; business profile; document upload; submit; remediation; status | Mercur + verification | Draft, uploading, submitted, needs-action, approved, rejected | Tenant/security, malware, document retention, reviewer audit |
| Catalogue mapping | Search master product; request new mapping; variant association | Mercur + Medusa | Matched, ambiguous, pending review, rejected | Q-005A-approved ownership and mapping audit |
| Offer management | CRUD offer/tier/MOQ/validity/channel/location; publish/unpublish | Mercur | Draft, validation error, scheduled, live, expired, suspended | Pricing precision, overlap/conflict and RBAC tests |
| Inventory view/update | Read authoritative/projection stock; submit permitted update/feed | Tryton boundary | Fresh/stale, sync pending, mismatch, blocked | Ownership policy, replay and reconciliation |
| Seller orders | List/detail/accept where policy permits; pick/pack/dispatch exceptions | Mercur allocation + logistics/Tryton | New, at risk, ready, dispatched, exception | State machine, SLA, label/manifest and isolation tests |
| Seller returns | Receive, inspect, evidence, disposition, adjustment proposal | Commerce/Mercur/Tryton | Awaiting receipt, QC, accepted/rejected, adjusted | Return policy/RBAC/refund separation tests |
| Settlements | Statement list/detail; fee/tax/order lines; dispute; payout status | Mercur + Tryton/Finance | Calculating, approved, posted, paid, mismatch, disputed | Calculation and accounting/payout reconciliation |

## 5. Commerce admin and operations API matrix

| Capability | Proposed operations | Owner | Backend UI/UX requirement | Evidence |
|---|---|---|---|---|
| Allocation | Receive order, preview split, auto/manual allocate, release, reassign/hold | Mercur + Medusa | Queue + order workbench; reasoned overrides; version conflict state | Exactly-once/idempotency/RBAC/audit tests |
| Seller review | Review onboarding/KYC, request remediation, approve/suspend | Mercur | Side-by-side evidence, checklist, risk flags, decision confirmation | Four-eyes/SoD and audit export |
| Catalogue moderation | Review mappings/offers/content violations | Mercur/Medusa | Diff, validation reasons, bulk action with preview | Permission and batch rollback |
| Fulfilment exceptions | Inventory shortage, carrier failure, SLA breach, split/reallocation | Ops composition | Prioritised queue, ownership, timer, runbook action | Recovery drill and no-DB-edit proof |
| Return exceptions | Eligibility override, disputed inspection, failed pickup/refund | Commerce orchestration | Case timeline, evidence, financial impact, allowed actions | SoD, duplicate-refund and audit tests |
| Integration operations | Delivery attempts, DLQ, retry/replay/quarantine, payload metadata | Integration layer | Correlated event timeline; guarded replay | Fault injection/replay/reconciliation |
| Reconciliation | Start/view runs; mismatches; assign/resolve/export | Integration + Finance | Domain-specific mismatch workbench | Daily run evidence and ageing SLA |
| Configuration | Versioned business rules, effective dates, approval, rollback | Owning domain | Draft-review-approve-publish; scope/precedence preview | Approval, conflict and rollback tests |
| Audit | Search/export consequential actions by actor/entity/correlation | Platform/domain audit | Immutable timeline with access controls | Completeness/tamper/retention evidence |

## 6. Event and integration contract baseline

Every event should contain:

`event_id`, `event_type`, `schema_version`, `occurred_at`, `producer`, `aggregate_type`,
`aggregate_id`, `aggregate_version`, `correlation_id`, `causation_id`, tenant/account scope, and a
minimal payload without unnecessary PII.

Minimum event families:

- `identity.*`, `customer.*`, `business-account.*`, `consent.*`
- `product.*`, `offer.*`, `price.*`, `inventory.*`, `reservation.*`
- `cart.*`, `checkout.*`, `payment.*`, `order.*`, `allocation.*`
- `shipment.*`, `return.*`, `refund.*`
- `procurement-list.*`, `rfq.*`, `quotation.*`, `approval.*`, `credit.*`
- `seller.*`, `commission.*`, `settlement.*`, `payout.*`
- `content.*`, `search-index.*`, `notification.*`, `support.*`

Consumers must use inbox deduplication; producers must use a transactional outbox or equivalent.
Retries need bounded exponential backoff, DLQ/quarantine, operator visibility and reconciliation.

## 7. Cross-channel state policy

| State | Persistence |
|---|---|
| Identity, consent, business membership, roles | Canonical backend; never device-only |
| Cart and checkout | Backend; optional encrypted local cache is non-canonical |
| Procurement Lists/RFQ/quotes/projects | Backend, account-scoped and versioned |
| Orders/payments/shipments/returns/refunds | Canonical owner plus governed projections |
| Wishlist/profile/addresses/preferences | Backend when cross-channel continuity is promised |
| Recently viewed/search history | Device-local by default; optional consented account sync |
| Temporary form edits/filter selection | Client session unless explicitly saved as a draft |

## 8. Versioning and delivery recommendation

Start with OpenAPI 3.1 contracts and generated Dart/TypeScript clients. Use asynchronous events for
cross-owner projections, not synchronous client joins. A BFF/composition layer may optimise channel
reads, but cannot become an ungoverned second canonical writer.
