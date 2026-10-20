# Collaborative Workspace — Threat Model (Pilot 1)

**Status:** Proposed for CHG-070; security and legal/privacy approval required  
**Scope:** B2B bounded-staging pilot  
**Out of scope:** B2C household collaboration, seller messaging, attachments, production release

## 1. Assets

- Workspace membership projections and business-account scope.
- Channel messages, mentions, product-share references and read cursors.
- Purchase drafts, immutable revisions and material instructions.
- Approval requests, decisions, approver identity and commercial hash.
- Checkout-handoff records, validation references, Medusa cart/order references.
- Pricing, seller/offer, tax, stock, MOQ and delivery context read through Commerce.
- Notification projections and audited operator reads.

## 2. Actors

| Actor | Trust |
|---|---|
| Requester / B2B buyer | Authenticated business-account member with limited actions |
| Buyer / account owner | May accept/edit drafts and request approval |
| Approver | May approve/reject/request changes; cannot edit the approved revision |
| B2B account admin | Manages membership, not commercial approval by default |
| Support operator | Designated, redacted, read-only troubleshooting |
| Marketplace/ERP/finance operator | Separate scopes; no workspace commercial mutation |
| Experience API | Signed service-to-service caller and composition boundary |
| External attacker | Untrusted; may hold a stolen token or craft requests |

## 3. Threats and controls

| Threat | Impact | Pilot control |
|---|---|---|
| Cross-tenant workspace read | Data leak | Server-derived tenant/account scope on every query; PostgreSQL RLS deny-by-default; negative tests |
| Client supplies role/account/seller id | Privilege escalation | Ignore client identity fields; resolve from signed session/service context |
| IDOR on channel, draft, proposal or handoff | Unauthorized read/write | Object lookup always constrained by workspace/account; 404 outside scope |
| Stale proposal overwrites a newer revision | Commercial loss | Expected version/If-Match; one same-version proposal succeeds; return current version and diff |
| Approval replayed on a changed payload | Unauthorized purchase | Approval bound to revision id + commercial hash; material change creates a new revision and invalidates approval |
| Approver edits the revision they approve | Separation-of-duties failure | Server rejects approver edits; audit event |
| Self-approval where prohibited | Control bypass | Server-enforced approver policy; no UI-only restriction |
| Silent price/stock/MOQ/seller change | Wrong purchase | Fresh Commerce revalidation; structured diff; block or reapprove; no automatic substitution |
| Chat command creates an order | Uncontrolled commerce | No order endpoint in Workspace; only validated handoff through Commerce; approval required |
| Duplicate checkout handoff | Duplicate order | Revision/hash-derived idempotency key; unique handoff constraint; Commerce completion idempotency |
| WebSocket leaks another tenant's feed | Data leak | Authenticate upgrade; authorize channel subscription; revoke on membership change; cursor scoped |
| Reconnect misses/duplicates events | Inconsistent UI | Monotonic event sequence, cursor replay, client deduplication |
| Outbox replay or poison event | Notification noise/state drift | Inbox deduplication, bounded retry, DLQ, operator visibility; events cannot alter commercial state |
| Notification exposes price/GST/address on lock screen | PII/commercial leak | Minimal FCM payload; deep link only; no prices, GST or addresses |
| Support operator reads unrestricted messages | Privacy breach | Explicit support conversation scope; redaction; audited read; time-bound access |
| Message retention exceeds policy | Compliance breach | Retention/legal-hold decision required before pilot expansion; deletion and audit design |
| Service token theft | Full workspace compromise | Short-lived signed service context; least privilege; rotation; no shared admin token |
| Malicious product-share snapshot | Stored XSS/unsafe content | Store reference + display snapshot only; render through governed components; no raw HTML |
| Attachment malware (future) | Malware distribution | Attachments excluded from Pilot 1; future scanning/signed URLs required |

## 4. Security invariants

1. Every row and query is tenant/account scoped.
2. Roles, account ids and seller ids come only from signed server context.
3. A proposal never mutates a draft until an authorised buyer accepts or edits it.
4. Approval is reconstructable from an immutable revision and commercial hash.
5. Material changes invalidate approval; comments do not.
6. Checkout is allowed only for an approved, freshly revalidated revision.
7. One revision creates at most one canonical order.
8. WebSocket, NATS, FCM and outbox failures never change commercial success.
9. Activity events are append-only.
10. No production credentials or real payment are used in staging.

## 5. Open decisions requiring approval

- Message and approval-evidence retention, legal hold and deletion.
- Exact single-approver policy and self-approval prohibition.
- Production realtime topology and rate limits.
- Operator audited-read scope and redaction policy.
- Separate Workspace database vs dedicated schema.
- Production service-to-service identity and key rotation.

## 6. Staging limitations

- Synthetic identities and test data only.
- Simulated payment and no real order fulfilment.
- Cloudflare Access is not yet protecting the operator host; this is a known gap.
- Production release remains separately human-authorised.
