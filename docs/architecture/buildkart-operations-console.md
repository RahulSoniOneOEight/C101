# BuildKart Operations Console

**Status:** Staging implementation proposal under `CHG-027`; human review required. Production is
not authorized. Tryton ERP operations are deferred.

## Purpose and users

The console gives operators one task-oriented workspace while preserving canonical ownership and
provider boundaries.

| Persona | Primary work | Role |
|---|---|---|
| Operations lead | Monitor queues, resolve exceptions, administer access | `operations_admin` |
| Merchandiser | Create and revise editorial drafts | `merchandiser` |
| Merchandising approver | Review, publish and roll back content | `merchandising_approver` |
| Auditor/support lead | Read command evidence and source freshness | `auditor` |

Role assignments are secret-managed as a mapping from Medusa auth actor ID to roles. Missing or
malformed configuration fails closed.

## Information architecture

1. **Command Centre** — live counts, dependency status and links to focused queues.
2. **Orders** — native Medusa/Mercur order workflow.
3. **Catalogue** — products, categories, collections, prices and promotions.
4. **Merchandising** — B2C/B2B banners, campaign schemas, curated collections and layouts.
5. **Sellers / Offers** — Mercur moderation and marketplace records.
6. **Exceptions** — degraded dependencies and operational attention states.
7. **Operation audit** — immutable CMS command evidence.
8. **Administration** — existing authenticated admin settings; no Tryton controls in this release.

Provider names are hidden from primary navigation. Ownership and freshness remain visible in detail
views and API responses.

## Architecture and ownership

```text
Browser
  -> authenticated BuildKart Operations panel
  -> Medusa-hosted /admin and /admin/buildkart APIs
      -> Medusa query/workflows (commerce canonical data)
      -> Mercur query/workflows (marketplace canonical data)
      -> private CMS adapter -> Strapi (editorial canonical data)
  -> no direct provider database access

Customer application
  -> Experience API /v1/content/app-shell
  -> published, scheduled Strapi projection
  -> last-valid cache, then governed seed fallback when CMS is unavailable
```

The operations database stores projections, command state and audit only. It does not become the
canonical store for products, prices, sellers, offers, orders or editorial documents.

## Permission matrix

| Capability | Operations admin | Merchandiser | Approver | Auditor |
|---|:---:|:---:|:---:|:---:|
| View merchandising | Yes | Yes | Yes | Yes |
| Create/update draft | Yes | Yes | No | No |
| Publish/unpublish | Yes | No | Yes | No |
| Read command audit | Yes | No | Yes | Yes |
| Native commerce/marketplace work | Existing Medusa/Mercur policy | Existing policy | Existing policy | Existing policy |

All mutations require a UUID idempotency key and a human-readable reason. Strapi stores the actor,
correlation ID, command ID, before/after state, outcome and `testData=true`. A repeated command ID
returns the prior result.

## Queue and status standards

- Queue rows answer: **what happened, what needs attention, who owns it, how fresh is it, and what
  safe action is next**.
- Empty states distinguish “no work” from “dependency unavailable” and “permission denied”.
- Staging/test indicators remain visible; fixture data is never presented as production.
- Shared vocabulary: `draft`, `ready_for_review`, `approved`, `scheduled`, `published/live`,
  `expired`, `archived`, `failed`, `degraded`, `resolved`.
- CMS failure disables editorial mutations but never blocks commerce or marketplace workflows.
- Source-system and observation timestamps appear at API boundaries even when primary navigation is
  provider-neutral.

## Merchandising workflow

1. Merchandiser creates a B2C, B2B or shared draft with placement, accessible alt text, stable CTA
   target, priority and optional schedule.
2. The console previews editorial text; approved responsive media remains in Strapi's media library.
3. An approver supplies a reason and publishes through an idempotent command.
4. Experience API returns only published content active within its schedule and audience.
5. Operator verifies `/v1/content/app-shell`, then reviews immutable command evidence.
6. Approver can unpublish as an audited rollback; last-valid/seed fallback prevents CMS failure from
   manufacturing transactional state.

CMS never owns or copies live price, inventory, seller terms, orders, payments or accounting data.
Curated content stores stable canonical identifiers only.

## Release boundaries

Included: command centre, order/catalogue links, seller/offer moderation links, banner publication,
CMS health, exceptions, customer app-shell projection and audit.

Deferred: master-catalogue authoring decision `Q-005A`, DAM authority, accounting, warehouse,
settlement, advanced ERP actions, production credentials and production release authorization.
