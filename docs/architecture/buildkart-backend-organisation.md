# BuildKart — Backend Organisation (Medusa, Mercur, Strapi, Tryton)

**Status:** Proposed architecture for review; not an approved topology or provider change.
**Scope:** How the four backends are organized — ownership, runtime packaging, data, integration,
repository layout, environments and governance.
**Sources of truth:** `solution/solution-contract.yaml`, `contracts/data-contract.yaml`,
`docs/architecture/shared-backend-api-matrix.md`,
`docs/architecture/BuildKart-Backend-Managed-Elements-Mapping.md`,
`docs/architecture/BuildKart-Strapi-Medusa-CMS-Evaluation.md`,
`docs/architecture/backend-production-implementation-plan.md`.

---

## 1. First principle

**One bounded context = one runtime = one writer per field.**

- Each backend owns its data and exposes projections/events; no field is written by two systems.
- Clients (Flutter, web, consoles) never join backends themselves — they call one **composition
  (BFF) layer**.
- Provider-specific behavior stays behind an adapter so a provider can be replaced without changing
  canonical business contracts.

## 2. System-of-record matrix

| Backend | Bounded context | Canonical owner of | Must not own |
|---|---|---|---|
| **Medusa** | Commerce | products/variants, prices, price lists, carts, checkouts, orders, customers/business accounts, promotions | inventory truth, seller offers, editorial copy |
| **Mercur** | Marketplace | sellers, seller offers/tiers/MOQ, allocation, commission, settlement/payout | cart/order totals, master catalogue, editorial copy |
| **Tryton** | ERP / Finance | inventory & availability (ATP), warehouse/fulfilment movements, purchasing, accounting, tax, AR/AP, credit projection | sellable price, catalog publication, cart |
| **Strapi** | Editorial CMS / DAM | banners, layouts, campaign copy, product/category editorial, FAQ/legal, media + alt text | price, stock, seller terms, orders, payment, credit |

Adjacent (not core four): **Meilisearch** (derived search index, never canonical), **Chatwoot**
(support), **Activepieces** (automation), **PostgreSQL** (physical store).

## 3. Runtime packaging

| Backend | Packaging | Processes | Notes |
|---|---|---|---|
| **Medusa + Mercur** | **One service**: Mercur is a Medusa **plugin/module set** (Mercur 2.3.4 on Medusa 2.20.x) | `medusa-api` (server) + `medusa-worker` | Admin (`/dashboard`) and vendor (`/seller`) are separate front-end apps, not separate backends |
| **Tryton** | Separate Python service (8.0.x) | `trytond` | Headless JSON-RPC; SAO web client optional static root |
| **Strapi** (proposed) | Separate Node service (v5) | `strapi` | Own DB + object storage; exposes published content only |
| **Composition** | Experience API | `experience-api` + `event-workers` | The only surface clients call; composes the four backends |

```text
                 Flutter / Web / Consoles
                            │
                 ┌──────────▼───────────┐
                 │  Experience API (BFF)│  versioned business contracts only
                 └───┬───────┬───────┬──┘
        sync reads   │       │       │   async (transactional outbox → events)
        ┌────────────┘       │       └────────────┐
        ▼                    ▼                    ▼
   ┌─────────┐         ┌──────────┐         ┌──────────┐
   │ Medusa  │         │ Tryton   │         │ Strapi   │
   │ +Mercur │         │ (ERP)    │         │ (CMS)    │
   └─────────┘         └──────────┘         └──────────┘
        │                                         │
        └──── Meilisearch (derived) ◄─────────────┘ publish → reindex
```

## 4. Data organisation

One PostgreSQL cluster, **separate databases** (or separate instances as scale demands) — never
shared tables across bounded contexts:

| Store | Purpose |
|---|---|
| `medusa` DB | commerce + marketplace (Mercur) |
| `buildkart_tryton` DB | ERP / accounting |
| `buildkart_experience` DB | correlation, events, notifications, privileged audit, reservations |
| `buildkart_cms` DB (new) | Strapi content + admin |
| Object storage (S3/Cloudinary) | DAM media + product images (single authority, responsive renditions) |
| Redis | sessions, caches, rate limits, queues (per-service key prefix) |
| NATS | cross-system domain events (outbox → consumers) |

