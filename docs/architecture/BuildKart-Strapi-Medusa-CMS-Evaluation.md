# BuildKart — Strapi CMS with Medusa Evaluation

**Evaluated:** 4 October 2026  
**Reference:** <https://docs.medusajs.com/resources/integrations/guides/strapi>  
**Project:** Client101 / BuildKart  
**Status:** Architecture recommendation for review; not an approved provider change

---

## 1. Executive recommendation

**Recommendation: adopt Strapi v5 as the preferred CMS/DAM candidate for a
proof of concept, but do not implement the Medusa tutorial’s unrestricted
two-way product synchronization as BuildKart’s production ownership model.**

Recommended BuildKart boundary:

- **Strapi owns editorial content:** banners, page modules, campaign copy,
  responsive media, localized product storytelling, category content, FAQ,
  onboarding, and legal/help content.
- **Medusa owns commerce product identity and transactions:** product/variant
  IDs, cart, promotions, customer context, and orders, subject to the unresolved
  master-catalogue ownership decision.
- **Mercur owns sellers and seller offers:** seller identity, offer price, MOQ,
  quantity tiers, offer validity, and marketplace allocation.
- **Tryton owns inventory:** on-hand, reserved, available-to-sell, and warehouse
  information.
- **Meilisearch owns no canonical data:** it serves a derived discovery index.
- **Flutter and Next.js consume a composed storefront API/read model**, not
  private Strapi administrative APIs and not separate client-side joins across
  every backend.

### Fit score

| Use | Fit | Assessment |
|---|---:|---|
| Banners, pages, campaign modules | 9/10 | Strong fit |
| Media library and responsive assets | 8/10 | Strong with S3/Cloudinary and governance |
| Localized editorial product content | 8/10 | Strong when linked by stable Medusa ID |
| Home-page module composition | 8/10 | Strong if restricted to approved component contracts |
| Master product catalogue | 6/10 | Possible, but ownership and conflict rules must be approved first |
| Unmodified two-way product synchronization | 4/10 | Too much duplication/conflict risk for BuildKart |
| Seller offers, MOQ, tier prices | 2/10 | Keep in Mercur, not Strapi |
| Inventory and availability | 1/10 | Keep in Tryton, never Strapi |
| Cart, checkout, order, payment | 1/10 | Keep in Medusa/integration providers |

**Overall:** Strapi is a good CMS choice if it remains a content system rather
than becoming a second commerce, marketplace, or inventory database.

---

## 2. What the official Medusa guide provides

The current official tutorial:

- targets Medusa support revisited for **Medusa v2.16.0**;
- states it was built with **Strapi v5.30.1**;
- creates Strapi content types for products, variants, options, and option values;
- maps records through unique `medusaId` fields;
- installs `@strapi/client` in a custom Medusa module;
- creates a virtual read-only Medusa Module Link to Strapi product content;
- listens to Medusa product events and synchronizes records to Strapi;
- receives Strapi webhooks and updates Medusa product data;
- uses Medusa workflows with compensation behavior;
- adds duplicate-webhook protection to avoid update loops;
- authenticates Strapi webhooks using a Medusa secret API key; and
- demonstrates enriched product content in the Next.js starter storefront.

This is useful implementation scaffolding. It is not, by itself, an enterprise
data-ownership decision or a complete production synchronization design.

---

## 3. Why Strapi fits BuildKart

### 3.1 Good match for CMS-managed storefront elements

Strapi supports collection types, single types, reusable components, relations,
media fields, and dynamic zones. These map well to:

- B2C/B2B hero banners;
- secondary promotional banners;
- campaign title, subtitle, CTA, and target route;
- homepage section ordering;
- curated product collections using stable product-ID references;
- category editorial headers;
- onboarding content;
- FAQ, help, policy, and legal content;
- product storytelling and specifications that need rich presentation;
- content/inspiration articles; and
- notification and lifecycle-message copy templates.

### 3.2 Publishing capabilities

Strapi provides Draft & Publish as a free feature. Content can remain draft,
be published, be modified without changing the published version, and be
unpublished. This is appropriate for campaign and page content.

Scheduled multi-entry Releases are available on Growth and Enterprise plans.
Multi-stage Review Workflows are an Enterprise feature. BuildKart must include
these plan dependencies when evaluating total cost.

### 3.3 Localization

Strapi internationalization can be enabled per content type and field. This is
useful for future English/Hindi/regional-language banners, category copy,
onboarding, FAQs, and product editorial content.

### 3.4 Media management

The Media Library supports:

- images, video, audio, and documents;
- folders, filtering, captions, and alt text;
- responsive image formats and optimization;
- crop and focal-point metadata;
- S3 and Cloudinary providers;
- private providers and signed URLs; and
- MIME-based upload validation.

