# Property-first Editorial Pages — Local Verification

**Date:** 15 October 2026
**Change contract:** CHG-040 revision 1
**Status:** Implemented locally; hosted staging deployment pending; production unauthorized

## Implemented

### Property-first left navigation

The Merchandising sidebar group now exposes these editorial properties directly:

1. Banners
2. Storefront layouts
3. Category presentation
4. Product editorial
5. Collection presentation
6. Help and articles

Overview remains first. Review queue, Delivery status and Content activity follow the property pages.
The generic Editorial content sidebar entry is removed.

### Dedicated property pages

Every property page has:

- a contextual `New <property>` action;
- All, Needs review, Draft only and Published horizontal tabs;
- search across title, key, context and document ID;
- locale selection;
- URL-persisted filters and pagination;
- responsive resource table with reachable sticky row actions;
- explicit Edit and confirmed Publish/Unpublish actions;
- loading, empty and unavailable states.

The generic `New content type` selector and `Create draft` control no longer exist. New records still
remain drafts by default; they are persisted only when the full-page editor is saved.

### Navigation continuity

- The legacy `/content` root redirects to Banners, or to a property page when an old `kind` query is
  present.
- Existing `/content/:kind/:documentId` editors remain stable.
- Editor breadcrumbs and back actions now return to the corresponding property page.
- Overview directs cross-property unpublished work to Review queue.

### Ownership guardrails

- Collection presentation does not expose the commerce product-membership field.
- Commerce collections, categories, pricing, inventory, promotions and campaigns remain editable
  only in native Medusa controls.
- No preset UI, metrics or actions return.

## Checks

- `bun run lint` passed in `services/backend/apps/admin`.
- `bun run build` passed in `services/backend/apps/admin`.
- The bundle does not contain `New content type`, the generic `Create draft`, or preset labels.
- CHG-040 revision 1 parsed as valid YAML.
- `git diff --check` passed.

## Deferred checkpoint scope

Commerce-entity pickers, storefront preview, live-versus-draft diff, reviewer assignment, schedule
mutation, media upload and actor-level audit APIs remain deferred. No production release was
authorized or performed.
