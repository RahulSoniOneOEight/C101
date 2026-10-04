# BuildKart Local Staging Stack

Functional local staging for the CHG-017 vertical slice. Only payment is simulated.

## Components

| Path | Role | Runtime |
|---|---|---|
| `backend/` | Mercur 2.3.4 (Medusa 2.20.1) — Commerce + Marketplace | Node 22 + Bun 1.3.11 |
| `tryton/` | Tryton 8.0.11 — ERP reservation/movement/accounting | Python 3.12 |
| `docker-compose.yml` | PostgreSQL 16.15, Redis 7.4.10, Tryton | Docker |

## Baseline

Approved exact versions are recorded in
`docs/architecture/backend-local-staging-baseline.md`.

## Prerequisites

- Docker with compose
- Node.js 22 and Bun 1.3.11 for the backend

## Bring-up

```sh
# 1. Shared datastores + Tryton
docker compose -f services/docker-compose.yml up -d postgres redis
docker compose -f services/docker-compose.yml up -d --build tryton

# 2. Backend (Commerce + Marketplace)
cd services/backend
bun install
cd packages/api
bun run dev        # backend on :9010, admin on /dashboard, vendor on /seller

# 3. Experience API (shared backend + simulated payment)
cd services/experience-api
bun install
bun run dev        # on :9020
```

## Environment

- `backend/packages/api/.env` is staging-only and gitignored.
- `backend/packages/api/.env.staging.example` is the committed template.
- `PAYMENT_ADAPTER_MODE=simulated` is mandatory in staging.

## Safety

- Staging secrets are synthetic and must never be reused in production.
- Simulated payment is development/staging only; production must fail closed.
- No provider credentials, production ERP/logistics/notifications, or customer data.

## Status

- Version baseline: pinned and approved.
- Capability verification: pending (services not yet exercised end-to-end).
- Owners/reviewers: unassigned; evidence items remain `in-progress`/`planned`.
