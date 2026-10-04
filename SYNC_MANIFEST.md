# Initial C101 sync manifest

**Prepared:** 2026-10-04  
**Source repository:** `RahulSoniOneOEight/pincommerce`  
**Source branch:** `feat/consolidated-admin`  
**Source HEAD:** `0c142a5`  
**Target repository:** `RahulSoniOneOEight/C101`  
**History mode:** clean initial commit

## Included

- Current Flutter working-tree snapshot from `apps/prototype_app`.
- Current shared Flutter UI working-tree snapshot from `packages/agency_flutter_ui`.
- C101 contracts, solution decisions, change records, derived maps, experience/design artifacts,
  and workflow state.
- Selected BuildKart architecture and implementation documentation.
- Client-specific CI for Flutter analysis and tests.

The source working tree contained uncommitted work. This export intentionally captures the current
reviewed filesystem state rather than only source HEAD.

## Excluded

- `.env` and all local credentials.
- `.dart_tool`, `build`, IDE, Gradle cache, Node/Python cache, and generated output directories.
- Other client projects.
- Agency-wide platform, orchestration, templates, production tooling, and unrelated web packages.
- Android `local.properties`, signing properties, and generated lockfiles.

## Promotion status

This sync is a prototype-code export, not production authorization. The target must pass its own CI
and human review before any release or promotion.
