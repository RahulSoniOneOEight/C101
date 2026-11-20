# Project backup manifest — 20 Nov 2026

**Repository:** `RahulSoniOneOEight/C101`
**Backup branch:** `feat/bazarbee-branding`
**Backup tag:** `backup-2026-11-20`
**Scope:** complete source and tracked test data for the Flutter app, web store, backend/admin, CMS,
Experience API, workspace, Tryton integration, hosted deployment configuration, contracts and
evidence.

## Included components

| Component | Path | Backup content |
|---|---|---|
| Flutter customer/B2B app | `apps/prototype_app` | `lib`, `assets`, `test`, Android/web shells, `pubspec.yaml` |
| Shared Flutter UI | `packages/agency_flutter_ui` | components, tokens, tests |
| Web storefront | `apps/web` | app routes, components, styles, tests, package lock |
| Medusa backend + admin/vendor | `services/backend` | `apps/admin`, `apps/vendor`, packages, seed scripts, lockfile |
| CMS | `services/cms` | Strapi source and configuration examples |
| Experience API | `services/experience-api` | API, stores, workers, tests and seed/QC scripts |
| Workspace service | `services/workspace` | collaboration API and smoke scripts |
| Hosted deployment | `services/hosted` | compose files, nginx template, postgres init, backup/restore scripts |
| Tryton proxy/integration | `services/proxy`, `services/tryton` | proxy and Tryton configuration |
| Contracts and evidence | `client-projects/client101` | contracts, fixtures, derived maps, workflow, 320 evidence files |
| Documentation | `docs`, root docs | architecture, implementation evidence, pending work |

## Test data included

- `client-projects/client101/contracts/fixtures/*.json` — canonical API/commerce fixtures.
- `client-projects/client101/experience/fixtures/` — demo/commerce baseline and provider seeds.
- `client-projects/client101/evidence/CHG-*` — change evidence, fixtures and snapshots.
- `services/backend/packages/api/src/scripts/seed.ts` — catalogue/staging seed.
- `services/backend/apps/admin/preview/fixtures.ts` and `mock-fetch.ts` — admin preview data.
- `services/hosted/scripts/seed-*.sql` and `seed-*.ts` — pilot orders, shared lists, B2B pairs,
  workspace provisioning and return lifecycles.
- `services/hosted/postgres-init/00-create-databases.sql` — local database bootstrap.
- `apps/prototype_app/test/*` and `apps/prototype_app/assets/*` — Flutter test fixtures and media.
- `apps/web/tests/*` — web unit/regression coverage.

No test fixture or seed file is intentionally excluded by `.gitignore`.

## Excluded by repository policy

- `.env`, `*.env` secrets and Firebase service-account files.
- `node_modules`, `.next`, `.dart_tool`, Flutter `build`, `.firebase` caches.
- Android `local.properties`, signing keys and generated plugin registrant.
- Generated `*.tsbuildinfo` and `next-env.d.ts`.
- Local database dumps (`*.db`, `*.sqlite`) and generated output directories.
- Flutter `pubspec.lock` is currently excluded by the repository's lockfile policy; dependency
  versions live in `pubspec.yaml`. This is a deliberate policy exclusion, not missing test data.

## Backup and restore

```sh
git clone https://github.com/RahulSoniOneOEight/C101.git
cd C101
git fetch --tags
git checkout backup-2026-11-20
```

An offline bundle of all local refs can be created with:

```sh
git bundle create C101-backup-2026-11-20.bundle --all
```

The bundle is stored outside the repository so it does not inflate the source history.
