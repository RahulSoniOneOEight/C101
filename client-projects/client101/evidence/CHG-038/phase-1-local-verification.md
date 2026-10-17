# Efficient Merchandising Console — Phase 1

**Date:** 15 October 2026
**Change contract:** CHG-038 revision 2
**Status:** Deployed to staging; awaiting human visual review; production unauthorized

## Implemented

### Merchandising overview

- Retained actionable counts for modified drafts, unpublished drafts and published content.
- Added direct actions for modified and draft-only library views.
- Distinguished complete, partial and unavailable content-service states.
- Kept direct links to Editorial content, Promotions, Campaigns, Collections and Categories.
- Replaced routine provider terminology with operator-facing Editorial and Commerce labels.
- Preserved the absence of preset terminology, metrics and controls.

### Unified content library

- Consolidated the six governed content kinds into one library.
- Added horizontally scrollable content-type tabs with per-locale counts.
- Added search across title, key, document ID and content type.
- Retained locale and publication-status filters and URL-persisted pagination.
- Combined title and key into one compact column and added content type and locale context.
- Added a minimum table width, horizontal overflow and sticky row-action column for 1024px use.
- Renamed Curated collections to Collection presentation to avoid implying ownership of commerce
  collection membership.

### Full-page draft editor

- Replaced the transient edit drawer with route-based create and edit pages:
  `/content/:kind/:documentId`.
- Added explicit saved, saving and unsaved states.
- Added required-field validation before submitting a draft.
- Added Ctrl/Command+S draft saving.
- Added in-app navigation blocking and browser close/refresh protection for unsaved changes.
- Separated routine fields from advanced structured content.
- Excluded the `productIds` membership field from Collection presentation, preserving Medusa as the
  authoritative editor for collection membership.
- Kept publication separate from draft saving; no Phase 2 preview or review workflow was implied.

## Checks

- `bun run lint` passed in `services/backend/apps/admin`.
- `bun run build` passed in `services/backend/apps/admin`.
- The build emitted only the existing large-chunk advisory.
- CHG-038 revision 2 parsed as valid YAML.
- `git diff --check` passed.
- Release `fc5178d` is deployed to staging; see `hosted-staging-deployment.md`.

## Deferred checkpoint scope

Preview, review queues, publication diffs, scheduling, media upload, delivery diagnostics, audit UI,
saved views, configurable columns and bulk actions remain deferred. No production release was
authorized or performed.
