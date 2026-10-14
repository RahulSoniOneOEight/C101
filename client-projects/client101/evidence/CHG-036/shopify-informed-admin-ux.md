# Shopify-informed Mercur Admin UX

**Date:** 14 October 2026  
**Change contract:** CHG-036 revision 4
**Scope:** Bounded Phase 1 implementation
**Status:** Deployed to staging; awaiting human visual review; production unauthorized

## Benchmark

The review used Shopify's official admin design guidance, admin-extension model, App Home patterns,
metaobject content model and theme editor documentation. The relevant patterns were translated into
the Mercur/Medusa design system rather than importing Shopify Polaris or reproducing Shopify styling.

Patterns adopted:

- host-native UI and predictable resource workflows;
- operational home page with clear next actions;
- searchable/filterable resource index with explicit status;
- contextual links to native editors instead of duplicate property controls;
- schema-governed content entries;
- explicit draft and publication separation;
- visual composition/preview reserved for the later layout-builder phase.

## Implemented

### Merchandising overview

- Added one primary **Manage editorial content** action and retained preset review as secondary.
- Added live English editorial counts across all six content kinds.
- Added modified-draft, unpublished-draft and missing-live-promotion attention summaries.
- Added content-facade connectivity status.
- Reframed workspace cards around authoritative controls and native commerce editors.

### Editorial content library

- Replaced the large content-kind button grid with compact persistent content-type navigation.
- Added truthful delivery labels: Live, Partial or Consumer pending.
- Added URL-persisted search, publication-status filtering and pagination.
- Added clearer empty, no-results, unavailable and loading states.
- Replaced competing inline row buttons with one native action menu per resource.
- Kept create/edit as explicit draft operations and publish/unpublish as confirmed actions.
- Added associated field labels/descriptions and an accessible form error summary.
- Added an unsaved-change confirmation before closing a dirty editor.
- Separated JSON fields into an explicitly temporary advanced structured-content section.
- Preserved same-session Mercur authentication and server-side Strapi facade; no direct CMS access.

## Single-control check

- Banner and presentation properties remain editable only through Editorial content.
- Promotion, campaign, category hierarchy and commerce collection membership continue to open their
  native Medusa editors.
- The new overview displays status and routes to authoritative editors; it does not add property writes.
- Strapi remains a private backing service and break-glass surface, not a second routine panel.

## Verification

- `bun run lint` passed in `services/backend/apps/admin`.
- `bun run build` passed in `services/backend/apps/admin`.
- Build emitted the pre-existing large-chunk advisory only; no build error.
- `git diff --check` passed.
- CHG-036 revision 4 parsed as valid YAML.
- Release `b317a08` is deployed to staging; see `hosted-staging-deployment.md`.

## Deferred

- Routed detail editor and optimistic-concurrency token.
- Draft projection preview and published/draft comparison.
- Governed visual layout builder and drag/reorder.
- DAM/media upload, targeting and personalization.
- Least-privilege role split and broader edge access.
- Human visual acceptance of the hosted staging release.
- Production release; `production_release_authorized` remains false.