## 5. Integration organisation

- **Reads:** one composed read model per screen (`/v1/products`, `/v1/compositions/{placement}`,
  `/v1/content/app-shell`). No client-side joins; no per-card CMS/ERP calls (N+1).
- **Writes:** idempotent, authenticated, versioned commands to the owning service; the BFF
  orchestrates but is never a second canonical writer.
- **Events:** every producer uses a **transactional outbox**; every consumer uses **inbox
  deduplication**; add bounded retry/backoff, DLQ/quarantine, operator visibility and reconciliation.
- **Content:** Strapi publish webhook → **content adapter** (verify signature → idempotency/version →
  invalidate cache → trigger reindex) → published projection. CMS outage serves last-valid content or
  a clean fallback and never blocks commerce.
- **ERP:** cart/order → Experience API → Tryton reserve/commit; ATP projected back with a timestamp
  (cart never guarantees stock).

Event envelope: `event_id, event_type, schema_version, occurred_at, producer, aggregate_type,
aggregate_id, aggregate_version, correlation_id, causation_id, account scope` + minimal PII.

## 6. Repository & module layout

```text
services/
  backend/            # Medusa + Mercur (one service)
    packages/api/     # medusa config + Mercur modules, workflows, subscribers, jobs
    apps/admin/       # commerce admin dashboard
    apps/vendor/      # seller (vendor) dashboard
  tryton/             # ERP service (Dockerfile, trytond.conf, modules)
  cms/                # Strapi service (proposed) — content types, media, roles
  experience-api/     # BFF/composition + payment adapter + content adapter
  hosted/             # deployment: compose, nginx edge, secrets templates, scripts
packages/
  agency_flutter_ui/  # shared design system
apps/
  prototype_app/      # Flutter customer app (B2C + B2B)
```

Rule: one folder per bounded context; only `experience-api/` may import more than one backend client.

## 7. Environments & configuration

Same topology in **local → staging (hosted) → production**; only config/secrets differ.

- Secrets in a secret manager (never in git); per-service least-privilege tokens.
- One env file per service (`medusa.env`, `tryton.env`, `experience-api.env`, `cms.env`).
- Production must **fail closed** for simulated providers (already enforced for payment).
- Version pinning recorded in `docs/architecture/backend-local-staging-baseline.md`
  (Medusa 2.20.x, Mercur 2.3.4, Tryton 8.0.x, Strapi v5, Meilisearch).

## 8. Contracts & governance

- **OpenAPI 3.1** for client-facing contracts; generate Dart/TS clients.
- **Data Contract** is authoritative for field ownership; ownership changes require a contract update
  + ADR.
- Material workflow/integration/data/security changes require a **Change Contract (CHG-xxx)** and
  human approval before production.
- Per service: health, readiness, metrics, structured logs, correlation IDs.

## 9. Anti-patterns to avoid

- Two-way product synchronization between Medusa and Strapi.
- CMS owning price, stock, seller terms, orders or payment.
- Clients joining Medusa + Mercur + Tryton + Strapi directly.
- Per-product CMS/ERP requests on grids.
- Sharing tables/databases across bounded contexts.
- Shipping provider credentials or admin tokens inside the app.

## 10. Phasing

1. **Now:** Medusa+Mercur service, Tryton service (+SAO UI), Experience API BFF, hosted edge.
2. **Next:** introduce **Strapi** behind the content boundary; move hardcoded banners/layouts to
   `/v1/content/app-shell` (proof-of-concept Slice 1 = one B2C + one B2B banner).
3. **Then:** product-editorial and curated collections; wire Meilisearch reindex on publish.
4. **Harden:** outbox/inbox + reconciliation completeness, DB isolation, secret manager,
   observability, and resolution of master-catalogue ownership (`Q-005A`).

## 11. Open decisions (human approval required)

- Approve the CMS provider (Strapi) and this backend organisation.
- Resolve master-catalogue ownership (`Q-005A`).
- Decide DAM authority (Strapi media library vs separate DAM).
- Per-field split for product specifications (CMS copy vs master catalogue).
- Final deployment topology for production (shared cluster vs isolated per bounded context).