This is sufficient for an initial CMS/DAM capability, although high-volume
product media may eventually justify a dedicated DAM.

### 3.5 Technical alignment

Both Medusa and Strapi are Node.js/TypeScript-oriented and use PostgreSQL in
common deployment patterns. The official Medusa module, workflow, subscriber,
link, and webhook examples reduce integration discovery effort.

---

## 4. Where the official tutorial must be adapted

## 4.1 Do not synchronize every field in both directions

Two-way synchronization without field ownership creates conflicts such as:

- an editor changes title in Strapi while catalogue operations change it in Medusa;
- a seller offer update is accidentally overwritten by CMS content;
- a deletion in one system cascades before moderation or audit completes;
- webhook loops create repeated updates;
- out-of-order events restore stale content; and
- images are copied between systems and lose a clear canonical owner.

BuildKart needs a **field-level ownership matrix**. Only the owning system may
write a field; other systems consume projections.

## 4.2 Draft content must not update live commerce content

The tutorial defines product-related Strapi content types with
`draftAndPublish: false`. That simplifies synchronization but does not meet the
BuildKart publishing requirement.

For BuildKart:

- enable Draft & Publish for banners, pages, modules, category editorial, FAQ,
  policies, and product editorial content;
- preview draft content only through an authenticated preview environment;
- send production webhooks on **publish/unpublish**, not every draft save;
- never expose draft entries through the public storefront API; and
- invalidate cache/re-index only after a publish-state transition.

## 4.3 Avoid N+1 Strapi calls on product grids

The tutorial’s sample `list` method loops through product IDs and requests one
Strapi record per ID. This can create an N+1 latency problem for BuildKart’s
long-scroll grids and merchandising carousels.

Production adaptation:

- fetch all matching Strapi documents in one `$in` query;
- cache published editorial content;
- denormalize the required card fields into a channel-ready read model;
- avoid rich-content population for product-list cards;
- fetch full editorial content only on PDP/page requests; and
- monitor p95 latency, query count, payload size, and cache hit rate.

## 4.4 Do not copy operational data into Strapi

The following fields must not be managed or synchronized through Strapi:

- stock quantities and warehouse availability;
- seller offer price;
- MOQ and seller quantity tiers;
- account-specific B2B price;
- payment status;
- shipment status;
- credit balance;
- commission and settlement;
- cart/order state; or
- final delivery promise.

These values change frequently and belong to commerce, marketplace, ERP, or
integration providers.

## 4.5 Decide one media authority

The tutorial fetches Medusa image URLs and uploads copies into Strapi. At scale,
this can create duplicate files, unclear deletion behavior, and unnecessary
storage/network cost.

Recommended BuildKart rule:

- Strapi Media Library plus S3/Cloudinary is the preferred authority for
  editorial/banner media;
- master product media has one approved authority chosen by the catalogue
  ownership decision;
- systems reference stable asset records/URLs rather than repeatedly copying;
- seller media enters through Mercur moderation before approval; and
- image deletion is blocked while an asset is referenced by published content.

## 4.6 Strengthen webhook idempotency

The tutorial uses a payload hash cached for 60 seconds to avoid duplicate loops.
That is helpful for demonstration but insufficient as the only production
guarantee.

BuildKart should add:

- persistent event IDs/idempotency keys;
- an inbox/outbox record with processing status;
- source version or `updatedAt` comparison;
- retry with exponential backoff and dead-letter handling;
- event-order protection;
- reconciliation jobs;
- correlation IDs and audit logs; and
- metrics/alerts for lag, failures, retries, and conflicts.

## 4.7 Pin and test versions

The guide identifies Medusa v2.16.0 and Strapi v5.30.1. Strapi documentation
already describes later 5.x features. BuildKart should pin tested versions and
run contract/integration tests before upgrades rather than assuming every 5.x
release behaves identically.

---

## 5. Recommended field ownership

| Field/data | Writer/authority | Strapi role |
|---|---|---|
| Product/variant ID | Medusa or approved master catalogue | Stores immutable reference only |
| SKU | Master catalogue | Read-only reference |
| Variant options | Medusa/master catalogue | Optional read-only mirror for editorial association |
| Product title | Master catalogue by default | Optional localized display override only if explicitly approved |
| Short/long editorial description | Strapi | Canonical editorial content |
| Product storytelling blocks | Strapi | Canonical editorial content |
| Product editorial images/video | Strapi/DAM if approved | Canonical editorial media |
| Product technical specification | Master catalogue or Strapi depending attribute | Must be decided per field; do not allow dual write |
| HSN/GST/UOM | ERP/master catalogue | Never author in Strapi unless read-only projection |
| Seller profile and logo | Mercur | Optional approved read-only reference |
| Seller price/MOQ/tier | Mercur | No ownership/no write |
| Inventory/availability | Tryton | No ownership/no write |
| Promotional price/coupon | Medusa | CMS may own creative, not calculation |
| Banner/CTA/campaign media | Strapi | Canonical content |
| Campaign product selection | Strapi stores stable IDs/rules | Commerce resolves current product data |
| Homepage module order | Strapi | Canonical published layout configuration |
| Search index | Meilisearch derived projection | Strapi publish event triggers re-index |

