# Collaborative Workspace — Threat Model (Pilot 1)

**Status:** Proposed for CHG-070; security and legal/privacy approval required  
**Scope:** B2B bounded-staging pilot, plus the CHG-072 household and conversation extension in section 7

**Out of scope:** seller participation, attachments, order completion from chat, production release

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

## 7. Household extension (CHG-072)

**Status:** proposed for CHG-072; security and legal/privacy review required before production.
**Scope:** B2C household project collaboration, conversation dock, and cart handoff.
**Explicitly excluded:** order completion from chat, seller participation, attachments, payments
between participants.

### 7.1 Additional assets

- Household project identity, owner and participant membership projections.
- Invitations: invitee email, token, expiry, revocation state and acceptance evidence.
- Participant-visible conversation and shared-list projections.
- Owner-only checkout data: addresses, phone, GST details and payment methods.
- Cart-handoff evidence: revalidation result, acknowledged differences and idempotency key.

### 7.2 Additional actors

| Actor | Trust |
|---|---|
| Household owner | Authenticated consumer; invites, accepts proposals and checks out |
| Household participant | Authenticated consumer invited by the owner; may chat, share and propose |
| Invitee (not yet a member) | Holds an invitation but no project authority until OTP sign-in |
| External attacker | Untrusted; may hold a stolen token, a leaked invitation or a guessed project id |

### 7.3 Additional threats and controls

| Threat | Impact | Control |
|---|---|---|
| Participant reads owner address, phone, GST or payment | Privacy breach | Server-side redaction on every participant projection; owner-only fields never serialised for a participant role |
| Participant places the order | Unauthorized purchase | Checkout requires the owner role; participant checkout returns 403 |
| Participant invites further people | Scope creep | Invitation endpoint restricted to the owner; participant attempts return 403 |
| Leaked or forwarded invitation joins the project | Unauthorized membership | Single-use, expiring, revocable token; acceptance requires the invited email to complete OTP |
| Invitation replay after revocation | Unauthorized membership | Token bound to invitation row + status check; revoked or consumed tokens fail closed |
| Household scope used to reach a business account | Cross-tenant leak | Scope type is part of every query; household membership never satisfies business-account checks |
| Participant enumerates projects by id | Data leak | Membership-constrained lookup returns 404 outside scope |
| Shared list becomes commerce truth | Wrong purchase | List stores intent only; cart handoff revalidates Commerce and shows differences |
| Silent price or stock change at handoff | Wrong purchase | Revalidation diff with explicit acknowledgement; no automatic substitution |
| Double handoff creates duplicate lines | Duplicate purchase | Idempotency key derived from accepted revision; unique constraint; retry-safe |
| Chat message triggers an order | Uncontrolled purchase | No order endpoint in Workspace; cart handoff stops at the canonical cart |

### 7.4 Additional invariants

1. A household participant is never serialised owner checkout or payment data.
2. Household and business-account scopes never satisfy each other's authorization checks.
3. Invitations are single-use, expiring and revocable, and acceptance requires the invited identity.
4. Only the owner mutates an accepted revision; participant edits are proposals.
5. Cart handoff revalidates Commerce and requires acknowledgement of any material difference.
6. Cart handoff creates at most one set of lines per accepted revision.
7. Chat never completes checkout and never creates an order.

### 7.5 Open decisions

- Invitation retention and deletion of an invitee email that never joins.
- Whether a participant may leave and be replaced, and the resulting audit trail.
- Retention of household conversation content and shared lists.
- Whether a household project is visible to operator support, and under what redaction.
- Terms and privacy copy for inviting a third party into a purchase conversation.
