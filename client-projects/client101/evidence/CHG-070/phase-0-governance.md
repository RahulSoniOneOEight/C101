# CHG-070 — Phase 0 governance and contracts

**Date:** 2026-10-20
**Source note:** `C:\Users\LENOVO\Desktop\BuildKart-Collaborative-Workspace-Implementation-Note.md`
**Status:** proposed; service code not started
**Environment:** B2B bounded-staging pilot design
**Production:** unauthorized

## Outcome

Phase 0 of the implementation note is complete as a reviewable governance package. It establishes
Workspace as a proposed bounded context, records ownership and non-duplication boundaries, defines the
client API and event direction, and records the security/retention decisions that must be approved
before service code starts.

No runtime, database, deployment or commerce behavior was changed in this phase.

## Artefacts

| Artefact | Purpose |
|---|---|
| `client-projects/client101/changes/CHG-070.yaml` | Change Contract, scope, proposed decisions, open decisions, required tests |
| `client-projects/client101/solution/decisions/ADR-client101-011.yaml` | Proposed bounded-context and transport decision |
| `client-projects/client101/contracts/data-contract.yaml` | Proposed workspace entities and ownership, added as a governed amendment |
| `client-projects/client101/contracts/openapi/buildkart-workspace-v1.yaml` | Proposed OpenAPI 3.1 client contract for workspaces, messages, drafts, proposals, approvals and handoff |
| `docs/architecture/shared-backend-api-matrix.md` | Workspace API matrix and event families |
| `docs/architecture/collaborative-workspace-threat-model.md` | Threat model, controls and invariants |
| `client-projects/client101/derived/dependency-map.yaml` | Cross-domain workspace flows |
| `client-projects/client101/derived/integration-map.yaml` | Workspace outbox → NATS integration |

## Ownership boundary

| Entity | Proposed owner |
|---|---|
| Workspace, channels, messages, mentions, shares | Workspace Service |
| Purchase drafts, immutable revisions, proposals, approval evidence | Workspace Service |
| Activity timeline and workspace outbox | Workspace Service |
| Checkout handoff record | Workspace Service |
| Business account and membership | Commerce |
| Cart, checkout, payment, order | Medusa / Commerce |
| Seller, offer, allocation | Mercur |
| Stock, ATP, reservation | Tryton |
| Notification inbox, device tokens, FCM attempts | Experience API |
| Support conversations | Chatwoot adapter |

Workspace never calls Medusa, Mercur or Tryton directly. The Experience API is the only client and
commerce-composition boundary.

## Invariants recorded

1. Chat and collaborator actions never create an order.
2. A proposal does not mutate a draft until an authorised buyer accepts or edits it.
3. Approval is bound to an immutable revision and server-computed commercial hash.
4. Material price, tax, shipping, quantity, seller, offer, destination or instruction changes create
   a new revision and invalidate approval.
5. Comments and reactions never invalidate approval.
6. Checkout requires an approved revision plus fresh Commerce revalidation.
7. One approved revision creates at most one canonical order.
8. Tenant, account and roles come only from signed server context; RLS is a second layer.
9. Workspace, NATS, WebSocket or FCM failure cannot change commercial success.
10. Activity events are append-only.

## Decisions requiring approval

The Change Contract proposes D-070-01 through D-070-08. The following remain open:

| ID | Decision | Recommended pilot answer |
|---|---|---|
| OD-070-01 | Message/approval retention and legal hold | Staging pilot retention; production policy deferred to Legal/Privacy |
| OD-070-02 | Approver policy | One approver, distinct from requester and buyer; self-approval prohibited |
| OD-070-03 | Production realtime topology | Defer; measure REST/WebSocket pilot first; no Matrix in Pilot 1 |
| OD-070-04 | Operator read scope | Designated support only, redacted and audited |
| OD-070-05 | Workspace database | Separate database in the existing PostgreSQL cluster |

Required approval roles: product, architecture, security, marketplace, finance, operations,
integration owners, legal/privacy, release authority.

## Proposed Phase 1 after approval

1. Create `services/workspace/` with its own database and migrations.
2. Implement workspace, membership projection, channels, messages, references, read cursors and
   activity events.
3. Add REST endpoints through the Experience API and the cursor WebSocket feed.
4. Add the transactional outbox and NATS publisher.
5. Add tenant/RBAC/RLS tests before UI integration.

Phase 1 exit: two members of one business account can collaborate; another business account cannot
discover any workspace object; revocation removes REST and WebSocket access.

## Explicit non-goals for this phase

- No purchase-draft or approval runtime yet.
- No cart materialisation or order creation.
- No Flutter workspace UI yet.
- No B2C household mode.
- No seller participation or attachments.
- No production release or real payment.

Staging only; production remains unauthorized.
