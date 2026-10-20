# CHG-072 — conversation layer and cart build

**Environment:** staging only

**Production:** unauthorized

**Status:** Phase A complete; Phases B–D not started; cart handoff awaits explicit authorization.

## Scope

Conversation becomes a layer over the existing pages in both channels:

- One **Discuss** action on product cards, search results, PDP and cart lines.
- A slide-over dock that preserves the current page, filters and scroll position.
- A shared list with quantities and proposals.
- B2C household projects: owner plus up to three participants, each with their own OTP sign-in.
- B2B continues to use the procurement workspace and its approval rules.

Building the cart is deliberately separate. It is Phase 3 handoff and is **not** implemented yet.

## Phase A — governance

Completed:

| Artefact | Change |
|---|---|
| `solution/decisions/ADR-client101-012.yaml` | Accepted household scope, conversation dock and the cart-handoff boundary |
| `docs/architecture/collaborative-workspace-threat-model.md` | Added household actors, threats, invariants and open privacy decisions |
| `contracts/data-contract.yaml` | Added `workspace-invitation`, household membership projection rules, project channel and handoff notes |
| `changes/CHG-072.yaml` | Revision 2 with approved decisions and a six-phase plan |

### Decisions carried into the design

- Owner plus three participants; participants chat, share products and propose quantity changes.
- Owner-only checkout, address, phone, GST and payment visibility.
- Email invitation plus OTP; single-use, expiring, revocable.
- Participant quantity edits are proposals; the owner accepts.
- B2B cart build is buyer or account admin only, on a current approval.
- Chat never creates an order.

### What Phase A deliberately did not do

- No schema change.
- No API change.
- No Flutter change.
- No deployment.
- No Phase 3 revalidation or cart handoff.

## Phase B — household schema

Applied to the staging `buildkart_workspace` database on 2026-10-20. All statements are idempotent
and re-run by `ensureSchema()` on every service boot.

| Change | Detail |
|---|---|
| Scope | `workspace_scope_type_check` now allows `business_account` and `household` |
| Roles | `workspace_member_role_check` adds `owner`; `member` is the invited participant |
| Channel | `channel_kind_check` adds `project` |
| Owner | Partial unique index allows one active `owner` per workspace |
| Invitations | `workspace_invitation` with hashed token, status, expiry, acceptance and revocation |
| Invite uniqueness | One live pending invitation per project and invitee email |
| Participant cap | Trigger raises `23514` when a fourth active household participant is inserted |

### Verification

The full schema was executed twice inside one transaction to prove idempotency, then applied.

| Check | Result |
|---|---|
| Schema re-run twice | pass |
| Household project with owner + 3 participants | pass |
| Fourth participant | rejected (`23514`) |
| Second active owner | rejected (`unique_violation`) |
| `project` channel on a household | pass |
| Existing B2B workspaces | **2**, unchanged |
| Arjun members / Shakti members | **3 / 1**, unchanged |
| B2B channels | approvals + procurement + procurement, unchanged |
| Messages | **22**, unchanged |
| Invitations before use | 0 |
| Workspace container health | healthy |

No B2B row was rewritten, and no household row was left behind by the rolled-back fixture tests.

### What Phase B did not do

- No API route, role check or invitation endpoint yet.
- No Flutter change.
- No commerce or cart write.
- No cart handoff.

## Pending phases

| Phase | Work | Gate |
|---|---|---|
| B | `household` scope, project channel, owner/member roles, invitations with expiry/revocation and a three-participant cap | **Complete** |
| C | Consumer actor path, invitation endpoints, owner-only redaction, participant proposal rules | Ready to start |
| D | Conversation dock, Discuss capture on five surfaces, B2C project and invite UI, shared list | After C |
| E | Revalidation, difference preview, acknowledged cart build, idempotency | **Explicit human authorization required** |
| F | Staging verification, isolation tests, Chrome 390×844 and 360×800 | After D, and E if authorized |

## Open privacy decisions

- Retention and deletion of an invitee email that never joins.
- Whether a participant can leave and be replaced.
- Retention of household conversation content and shared lists.
- Operator support visibility and redaction for household projects.
- Terms and privacy copy for inviting a third party into a purchase conversation.
