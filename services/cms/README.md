# BuildKart CMS service (Strapi v5)

**Status:** The service has been installed, built and booted against PostgreSQL; all six content
types and nine components materialised successfully. It is wired into hosted staging but is not
published at the edge. Provider selection is confirmed as Strapi by the human requester (see
`client-projects/client101/changes/CHG-026.yaml` and
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

`python tooling/validate_cms_schemas.py` fails closed on unresolved component or content-type
references, missing `draftAndPublish`/`i18n`, duplicate identifiers, any schema that declares a
transactional field (price, stock, seller, order, payment, credit), and any content type missing its
Strapi `routes`/`controllers`/`services` files. It runs in contract validation.

## Delivery mapping

`/v1/content/app-shell` returns an `AppContentBundle`:

- `locale`, `items[]`, `generated_at`, `source`, `freshness`
- each `AppContentItem`: `id`, `content_type` (`banner|onboarding|help|faq|campaign-copy|legal-link`),
  `placement`, `locale`, `title`, `body`, `action_label`, `action_uri`, `version`, `test_data`

## Files

- `config/` — Strapi server, admin, api, database, middleware and plugin configuration.
- `src/api/` — one folder per content type holding its `content-types/<name>/schema.json` plus
  `routes`, `controllers` and `services`.
- `src/components/` — Strapi v5 component schemas used by layout and category composition.
- `Dockerfile`, `.dockerignore` — container build (Node, not Bun: the Strapi toolchain and its React
  admin do not run reliably under Bun).
- `.env.example` — required environment keys (no secrets).

## Running

```sh
cd services/cms
npm install
npm run develop          # local authoring, http://localhost:1337/admin
npm run build && npm run start   # production-shaped
```

The hosted definition builds this image as `buildkart-hosted-pilot-cms`, reads its environment from
`/etc/buildkart/secrets/cms.env`, and creates the `buildkart_cms` database. It joins the **private**
network only. A loopback-only host binding supports an SSH tunnel for initial administration;
exposing the Strapi admin at the edge still requires the deferred access layer (Cloudflare Access
plus operator RBAC hardening).

The Experience API reads only published documents with a secret-managed read-only API token. Strapi
publishes timestamped HMAC-SHA256 invalidation notifications to the private
`/v1/internal/cms/webhooks` endpoint. Duplicate notifications are recorded once, older events cannot
overwrite newer state, unpublish revokes the matching last-valid projection, and CMS failure falls
back to a non-revoked durable projection or the governed seed.

## Non-goals

- No product price/inventory/seller/order fields.
- No two-way product synchronization with Medusa.
- No direct client access to the Strapi admin or private APIs.
