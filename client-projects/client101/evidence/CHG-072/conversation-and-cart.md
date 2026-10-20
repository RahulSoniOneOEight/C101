# CHG-072 — conversation layer and cart build

**Environment:** staging only

**Production:** unauthorized

**Status:** Phases A–C complete. Phase D implemented and verified by automated tests and a release
web build, awaiting staging deployment and Chrome acceptance. Cart handoff awaits explicit
authorization.

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

## Phase C — household API

Deployed as workspace and Experience API commit `e7e84ba` from
`/opt/buildkart-releases/release-e7e84ba`; `current` now points there.

### Scope and role model

- Membership is resolved per workspace. A business-account workspace still requires the actor's
  business account to match the scope; a household workspace is authorized by membership alone.
- Writing uses the actor's **workspace role**, not a global pilot role.
- Household roles are `owner` and `member`. B2B keeps `buyer`, `admin` and `approver`.
- A participant proposal is decided only by the owner; B2B proposals remain buyer/admin.
- Household projects have no approval step and return `approval-not-supported`.

### Endpoints

| Method | Path | Rule |
|---|---|---|
| `POST` | `/v1/household-projects` | Consumer creates a project; maximum three active projects per owner |
| `POST` | `/v1/workspaces/{id}/invitations` | Owner only; email invite; returns a one-time staging token |
| `GET` | `/v1/workspaces/{id}/invitations` | Owner only; statuses, participant count and capacity |
| `POST` | `/v1/workspaces/{id}/invitations/{invitationId}/revoke` | Owner only |
| `POST` | `/v1/workspace-invitations/accept` | Invitee's own verified email must match; token is single-use |

The Experience API now signs `email` into the workspace actor context and proxies household routes
for consumer identities, without weakening the business-account path.

### Verification

| Check | Result |
|---|---|
| Household smoke (`test:household`) | **pass** |
| Create project | pass |
| Invite and accept three participants | pass |
| Fourth participant | **409 participant-limit-reached** |
| Participant posts a message; owner reads it | pass |
| Participant proposes a quantity change | pass |
| Participant decides own proposal | **403** |
| Owner accepts; one new revision, quantity 3 | pass |
| Household approval request | **403 approval-not-supported** |
| Participant lists invitations | **403 owner-required** |
| Outsider reads the project | **404** |
| Invitation email mismatch | **403 invitation-email-mismatch** |
| Revoked invitation token | **404** |
| Participant projection carries `owner_user_id` | **no** |
| B2B smoke (`test:smoke`) | **pass** (tenant isolation, proposals, approvals) |
| Live end-to-end through the Experience API | pass as `rsoni001@gmail.com` + `rs.jgd108@gmail.com` |

The household smoke deletes its project. The live project was deleted after the check; the workspace
database contains only the two B2B workspaces and zero invitations. The B2B smoke advanced the Arjun
fixture draft to v14 as designed; no schema, ownership or commerce state changed.

### What Phase C did not do

- No Flutter surface.
- No product capture from a page yet.
- No commerce or cart write.
- No cart handoff.

## Phase D — conversation layer

Implemented on 2026-10-20. **Not deployed.** No commerce or cart write was added.

### What changed

| Area | Change |
|---|---|
| Shell overlay | `ConversationDockHost` is mounted inside the D2C and B2B shells, so the routed page stays mounted underneath and keeps its scroll, filters and selection |
| B2B routes | `/b2b/pdp/:id`, `/b2b/offers` and `/b2b/price-advantage` receive the same dock, covering the PDP surfaces outside the shell |
| Discuss capture | `ProductCard`, `CompactProductItem`, `TradeProductCardCompact`, B2C and B2B search rows, both PDPs and both cart lines expose one `Discuss` action |
| B2C projects | Create a project, accept an invitation code, owner-only participant sheet with email invitation, one-time staging token, participant count and revoke |
| Shared list | Owner and participant lines, quantity proposals, owner accept/reject, explicit "not the cart" copy and a disabled Phase E cart-build entry |
| Redaction | The dock shows no address, phone, GST, payment or checkout data; the cart-build entry is owner/buyer/admin only |
| B2B roles | An approver can discuss and share product references but cannot create or change purchase intent |
| Household revisions | A participant may initialize an empty shared list and propose its first line; only owner acceptance creates the immutable revision |
| Duplicate capture | A product variant is unique per conversation, enforced by a channel-scoped `dedupe_key`; replay returns the original message |

### Contract and governance

- `contracts/openapi/buildkart-workspace-v1.yaml` is now `1.1.0-proposed`: household project,
  invitation, accept/revoke, project channel, owner/member roles, share dedupe and proposal receipt.
- `experience/design/ui-implementation-registry.yaml` registers the conversation dock, shared list
  and household invitation surfaces as staging prototypes resolved through the existing component
  path.
- `workflow/workflow-state.yaml` records CHG-072 as the active change with Phase E blocked and
  production unauthorized.

### Verification

| Check | Result |
|---|---|
| `flutter analyze` | **pass**, no issues |
| `flutter test` (app) | **pass**, 259 tests, including new dock/participant tests |
| `flutter test` (`agency_flutter_ui`) | **pass**, 52 tests |
| Tests at 390×844 and 360×800 | **pass**; dock opens, page state survives, no overflow exception |
| Participant capture test | **pass**: chat share, empty aggregate, `add_line` proposal at v0, zero owner accepts |
| Undo capture guard | **pass**: a stale clear request cannot drop a newer capture |
| `flutter build web --release` (staging defines) | **pass** |
| Workspace TypeScript typecheck | **pass** |
| YAML parse (OpenAPI, workflow, registry) | **pass** |
| Golden snapshots | refreshed deliberately; visual diffs inspected and limited to the new Discuss chrome/launcher |
| Workspace household smoke | **not run locally**; requires the staging `WORKSPACE_DATABASE_URL` and service secret |
| Staging deployment | **not performed** |
| Chrome acceptance | **not performed**; required before Phase D is called complete |
| Cart write / order creation | **none** |

### Deliberate limits

- The Phase E button is disabled with an explicit authorization message. No revalidation, cart
  materialisation or order completion exists.
- Golden snapshots are platform-specific and excluded from CI; the local refresh does not replace
  Chrome acceptance.
- The B2B Home header hit-testing defect remains a separate, known issue; the dock is shell-level
  and does not reuse that header control.

## Pending phases

| Phase | Work | Gate |
|---|---|---|
| B | `household` scope, project channel, owner/member roles, invitations with expiry/revocation and a three-participant cap | **Complete** |
| C | Consumer actor path, invitation endpoints, owner-only redaction, participant proposal rules | **Complete** |
| D | Conversation dock, Discuss capture on five surfaces, B2C project and invite UI, shared list | **Implemented; deployment and Chrome acceptance pending** |
| E | Revalidation, difference preview, acknowledged cart build, idempotency | **Explicit human authorization required** |
| F | Staging verification, isolation tests, Chrome 390×844 and 360×800 | After D, and E if authorized |

## Open privacy decisions

- Retention and deletion of an invitee email that never joins.
- Whether a participant can leave and be replaced.
- Retention of household conversation content and shared lists.
- Operator support visibility and redaction for household projects.
- Terms and privacy copy for inviting a third party into a purchase conversation.
