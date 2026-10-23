# CHG-042 Banner Studio — Inspection and Gap Analysis

**Date:** 16 October 2026
**Change contract:** CHG-042 revision 1
**Status:** Inspection complete; implementation not started; awaiting approval
**Reference:** `C:\Users\LENOVO\Downloads\buildkart-banner-demo.html`

## What was inspected

- Ops Console banner listing: `services/backend/apps/admin/src/routes/content/content-property-page.tsx`
- Shared page-local tabs and tables: `content-operations.tsx`, `content-model.ts`, `use-content-library.ts`
- Field rendering: `content-field-input.tsx`
- Routed editor: `content/[kind]/[documentId]/page.tsx`
- Operator API contract: `services/backend/packages/api/src/integrations/cms-operator-client.ts`,
  `api/admin/buildkart/content/route.ts`, `api/middlewares.ts`
- Private CMS boundary: `services/cms/src/operator-content.ts`
- Banner schema: `services/cms/src/api/banner/content-types/banner/schema.json`
- Strapi plugins: `services/cms/config/plugins.ts`
- Delivery and schedule enforcement: `services/experience-api/src/content/cms-adapter.ts`
- Ownership and phasing: `client-projects/client101/solution/architecture/admin-console-cms-approach.md`

## Capability matrix

Legend — **Exists**: already implemented and reusable. **Partial**: some of it exists. **Missing**: requires new
governed work. **Blocked**: requires a decision the project has not taken.

| Demo capability | Current state | Owner | Gap |
|---|---|---|---|
| Compact header, environment, counts | Partial — title, Staging badge, delivery badge and 4 counts exist | Ops Console | Rename to Banner studio, add scheduled count |
| Search | Exists | Ops Console | Extend to placement/audience |
| Placement filter | Missing | Ops Console (reads CMS data) | Placement values are free strings today |
| Audience filter (B2B/B2C) | Partial — `audience` field exists | CMS | Filter not exposed |
| Channel filter (App/Web) | Blocked | Undecided | Banner has no channel field; channel lives on storefront layout |
| Language filter | Exists | CMS i18n | — |
| Thumbnail | Missing | CMS media / URL | `externalImageUrl` is a string; media fields are not operator-editable |
| Friendly placement labels ("Home → Hero") | Missing | Ops Console | Raw keys (`home.hero`) shown today |
| Editorial status vs display eligibility | Partial — `publicationStatus` (draft/published/modified) exists | CMS + Experience API | Eligibility (scheduled/expired/eligible) is only derived in the UI `timingLabel` |
| Preview action | Blocked | Experience API | No authenticated draft preview projection |
| Edit action | Exists | Ops Console | Routed `/content/:kind/:documentId` |
| Duplicate action | Missing | CMS | No create-from-existing operation |
| Editor grouped sections | Partial — sections are "Content details" and "Advanced structured content" | Ops Console | No details/creative/destination/schedule grouping |
| Persistent customer preview | Blocked | Experience API | Not available; storefront is Flutter |
| Media upload / library selection | Blocked | DAM (CHG-026 open) | No upload path; architecture Phase 3 |
| Crop / focal point | Missing | CMS | No schema fields |
| Device-specific creative | Partial — schema has imageMobile/Tablet/Desktop | CMS | Not operator-editable |
| Conditional destination fields | Partial — `ctaTargetType`/`ctaTargetId` exist | CMS | No searchable selectors; no Campaign landing page type |
| Searchable Product/Collection/Category selectors | Blocked | Medusa/Mercur | Deferred commerce-entity pickers |
| Schedule: immediate vs chosen start | Partial — `startsAt`/`endsAt`/`timezone` exist and are enforced server-side | CMS + Experience API | Editor only shows datetime inputs; no start-mode UX |
| Schedule survives closed browser | Exists | Experience API | `inWindow()` is evaluated at request time; no browser dependency |
| Strapi scheduled publishing | Blocked | Strapi | `config/plugins.ts` is empty; content-releases is not enabled and is not simulated |
| Save draft preserves published version | Exists | CMS (draftAndPublish) | — |
| "Unpublished changes" indicator | Exists | CMS | `publicationStatus=modified` |
| Pre-publication review panel | Partial — confirmation prompt exists with key text | Ops Console | No structured environment/placement/audience/language/schedule summary |
| Validation | Partial — required, integer, JSON, URL and datetime checks exist | Ops Console + CMS | No destination/translation/schedule conflict validation |
| Placement conflict warnings | Missing | Ops Console (reads layouts) | Placement membership and ordering live in storefront layouts |
| Optimistic concurrency | Missing | Medusa + CMS | No expected-`updatedAt` check; architecture Phase 1 |
| Permission-controlled unpublish | Partial | Medusa RBAC | Middleware policy resource is the placeholder `promotion` |
| Audit trail | Exists | CMS | `cms_operator_audit` rows with actor, action, payload hash and status |
| Modal editor | Conflicts | Ops Console | CHG-038/040 mandate a routed full-page editor |

## Verified behaviours from the code

- Draft isolation: `operator-content.ts` writes with `status: "draft"` and publishes only on an explicit
  `publish` operation, so saving a draft cannot alter the published row.
- Unpublished changes: `listHandler` compares the draft and published `updatedAt` values and returns
  `modified`.
- Server-side schedule: `cms-adapter.ts` `inWindow()` filters on `startsAt`/`endsAt` at request time.
- Audit: `mutateWithAudit()` records `started`, then `succeeded` or `failed` with an error code, and the
  CHG-041 change added a safe correlation reference on failure.
- Permissions: `api/middlewares.ts` guards content routes with `resource: "promotion"`, which is a
  placeholder rather than a content-specific permission.

## Conflicts requiring a decision

1. **Navigation.** The demo adds Media library; CHG-040 navigation excludes it and DAM is unresolved.
2. **Tabs.** Demo uses All/Published/Draft/Scheduled; the governed model is All/Needs review/Draft only/Published.
3. **Editor modality.** Demo is a modal; CHG-038/040 require a routed full-page editor.
4. **Fabricated data.** Demo product/collection/category lists are sample strings; real selectors must
   resolve Medusa entities or be hidden.
5. **Preview fidelity.** Demo preview is static HTML; the storefront is Flutter, so exact rendering is
   unavailable and any preview must be labelled illustrative.

## Boundary check

Nothing in this inspection changed application code, schema, or data. The only staging action taken was
the CHG-041 credential rotation recorded separately. No production system was touched.
