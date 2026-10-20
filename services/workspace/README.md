# BuildKart Workspace

Phase 1 kernel for the B2B collaborative workspace.

## Scope

- Workspaces scoped to a Commerce business account.
- Membership projections for the 20-user staging pilot.
- Procurement and Approvals channels.
- Durable text messages, activity events and a transactional outbox.
- REST reads/writes; the WebSocket feed is intentionally not enabled in this slice.
- Tenant checks on every route and row query.

Not in this slice: purchase drafts, proposals, approvals, product shares, revalidation,
cart materialisation, notifications and B2C household workspaces. Those are Phase 2 onward in
`CHG-070`.

## Boundary

Clients never call this service. The Experience API authenticates the pilot member, checks the
business-account role, signs an actor context with `WORKSPACE_SERVICE_SECRET`, and proxies the
request. The Workspace service verifies the HMAC and timestamp and enforces membership against its
own projection.

## Environment

| Variable | Purpose |
|---|---|
| `PORT` | HTTP port, default `9040` |
| `WORKSPACE_DATABASE_URL` | Own PostgreSQL database |
| `WORKSPACE_SERVICE_SECRET` | HMAC secret shared only with the Experience API |
| `BUILDKART_ENVIRONMENT` | `staging` for this pilot |

## Commands

```sh
bun install
bun run typecheck
bun run start
```

The service creates and seeds its Phase 1 tables on startup. Staging seed workspaces cover
`business_arjun_traders` and `business_shakti_hardware`; they are membership projections, not a
second business-account register.
