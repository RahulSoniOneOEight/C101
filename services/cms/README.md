# BuildKart CMS service (Strapi v5 — proposed)

**Status:** Design scaffold only. **Not deployed, not wired into any compose file.** Provider
selection and the backend organisation are proposals awaiting human approval (see
`client-projects/client101/changes/CHG-026.yaml` and
`docs/architecture/buildkart-backend-organisation.md`).

## Purpose

Editorial content for the B2C and B2B storefronts, behind a provider-neutral boundary. The CMS owns
**editorial content only** — never price, stock, seller terms, orders, payment or credit.

## Boundary

```text
Strapi Admin (editors)
   │ publish / unpublish webhook
   ▼
Experience API content adapter
   ├─ verify webhook signature
   ├─ idempotency + version record
   ├─ invalidate cache
   ├─ trigger Meilisearch reindex where needed
   └─ update editorial projection
   ▼
GET /v1/content/app-shell?locale=&channel=&audience=   ← Flutter / web consume this only
```

Clients never receive Strapi admin credentials and never call Strapi directly.

## Content types

| Type | Audience | Purpose |
|---|---|---|
| `banner` | b2c / b2b / both | hero + secondary banners, CTA, schedule, media + alt text |
| `storefront-layout` | b2c / b2b | approved module composition + order for a home surface |
| `curated-collection` | b2c / b2b | ordered product IDs / approved rule, title + tag |
| `product-editorial` | both | editorial description, gallery, guidance — linked by `medusaId` |
| `category-editorial` | both | localized heading, hero, inspiration, buying guide |
| `faq-article` | both | FAQ / help / legal content |

All types enable **Draft & Publish** and **i18n** (`en-IN`, `hi-IN`).

## Delivery mapping

`/v1/content/app-shell` returns an `AppContentBundle`:

- `locale`, `items[]`, `generated_at`, `source`, `freshness`
- each `AppContentItem`: `id`, `content_type` (`banner|onboarding|help|faq|campaign-copy|legal-link`),
  `placement`, `locale`, `title`, `body`, `action_label`, `action_uri`, `version`, `test_data`

## Files

- `content-types/` — Strapi v5 content-type schemas (reference model for the adapter contract).
- `.env.example` — required environment keys (no secrets).

## Non-goals

- No product price/inventory/seller/order fields.
- No two-way product synchronization with Medusa.
- No direct client access to the Strapi admin or private APIs.
