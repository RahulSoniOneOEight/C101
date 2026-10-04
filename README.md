# BuildKart C101

Client runtime repository for the BuildKart Flutter B2C/B2B commerce prototype.

## Repository scope

- `apps/prototype_app/` — Flutter customer and B2B buyer application.
- `packages/agency_flutter_ui/` — shared, governed Flutter components and design tokens.
- `client-projects/client101/` — C101 contracts, derived journey/entity/surface maps,
  experience/design mappings, change records, and workflow state.
- `docs/architecture/` — backend ownership, CMS, catalogue, and asset-management planning.
- `docs/implementation/` — BuildKart journey notes and implementation session records.

This is a curated client-code repository. It intentionally excludes the broader agency platform,
other client projects, generated outputs, local caches, and secrets.

## Current status

The workflow is at `multi-surface-prototype`. Flutter screens contain development fixtures and
offline fallbacks where production contracts are not yet wired. A rendered screen or passing test
does not imply production readiness.

Primary system boundaries:

- Commerce: Medusa
- Marketplace sellers/offers/allocation: Mercur
- Inventory and accounting: Tryton
- Search: Meilisearch
- Support: Chatwoot
- Automation: Activepieces
- Editorial CMS/DAM: pending approval

See `docs/architecture/BuildKart-Backend-Managed-Elements-Mapping.md` for the detailed ownership,
rules, assumptions, and gap register.

## Prerequisites

- Flutter stable (export validated with Flutter 3.47.4 / Dart 3.13.3)
- Android Studio or another supported Flutter target toolchain

## Setup

```sh
cd packages/agency_flutter_ui
flutter pub get

cd ../../apps/prototype_app
flutter pub get
```

## Run

```sh
cd apps/prototype_app
flutter run
```

Optional storefront configuration uses build-time values:

```sh
flutter run \
  --dart-define=MEDUSA_BASE_URL=https://medusa.example.com \
  --dart-define=MEDUSA_PUBLISHABLE_KEY=pk_example
```

Never commit real credentials. Use local environment/CI secrets.

## Validate

```sh
cd packages/agency_flutter_ui
flutter analyze
flutter test

cd ../../apps/prototype_app
flutter analyze
flutter test
```

## Governance

Canonical ownership is defined in
`client-projects/client101/contracts/data-contract.yaml`. Material business-rule, workflow,
integration, finance, security, data, or architecture changes require human review and a governed
Change Contract. Production release is never implied by a merge to this repository.
