# Change Delivery SOP

**Status:** Active — mandatory for all engineering changes.
**Scope:** C101 / BuildKart staging and production-bound work.
**Owner:** Human requester; implemented by engineering and AI agents.
**Last updated:** 2026-10-21.

## 1. Purpose

Small changes must not pay the cost of a full release. Every incoming request is classified
before implementation, then routed to the fastest safe delivery lane. The default operating model
is:

> **One preview loop per change bundle. One controlled deployment. No per-edit image rebuilds.**

This SOP does not replace change contracts, security rules, or production approvals. It changes
how work is iterated and delivered.

## 2. Non-negotiable rules

1. **Classify before coding.** No implementation starts until the change lane is chosen.
2. **Batch related edits.** Do not deploy after each small fix. Bundle UI, API, contract and tests
   that belong to one outcome.
3. **Iterate in a preview environment.** UI and API changes must be exercised together before a
   staging deployment.
4. **Deploy once per bundle.** A full image build is a release action, not a development loop.
5. **Keep staging safe.** Preview write tests use a preview database, not shared staging data.
6. **Keep production immutable.** Production always uses the approved image, migrations and human
   authorization. The fast lane is staging-only.
7. **Record evidence once per bundle.** Update the Change Contract, workflow state and runtime
   evidence when the bundle is accepted, not on every edit.
8. **Never bypass the existing governance.** Material business, data, security, finance or
   architecture changes still require the applicable Change Contract and approvals.

## 3. Intake evaluation

For every request, before coding:

1. **Restate the outcome and acceptance criteria.**
2. **List touched surfaces** — admin UI, customer app, Medusa API, Experience API, workers,
   database, infrastructure, contracts, content.
3. **Classify the change** using the matrix in §4.
4. **Identify dependencies** — new API fields, schema changes, events, provider behavior.
5. **Choose the fastest safe lane** and state it.
6. **State the verification plan** before implementation.
7. **If the request is ambiguous, ask one focused question.** Do not guess at business behavior.

For any non-trivial request, report the chosen lane and expected verification before making
changes.

## 4. Lane selection matrix

| Lane | Use when | Iteration method | Staging publication | Target time |
|---|---|---|---|---|
| **A — UI only** | Copy, layout, styling, badges, cards, client-side display logic | Admin/Vite or Flutter hot reload; local Playwright screenshots | Build only the changed UI; publish static bundle | 30–60 seconds |
| **B — UI + API, no schema** | New field, route, response shape, status logic, validation | Preview stack: UI hot reload + Medusa/Experience API watch | Deploy API code and UI bundle together | 2–5 minutes |
| **C — UI + API + schema/dependency** | Migration, new table/column, package or Docker change | Preview database + migration + watch | One full image build, migrate staging, deploy | 10–15 minutes |
| **D — Cross-service / event** | NATS subject, worker, subscriber, external integration | Preview stack with workers and broker; end-to-end event test | One deploy after event smoke | 10–15 minutes |
| **E — Production-bound** | Any production release or production migration | Full release rehearsal on staging | Approved image + migrations + human authorization | Governed release |

### Selection rules

- If the change touches only the dashboard, customer app or presentation layer → **Lane A**.
- If the UI needs a new or changed API response but no migration → **Lane B**.
- If the change requires a migration, dependency or image change → **Lane C**, even if the UI is
  small.
- If the change affects an event subject, consumer, worker or external system → **Lane D**.
- If production behavior, money, stock, security or canonical ownership changes → stop and use the
  governed Change Contract path first.
- When in doubt, choose the slower lane for the first iteration, then move repeated edits into the
  faster lane.

## 5. Standard bundle workflow

1. **Contract first**
   - Define the request/response or event shape.
   - Update types and the typed client once.
   - Mock new fields in the UI if the backend is not ready.

2. **Start the preview loop once**
   - UI hot reload.
   - Backend watch mode.
   - Preview database, Redis/NATS where required.
   - Seeded test data.

3. **Iterate**
   - Make UI and API edits together.
   - Validate the full journey locally.
   - Capture screenshots and console logs.
   - Do not deploy after each fix.

4. **Freeze and verify**
   - Run the verification set for the lane (§6).
   - Run one realistic end-to-end cycle where applicable.
   - Obtain visual QC for user-facing UI.

5. **Deploy once**
   - Lane A: publish the static UI bundle.
   - Lane B: deploy API code and UI bundle together.
   - Lane C/D: one full image build, migration if required, deploy.
   - Lane E: follow the production release gates.

6. **Record evidence**
   - Update the Change Contract, workflow state and runtime evidence once.
   - Record commit/release identifiers, verification results and any residual limitations.

## 6. Verification by lane

| Lane | Minimum verification |
|---|---|
| A — UI only | Typecheck/lint; browser render at target widths; zero console errors; screenshots reviewed |
| B — UI + API | Lane A checks + API/contract tests + one end-to-end journey |
| C — schema/dependency | Lane B checks + migration up/down or idempotent apply + acceptance checks |
| D — event/worker | Lane C checks where applicable + event publish/consume test + duplicate/retry behavior |
| E — production | Full governed acceptance, security, backup/restore and human approval |

Visual QC is required for user-facing screens. Use the approved reviewer/model when specified;
record the verdict and any residual cosmetic findings.

## 7. Efficient tooling target

The following one-time setup is the target fast lane. Until a lane is implemented, use the existing
local dev servers and batch deployment; do not fall back to per-edit full image builds.

1. **Docker layer caching**
   - Copy package manifests and lockfile first, install dependencies, then copy source.
   - Prevents `bun install` from rerunning on every source edit.

2. **Admin static delivery**
   - Build only `apps/admin/dist`.
   - Serve `/dashboard` from a staging static directory or volume.
   - No Medusa image rebuild for admin-only changes.

3. **Preview compose stack**
   - Bind-mounted source.
   - `medusa develop` for the API.
   - `bun --watch` for the Experience API.
   - Preview Postgres/Redis/NATS with seed data.

4. **Bundle scripts**
   - `preview:up`, `preview:seed`
   - `deploy:admin`, `deploy:api`
   - `bundle:verify`
   - `bundle:release`

5. **Playwright smoke set**
   - Admin order detail
   - Customer order detail
   - Delivery/return cycle
   - Console-error capture

## 8. Guardrails

- Preview write tests must not mutate shared staging data. Use a separate preview database or a
  cloned snapshot.
- Migrations are applied deliberately, never automatically from a local watch process against
  staging.
- Staging dummy secrets remain staging-only. Production must fail closed.
- Fast-lane tooling must not weaken authentication, role checks, audit logging or evidence-only
  semantics.
- Production release remains human-authorized.

## 9. Definition of done for a bundle

- The declared lane and verification plan are satisfied.
- UI and API are deployed together where they depend on each other.
- Screenshots/visual QC are accepted for user-facing changes.
- Tests and acceptance evidence are recorded.
- Change Contract and workflow state are updated once.
- Residual limitations and production blockers are stated explicitly.

## Appendix A — Intake record template

Copy this block into the session note or Change Contract before implementation:

```yaml
request:
surface:
  ui:
  api:
  worker:
  schema:
  infrastructure:
outcome:
acceptance_criteria:
lane: A | B | C | D | E
dependencies:
  contracts:
  migrations:
  events:
  providers:
preview_plan:
verification_plan:
deployment_plan:
evidence_target:
risks:
production_impact:
```