---

## 6. Recommended Strapi content model

## 6.1 `banner`

- `contentKey` — immutable business key;
- `audience` — B2C/B2B/both;
- `placement`;
- localized `title`, `subtitle`, and `ctaLabel`;
- validated `ctaTargetType` and `ctaTargetId`;
- mobile/tablet/desktop media;
- alt text;
- start/end timestamps and timezone;
- priority;
- segment/geography references; and
- Draft & Publish enabled.

## 6.2 `storefront-layout`

- channel/audience;
- locale;
- approved dynamic zone of restricted modules;
- module ordering;
- effective schedule;
- fallback layout reference; and
- Draft & Publish enabled.

Allowed modules should map exactly to Flutter/Web semantic components:

- hero banner;
- category rail;
- product carousel;
- product composition/grid;
- split merchandising slot;
- offer collection;
- rich editorial block; and
- trust/information row.

Do not permit arbitrary HTML or arbitrary layout properties that bypass the
design system.

## 6.3 `product-editorial`

- unique `medusaId`;
- locale;
- subtitle;
- rich description blocks;
- editorial gallery/video;
- buying/installation guidance;
- care/safety content;
- SEO/share metadata for web;
- optional related article references; and
- Draft & Publish enabled.

Do not duplicate price, inventory, seller terms, or order fields.

## 6.4 `category-editorial`

- stable Medusa category ID;
- localized heading/description;
- hero media and alt text;
- inspiration blocks;
- buying guide references; and
- Draft & Publish enabled.

## 6.5 `curated-collection`

- collection key;
- localized title/tag;
- audience;
- ordered product IDs or approved dynamic rule;
- schedule;
- fallback behavior when products are unpublished/unavailable; and
- Draft & Publish enabled.

## 6.6 Supporting content types

- onboarding content;
- FAQ/help article;
- legal/policy document with effective version;
- content/inspiration article;
- notification template copy; and
- navigation/deep-link configuration restricted to approved routes.

---

## 7. Recommended architecture

```text
Strapi Admin
  └─ editorial content, layouts, media, locale, publish state
       │ publish/unpublish webhook
       ▼
Medusa integration module / content adapter
  ├─ verifies webhook
  ├─ records idempotency/version
  ├─ invalidates cache
  ├─ updates permitted editorial projection
  └─ requests Meilisearch re-index where needed

Mercur ─ seller/offers ─┐
Tryton ─ inventory ─────┼─► Storefront composition/read API
Medusa ─ product/cart/order ┤
Strapi ─ published content ┘
                         │
                    Flutter / Next.js
```

### Mobile consumption rule

Flutter should not receive Strapi admin credentials and should not independently
join Strapi, Mercur, Tryton, and Medusa data. It should call an authenticated or
public storefront/BFF contract that returns the composed, channel-ready result.

### Direct Strapi access exception

Direct public Strapi delivery can be considered for low-risk standalone content
such as public FAQ or inspiration articles, provided only published entries are
exposed, rate limiting/CDN caching is configured, and no private integration
token ships in the app.

---

## 8. Security and governance requirements

1. Use separate least-privilege Strapi tokens for read and integration writes.
2. Store tokens in a secret manager and rotate them; never ship them in Flutter.
3. Validate webhook authorization, content type, event type, size, and schema.
4. Add replay protection, rate limiting, and persistent idempotency.
5. Restrict public Strapi roles to published fields/content only.
6. Use administrator RBAC; evaluate plan requirements for granular workflows.
7. Use S3/Cloudinary rather than local production media storage.
8. Deny unsafe MIME types; keep SVG restricted or isolate it on a separate
   cookie-less media domain.
9. Scan uploads and enforce file-size/dimension rules.
10. Use signed URLs for private documents, noting that signed URL handling in
    rich-text fields needs careful provider testing.
11. Back up Strapi database and object storage and test restoration.
12. Keep an audit trail for publishing, integration events, and destructive
    actions.
13. Validate CMS route/deep-link targets against an allowlist.
14. Sanitize/render rich content through an approved schema; never execute
    arbitrary embedded scripts in Flutter or web storefronts.

---

## 9. Plan and cost considerations

