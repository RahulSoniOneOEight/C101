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

## Pending review

- Deploy through the bounded staging release process, including the required FCM Compose overlay.
- Verify sidebar grouping, responsive tables, drawer forms, prompts and native-editor links in the
  hosted browser.
- Record human visual/content approval or requested refinements against CHG-035.
- Keep `production_release_authorized: false`.
