# BuildKart Workspace

Phase 2 kernel for the B2B collaborative workspace.

## Scope

- Workspaces scoped to a Commerce business account.
- Membership projections for the 20-user staging pilot.
- Procurement and Approvals channels.
- Durable text messages, product-share references, activity events and a transactional outbox.
- Immutable purchase-draft revisions with a server-computed canonical commercial hash.
- Proposals (`add_line`, `update_quantity`, `remove_line`, `update_instruction`) and explicit
  accept / edit-and-accept / reject / cancel.
- Approval requests bound to one revision and hash; no self-approval; material revision changes
  supersede a pending or approved decision.
- REST reads/writes plus a cursor-based WebSocket feed, proxied by the Experience API.
- Tenant checks on every route, row query and socket.

Not in this slice: fresh catalogue-price revalidation, checkout preview, difference
acknowledgement, cart materialisation, order creation and notification projection. Those are
Phase 3/4 in `CHG-070`.

## Boundary

Clients never call this service. The Experience API authenticates the pilot member, checks the
business-account role, signs an actor context with `WORKSPACE_SERVICE_SECRET`, and proxies the
request. The Workspace service verifies the HMAC and timestamp and enforces membership against its
own projection.

Draft line prices are immutable **staging snapshots** supplied by the client today. The Workspace
Service does not own prices and never calls Mercur or Medusa; Phase 3 must revalidate every line
against live commerce before checkout.

## Environment

| Variable | Purpose |
|---|---|
| `PORT` | HTTP port, default `9040` |
| `WORKSPACE_DATABASE_URL` | Own PostgreSQL database |
| `WORKSPACE_SERVICE_SECRET` | HMAC secret shared only with the Experience API |
| `BUILDKART_ENVIRONMENT` | `staging` for this pilot |
| `NATS_URL`, `NATS_USER`, `NATS_PASSWORD` | Optional outbox publisher target |

## Commands

```sh
bun install
bun run typecheck
bun run start
bun run test:smoke   # inside the private network
```

The service creates and seeds its tables on startup. Staging seed workspaces cover
`business_arjun_traders` and `business_shakti_hardware`; they are membership projections, not a
second business-account register. The Arjun workspace also seeds one two-line purchase draft so the
mobile draft and approval surfaces are immediately reviewable.
