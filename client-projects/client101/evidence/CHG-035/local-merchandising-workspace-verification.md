# Merchandising Workspace Local Verification

**Date:** 13 October 2026  
**Scope:** CHG-035 implementation proposal  
**Status:** Local checks passed; hosted deployment and human visual review pending; production release unauthorized

## Implemented proposal

- Added one top-level **Merchandising** overview to the existing authenticated Mercur Admin.
- Nested **Editorial content** and **Preset review** beneath the workspace while retaining the
  compatible `/content` and `/merchandising-presets` routes.
- Reworked editorial create and edit into a Medusa UI drawer with explicit draft-only copy.
- Added confirmation prompts before CMS publish and unpublish operations.
- Preserved URL-addressable content kind and locale selection for navigation and review links.
- Enriched the read-only preset and offer catalogues with matching live Medusa promotion/campaign
  IDs and statuses.
- Added links from governed baselines to existing native Medusa promotion and campaign editors;
  no duplicate commerce write API was introduced.
- Delivered the app's hero/campaign banners and root category presentation from the backend:
  a new authenticated `GET /v1/content/presentation` composes Medusa-owned root categories with
  published Strapi banner and category editorial records.
- Category presentation now carries a localized label, supporting text, allowlisted `iconKey` and
  banner image; commerce category id, hierarchy and product membership remain Medusa-owned.
- Added `externalImageUrl` / `externalBannerImageUrl` (HTTPS-validated) to bridge current staging
  creative until media upload is approved, and a `themeKey` for banner colour.
- Added an idempotent CMS bootstrap that publishes the current hero banners and root category
  presentation so operators can edit them without a code change; operator edits are never
  overwritten.

## Ownership and security checks

- Strapi remains authoritative only for editorial content.
- Promotions, campaigns, products, pricing, inventory and transactional data remain Medusa-owned.
- Preset definitions remain read-only reviewed baselines.
- Existing authenticated Medusa content facade, server-only CMS secret handling, field allowlists,
  commerce-field rejection and mutation audit behavior are unchanged.
- The UI uses `@medusajs/ui`, `@medusajs/icons`, Mercur page primitives and design-system utility
  tokens; no iframe, direct browser-to-Strapi request or second UI framework was added.

## Verification

- `bun run codegen`: passed.
- Mercur Admin `npm run build`: passed.
- Medusa API `npm run build`: backend and frontend compilation passed. The local aggregate build
  retained its known base-path bundling warning; the hosted Dockerfile remains the authoritative
  correct-base build path.
- Focused Jest run: 2 suites, 5 tests passed.
  - live governed preset IDs/statuses are attached from the Medusa Promotion module;
  - undeployed offer patterns are reported as missing without changing baseline definitions;
  - CMS operator secret, mutation-envelope and safe-error tests remain green.
- `git diff --check`: passed.
- Experience API `bun run typecheck`: passed.
- Experience API `test:presentation`: passed (banners and category presentation delivered from
  backend, CMS overrides the governed seed, fallback preserved, no transactional leakage).
- Existing Experience API checks `test:cms-content`, `test:storefront-layout` and
  `test:merchandising-content` still pass. `test:cms-content-store` needs a local Postgres and is
  unchanged.
- Flutter `flutter analyze lib`: no issues. Flutter `flutter test`: 131 tests passed, including the
  new presentation model test and the existing golden set.
- Strapi `npm run build`: passed.

## Pending review

- Deploy through the bounded staging release process, including the required FCM Compose overlay.
- Verify sidebar grouping, responsive tables, drawer forms, prompts and native-editor links in the
  hosted browser.
- Record human visual/content approval or requested refinements against CHG-035.
- Keep `production_release_authorized: false`.
