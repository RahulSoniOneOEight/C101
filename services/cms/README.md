# BuildKart CMS service (Strapi v5)

**Status:** Staging implementation under CHG-027; production release remains unauthorized.
The service is wired into `services/hosted/docker-compose.hosted.yml` but must pass human review and
the hosted acceptance gate before pilot use.

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

Clients never receive Strapi admin credentials and never call Strapi directly. The authenticated
Mercur/Medusa operator panel calls `/admin/buildkart/merchandising/*`; the Medusa server forwards a
minimal command to Strapi using `CMS_INTERNAL_KEY` on the private Docker network.

## Content types

| Type | Audience | Purpose |
|---|---|---|
| `banner` | b2c / b2b / both | hero + secondary banners, CTA, schedule, media + alt text |
| `storefront-layout` | b2c / b2b | approved module composition + order for a home surface |
| `curated-collection` | b2c / b2b | ordered product IDs / approved rule, title + tag |
| `product-editorial` | both | editorial description, gallery, guidance — linked by `medusaId` |
| `category-editorial` | both | localized heading, hero, inspiration, buying guide |
| `faq-article` | both | FAQ / help / legal content |
| `campaign` | b2c / b2b / both | operational grouping, review state and schedule |
| `operation-audit` | internal | append-only evidence for idempotent CMS commands |

All types enable **Draft & Publish** and **i18n** (`en-IN`, `hi-IN`).

## Delivery mapping

`/v1/content/app-shell` returns an `AppContentBundle`:

- `locale`, `items[]`, `generated_at`, `source`, `freshness`
- each `AppContentItem`: `id`, `content_type` (`banner|onboarding|help|faq|campaign-copy|legal-link`),
  `placement`, `locale`, `title`, `body`, `action_label`, `action_uri`, `version`, `test_data`

## Commands

```sh
npm install
npm run develop
npm run build
npm run start
```

The internal API requires `x-buildkart-cms-key` and is intentionally not routed through nginx. Its
write endpoints additionally require an idempotency key, actor identity, correlation ID and operator
reason. Duplicate command IDs return the recorded result.

## Files

- `src/api/` — runnable Strapi content types plus the private operations controller.
- `src/components/layout/` — approved storefront-layout modules.
- `content-types/` — portable reference copies of the core schemas.
- `.env.example` — required environment keys (no secrets).

## Non-goals

- No product price/inventory/seller/order fields.
- No two-way product synchronization with Medusa.
- No direct client access to the Strapi admin or private APIs.
