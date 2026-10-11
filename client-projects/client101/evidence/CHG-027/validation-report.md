# CHG-027 validation report

**Date:** 2026-10-11

**Environment:** local staging build; test data only

**Production authorization:** not granted

## Implemented

- Branded, task-oriented Mercur admin extension with Command Centre, Merchandising, Exceptions and
  Operation Audit pages alongside native Orders, Catalogue, Sellers, Offers and Administration.
- Typed `/admin/buildkart` snapshot, CMS health/content commands and audit API.
- Fail-closed role mapping for `operations_admin`, `merchandiser`, `merchandising_approver` and
  `auditor`.
- Idempotent CMS commands with reason, actor, correlation ID, before/after state and test-data audit.
- Runnable Strapi v5 service, content schemas, private internal API and PostgreSQL database.
- Published/scheduled/audience-filtered `/v1/content/app-shell` projection with last-valid and
  governed-seed fallback.
- Hosted Compose service, idempotent database initialization, persistent uploads and encrypted
  backup coverage.
- Admin and Experience OpenAPI contracts plus operations architecture and permission matrix.

## Validation results

| Check | Result |
|---|---|
| Admin ESLint | Pass |
| Admin TypeScript + Vite production build | Pass |
| Medusa/Mercur API production build | Pass |
| Strapi TypeScript + admin production build | Pass |
| Experience API TypeScript | Pass |
| CMS audience/schedule/last-valid fallback test | Pass |
| Hosted Docker Compose render | Pass with non-secret validation placeholders |
| Admin OpenAPI Redocly validation | Pass |
| Experience OpenAPI Redocly validation | Pass with two pre-existing 4XX-response warnings |
| YAML parse and `git diff --check` | Pass |
| Credential/material review | Pass; examples contain placeholders only |
| CMS Docker image build | Blocked by local Docker Desktop I/O/daemon timeout; native locked build passes |

The standalone Medusa build correctly compiled the backend and frontend. It warned that the unchanged
vendor panel was not present in that isolated command; the hosted Dockerfile builds both panels before
bundling.

## Dependency risk

The initial Strapi tree contained one critical transitive `handlebars` advisory. The lockfile now
forces patched versions of `handlebars`, Axios, DOMPurify, Markdown-It, Nodemailer, PostCSS, Sharp and
webpack-dev-middleware; the critical count is zero and the Strapi production build passes.

`npm audit --omit=dev` still reports **28 high and 3 moderate** transitive advisories. The high chain is
primarily Strapi's bundled generator/build tooling through `braces`/`micromatch`; no patched compatible
release is currently published. The moderate chain includes `stream-json` and React Router; forcing
the newest `stream-json` breaks Strapi's documented import path, so that incompatible override was not
retained. Strapi is private-network-only, customer and operator proxies do not expose it, and content
commands require a timing-safe shared key. This reduces exposure but does not close the upstream risk.

**Required before hosted deployment:** human security acceptance or a patched Strapi dependency
release, followed by rebuild and audit. This is not a production acceptance.

## Pending human checkpoints

- Approve CHG-027 scope and operator role assignments.
- Complete visual/UAT review of desktop and responsive console states.
- Confirm DAM authority and master-catalogue decision `Q-005A`.
- Run hosted smoke tests with secret-managed configuration and record `/v1/content/app-shell` evidence.
- Explicitly authorize staging deployment; production authorization remains a separate mandatory gate.