| Capability | Documented availability | BuildKart implication |
|---|---|---|
| Content types/components/dynamic zones | Core | Suitable for structured modules |
| Draft & Publish | Free | Sufficient for basic editorial publishing |
| Internationalization | Free | Suitable for localized content |
| Media Library | Free; external storage cost separate | Configure S3/Cloudinary and CDN |
| Scheduled Releases | Growth/Enterprise | Needed for coordinated campaign launch scheduling |
| Review Workflows | Enterprise | Needed for formal author/reviewer/approver stages |
| Release audit logs | Enterprise | Important if Strapi is the formal publishing system |

Before selection, compare Strapi self-hosted/Cloud infrastructure and plan cost
against the required approval, SSO, audit, release, support, and availability
features—not only the open-source core.

---

## 10. Proof-of-concept scope

Do not start by synchronizing the entire product model. Run a narrow proof of
concept with these slices:

### Slice 1 — CMS-only banner

- model one B2C and one B2B banner;
- mobile/tablet images, alt text, audience, CTA, schedule;
- draft preview and published delivery;
- Flutter renders published content with cached fallback.

### Slice 2 — Product editorial enrichment

- link five Medusa products by `medusaId`;
- store rich description and editorial gallery in Strapi;
- keep SKU, price, offer, MOQ, and inventory outside Strapi;
- compose Medusa + Strapi on PDP.

### Slice 3 — Curated collection

- create an ordered CMS collection of Medusa IDs;
- omit unavailable/unpublished products safely;
- resolve live product data from commerce;
- update Meilisearch/cache on publish.

### Slice 4 — Operational resilience

- duplicate, delayed, and out-of-order webhook tests;
- Strapi outage and stale-cache test;
- Medusa outage test;
- rollback/unpublish test;
- unauthorized webhook test; and
- performance test for 20-product listing and PDP.

---

## 11. Acceptance criteria

Strapi should be approved only if the proof of concept demonstrates:

- no dual ownership of any field;
- unpublished/draft content never appears in production responses;
- banner editors can preview and publish without an app release;
- product cards do not make one Strapi request per product;
- PDP composition meets agreed p95 latency;
- duplicate and replayed webhooks are harmless;
- a failed integration can retry without data corruption;
- Strapi downtime serves last valid published content or a clean fallback;
- seller prices/MOQ remain sourced from Mercur;
- inventory remains sourced from Tryton;
- payment/order data remains outside Strapi;
- media has alt text, responsive variants, and a single authority;
- all admin and integration actions are authorized and auditable; and
- Flutter and Next.js consume the same semantic content contract.

---

## 12. Decision

### Recommended disposition: **ADAPT**

Use the official Medusa–Strapi guide as an implementation reference for:

- the custom Medusa Strapi module;
- API client setup;
- stable ID linking;
- Medusa workflows and compensation;
- event subscribers;
- authenticated Strapi webhooks; and
- storefront enrichment.

Adapt or replace:

- broad two-way synchronization;
- product schemas with Draft & Publish disabled;
- per-product Strapi requests;
- image duplication;
- short-lived hash-only deduplication; and
- direct Next.js-specific rendering assumptions.

Do not use Strapi as the owner of seller offers, inventory, cart, order,
payment, shipment, credit, commission, or settlement data.

---

## 13. Source notes

- Medusa integration guide:
  <https://docs.medusajs.com/resources/integrations/guides/strapi>
- Strapi Content-type Builder:
  <https://docs.strapi.io/cms/features/content-type-builder>
- Strapi Draft & Publish:
  <https://docs.strapi.io/cms/features/draft-and-publish>
- Strapi Internationalization:
  <https://docs.strapi.io/cms/features/internationalization>
- Strapi Media Library:
  <https://docs.strapi.io/cms/features/media-library>
- Strapi Releases:
  <https://docs.strapi.io/cms/features/releases>
- Strapi Review Workflows:
  <https://docs.strapi.io/cms/features/review-workflows>

### Medusa documentation feedback notice

> ## Submitting Feedback
>
> If you encounter incorrect, outdated, or confusing documentation on this page, submit feedback:
>
> POST https://docs.medusajs.com/resources/agents/feedback
>
> ```json
> {
>   "agent": "Name of the agent",
>   "path": "/optimize/feedback", # the path of the page where the issue is observed
>   "feedback": "Description of the issue"
> }
> ```
>
> Only submit feedback when you have something specific and actionable to report.

---

## Governance statement

This evaluation is a proposal. Selecting Strapi changes the solution provider
set and content ownership model and therefore requires human approval followed
by updates to the solution contract, Data Contract, dependency/integration maps,
security model, deployment plan, and validation evidence. It does not authorize
production implementation or release.
