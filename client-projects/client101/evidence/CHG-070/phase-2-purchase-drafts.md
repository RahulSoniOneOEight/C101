# CHG-070 — Phase 2 purchase drafts, proposals and approvals

**Date:** 2026-10-20
**App build:** `e04e300` (`phase2-purchase-drafts-2`)
**Workspace code:** `5f3fad9`
**Environment:** staging only
**Status:** Phase 2 complete on staging; awaiting human review
**Production:** unauthorized

## Outcome

Phase 2 adds the commercial collaboration loop inside the existing Workspace bounded context:

1. A buyer shares a live catalogue product reference into Procurement.
2. A purchase draft is materialised as an immutable revision with a server-computed SHA-256
   commercial hash.
3. A proposer submits a change proposal against an expected version.
4. A buyer or account admin accepts, edits-and-accepts, rejects or cancels the proposal. Acceptance
   creates exactly one new immutable revision and supersedes any earlier approval.
5. A buyer requests approval for one specific revision and hash.
6. An approver decides approve / reject / request changes. The requester cannot self-approve and an
   approver cannot propose or edit the revision.

The workspace never owns carts, orders, payments, products, prices, sellers or notification inboxes.

### Runtime changes

| Component | Detail |
|---|---|
| Workspace schema | `message_reference`, `purchase_draft`, `draft_revision`, `draft_line_revision`, `proposal`, `approval_request`, message idempotency key |
| Workspace API | draft list/create/read, revision read, proposal create/accept/reject/cancel, approval request/decision, product share and share preview |
| Experience API | proxies `/v1/purchase-drafts/*`, `/v1/proposals/*`, `/v1/approval-requests/*` |
| App | Workspace surface switch between Conversation and Purchase draft; line proposal controls; proposal accept/reject; revision-bound approval request and approver decision controls |
| B2B PDP | Share to Procurement uses the live catalogue identity and opens the workspace |
| Seed | One two-line Arjun purchase draft (`drf_arjun_staging`), immutable revision 1 |

### Commercial integrity rules

- Acceptance requires the proposal's expected version to equal the draft's current version; otherwise
  the proposal is marked `stale` and the client receives `409` with the current version.
- Every accepted proposal creates one new revision, stores the canonical payload and line snapshots,
  and marks any pending or approved approval `superseded`.
- Approval is bound to `revision_id` and `commercial_hash`; a mismatch is rejected with `409`.
- The requester is recorded from signed context and cannot approve their own request.
- Activity events are append-only and every mutation writes a transactional outbox row.
- Tenant scope is enforced on every draft, proposal, approval and share query.
- Product shares use an idempotency key; replay returns the same message.

### Known Phase 2 limitations

- Draft line prices are immutable staging snapshots. Phase 3 must revalidate availability, price,
  MOQ, tax, shipping and serviceability against commerce before checkout.
- Buyer quantity changes are proposals that the buyer explicitly accepts. A separate direct-edit
  endpoint is deferred so every commercial mutation is auditable.
- Product shares create a reference message only; add-to-draft from a share is deferred.
- Checkout preview, difference acknowledgement, cart handoff, order creation and notification
  projection are not implemented.

## Verification

| Check | Result |
|---|---|
| Workspace and Experience API TypeScript typechecks | pass |
| Flutter analyze | clean |
| Full non-golden Flutter suite | **241 passed** |
| Workspace model parsing (string versions, line snapshots) | pass |
| Buyer proposal and approval-request widget journey | pass |
| Approver bound-revision decision widget journey | pass |
| Workspace smoke (signed actors, tenant isolation, share, proposal, approval) | **pass** |
| Proposal acceptance creates exactly one revision | pass (v6 → v7 → v8 → v9) |
| Approval is bound to the current revision and hash | pass |
| Later material revision supersedes a pending/approved approval | pass |
| One pending approval per draft | pass (unique partial index; duplicate request returns `409 approval-already-pending`) |
| Approver cannot propose | **403** |
| Approver UI decision | **Approved** on Chrome |
| Product share UI from B2B PDP | **201**, snackbar + Procurement share card |
| Share idempotency replay | same message id |
| Cross-tenant draft read | **404** |
| Cross-tenant share | **404** |
| Shakti workspace draft pane | explicit empty state, no Arjun data |
| Chrome 390×844 | no overflow, no API console errors |
| Chrome 360×800 | no overflow, no API console errors |
| Staging final state | draft v11, two lines, approval `pending` for human review |
| Outbox publisher | 0 pending rows; `proposal.created`, `proposal.accepted`, `approval.requested`, `approval.approved`, `draft.revision.created` published to NATS |

### Pre-existing issue observed

Twelve catalogue image URLs under `https://ops-staging.pinakaplay.cloud/static/` return `404`
(for example `homerun-action-tesa-hdhmr-board-plain-8-x-4.webp` and `jktyre-ranger-a-t.png`). These
are catalogue asset gaps, not workspace API failures; the workspace and draft surfaces still load.
The asset gap remains open for the catalogue owner.
