# BuildKart CMS service (Strapi v5 — proposed)

**Status:** Content-type and component schemas are defined and validated. **The service itself is
not deployed and is not wired into any compose file.** Provider selection is confirmed as Strapi by
the human requester (see `client-projects/client101/changes/CHG-026.yaml` and
`client-projects/client101/changes/CHG-031.yaml`); the backend organisation proposal is unchanged.

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

## Components

Layout modules compose a `storefront-layout`; `layout.category-banner` composes the per-category
editorial surface. Merchandising labels and badges live here (CMS-owned); membership and any
discount stay in commerce.

| Component | Purpose |
|---|---|
| `layout.hero-banner` | places an approved `banner` record at the top of a layout |
| `layout.category-rail` | category navigation; labels are editorial, the tree is commerce |
| `layout.product-carousel` | ordered product rail with an optional `tag` badge, e.g. Best Deals |
| `layout.product-composition` | fixed product arrangement with `grid`/`feature`/`compact` presentation |
| `layout.split-merchandising` | image and copy block with an optional call to action |
| `layout.offer-collection` | merchandising rail of offers with an optional `tag` badge |
| `layout.rich-editorial` | long-form editorial block |
| `layout.trust-row` | static assurance strip |
| `layout.category-banner` | promo banner attached to a category surface, with position, priority and schedule |

Merchandising membership is always a *reference*, never a copy: modules carry staged ids or relate to
a `curated-collection`, and live price/stock are resolved by commerce at read time.

## Validating the schemas

Strapi is not installed in this repository, so a broken reference would otherwise fail only at CMS
boot. `python tooling/validate_cms_schemas.py` fails closed on unresolved component or content-type
references, missing `draftAndPublish`/`i18n`, duplicate identifiers, and any schema that declares a
transactional field (price, stock, seller, order, payment, credit). It runs in contract validation.

## Delivery mapping

`/v1/content/app-shell` returns an `AppContentBundle`:

- `locale`, `items[]`, `generated_at`, `source`, `freshness`
- each `AppContentItem`: `id`, `content_type` (`banner|onboarding|help|faq|campaign-copy|legal-link`),
  `placement`, `locale`, `title`, `body`, `action_label`, `action_uri`, `version`, `test_data`

## Files

- `content-types/` — Strapi v5 content-type schemas (reference model for the adapter contract).
- `src/components/` — Strapi v5 component schemas used by layout and category composition.
- `.env.example` — required environment keys (no secrets).

## Non-goals

- No product price/inventory/seller/order fields.
- No two-way product synchronization with Medusa.
- No direct client access to the Strapi admin or private APIs.
