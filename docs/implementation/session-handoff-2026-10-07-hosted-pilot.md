# BuildKart C101 — New-Machine Handoff and Hosted-Pilot Plan

Last updated: 2026-10-07

Use this note when cloning the repository and continuing in a new OpenCode session. Repository
contracts and current artifacts are authoritative; this document is a navigation and execution aid.

## 1. Repository

| Item | Value |
|---|---|
| GitHub | `https://github.com/RahulSoniOneOEight/C101` |
| Default branch | `main` |
| Baseline before this handoff | `1a98a19` — merged PR #6 |
| Current governed stage | `multi-surface-prototype` |
| Target increment | Hosted bounded-staging pilot for 20 allowlisted Android testers |
| Production release | **Not authorized** |

Start on the new machine:

```powershell
git clone https://github.com/RahulSoniOneOEight/C101.git
cd C101
git fetch --all --prune
git status

# Read these before changing anything.
Get-Content AGENTS.md
Get-Content client-projects/client101/workflow/workflow-state.yaml
Get-Content docs/implementation/session-handoff-2026-10-07-hosted-pilot.md
Get-Content docs/architecture/backend-staging-runbook.md
Get-Content client-projects/client101/evidence/CHG-017/evidence-register.yaml
```

Also read any parent/global `AGENTS.md` that OpenCode reports for the new workspace.

## 2. Project structure

| Path | Responsibility |
|---|---|
| `apps/prototype_app/` | Flutter B2C/B2B pilot application |
| `apps/web/` | Next.js bounded-pilot storefront |
| `packages/agency_flutter_ui/` | Shared Flutter UI components and tokens |
| `services/backend/packages/api/` | Medusa/Mercur commerce and marketplace backend |
| `services/experience-api/` | Composed API, simulated providers, reservations, events and reconciliation |
| `services/experience-api/src/workers/` | Long-running NATS consumers |
| `services/tryton/` | Tryton ERP container and initialization |
| `services/proxy/` | nginx reverse proxy |
| `services/docker-compose.yml` | Local PostgreSQL, Redis, NATS, Tryton and proxy |
| `client-projects/client101/changes/` | Governed Change Contracts and approvals |
| `client-projects/client101/contracts/` | API, event and data ownership contracts |
| `client-projects/client101/evidence/` | Acceptance evidence and evidence register |
| `client-projects/client101/workflow/` | Authoritative workflow stage |
| `docs/architecture/` | Runbooks, decisions, gaps and release gates |
| `docs/implementation/` | Implementation/session records |
| `tooling/` | Contract, approval and evidence validators |

### Ownership boundaries

- Medusa owns commerce, carts and canonical orders.
- Mercur owns sellers, offers and seller allocation.
- Tryton owns stock movements and accounting projections.
- The Experience API composes the client experience and owns pilot orchestration/read models.
- NATS JetStream carries cross-system events; Redis/BullMQ remains Medusa-internal.
- Clients do not calculate GST or manufacture order success.

## 3. Local services

| Service | Port |
|---|---:|
| Medusa/Mercur | `9010` |
| Experience API | `9020` |
| Event workers | `9030` |
| Tryton | `8010` |
| PostgreSQL | `5433` |
| Redis | `6379` |
| NATS / monitoring | `4222` / `8222` |
| nginx proxy | `8081` |
| Next.js web | `3000` |

The latest attempted Medusa and Experience API foreground processes were cancelled when the prior
OpenCode server restarted. This did not change repository files. Start services again only when they
are required for implementation or integration tests.

Local startup order is documented in `docs/architecture/backend-staging-runbook.md`.

## 4. Target pilot

Deliver a signed Flutter APK to 20 allowlisted users with:

- hosted, persistent Medusa/Mercur, Tryton, Experience API, NATS, PostgreSQL and Redis;
- identity based on tester email/username;
- the same simulated OTP (`123456`) for every allowlisted tester;
- simulated payment and simulated logistics;
- real persisted orders, seller allocation, inventory movement and event processing;
- a persistent in-app notification inbox plus bounded FCM push delivery; and
- no production providers, production customers or production release.

Approved notification scope for the pilot:

| Notification | Audience | Source |
|---|---|---|
| New product launch | All allowlisted testers | Medusa/manual governed pilot trigger |
| Price drop | All allowlisted testers initially | Mercur offer change/manual governed pilot trigger |
| Order confirmed | Order owner only | `order.confirmed` |
| Delivery update | Order owner only | Simulated `shipment.status_changed` |

All pilot effects and projections must remain marked `test_data=true`. Notification failure must not
change canonical order success.

## 5. Status: done versus pending

| Area | Status | Notes |
|---|---:|---|
| Flutter catalogue/offers/cart/checkout | Done | Canonical seller-aware journey implemented |
| Medusa/Mercur commerce and allocation | Done locally | Seeded and integration-tested |
| Tryton reservation/commit/release | Done locally | Includes test-clearing accounting projection |
| Seed data | Done | 52 products, 4 sellers and 198 offers |
| Simulated payment | Done | Outcome matrix, idempotency and fail-closed production guard |
| Simulated logistics | Done | Shipment creation and status advancement |
| Shared OTP | Done for pilot | Fixed code `123456` |
| Pilot allowlist | Partial | Three hardcoded users; configure 20 testers |
| OTP/session persistence | Partial | Challenges and sessions are currently in memory |
| NATS/outbox/consumers | Done locally | Explicit ack, retry, dedupe and DLQ |
| Reverse proxy and metrics | Done locally | No hosted TLS yet |
| Flutter notification UI | Partial | Bell/inbox currently use local seeded data |
| Backend notification feed | Partial | Global dummy event feed; not user-isolated or persistent |
| FCM push | Pending | Architecture selected; implementation and credentials absent |
| Hosted environment | Pending | Current environment is local |
| Release signing | Pending | Android release currently uses debug signing |
| APK distribution | Pending | Firebase App Distribution not configured |
| Hosted backup/restore and monitoring | Pending | Must be implemented and evidenced |

## 6. Ordered implementation plan

Follow this order. Material scope/provider changes require a governed Change Contract and human
review before applying external effects.

| Order | Work package | Exit condition | External dependency |
|---:|---|---|---|
| 1 | Govern hosted-pilot and bounded-FCM scope | Human-reviewed authorization; production remains unauthorized | Human approval |
| 2 | Configure 20 pilot identities and `PILOT_OTP_CODE` | Listed email + `123456` succeeds; unknown email gets `403` | Tester-email list |
| 3 | Persist OTP sessions in Redis | Sessions survive API restart and work across replicas | Redis |
| 4 | Propagate identity and enforce ownership | Users can access only their own orders and notifications | Steps 2–3 |
| 5 | Add notification/device/delivery database schema | Records and read state survive restart | PostgreSQL |
| 6 | Add authenticated `/v1/me/notifications` and device-token APIs | Per-user inbox and read/read-all pass isolation tests | Steps 4–5 |
| 7 | Add four versioned notification templates and missing catalog events | Launch, price, order and delivery events are contract-tested | Approved wording |
| 8 | Add durable NATS notification worker | Dedupe, bounded retry, audit and DLQ tests pass | Steps 5–7 |
| 9 | Integrate staging FCM | Delivery results recorded; credentials remain server-side | Firebase staging project |
| 10 | Wire Flutter email/OTP authentication | Allowlisted user logs in; logout clears the session | Steps 2–4 |
| 11 | Replace Flutter notification fixtures | Backend inbox, badge, read state, token refresh and deep links work | Steps 6 and 9 |
| 12 | Package Medusa/Mercur, Experience API and workers | Reproducible production-shaped container builds | Container tooling |
| 13 | Deploy hosted staging with DNS/TLS/secrets | HTTPS health checks pass; only intended ingress is public | Hosting/domain access |
| 14 | Configure backup, restore, logs, metrics and alerts | Restore and operational checks are evidenced | Hosted storage/monitoring |
| 15 | Configure Android release signing and build the APK | Non-debug signed APK points only to staging HTTPS endpoints | Protected keystore |
| 16 | Run functional, isolation, restart, notification and load tests | Critical tests pass on hosted staging and real devices | Complete hosted stack |
| 17 | Distribute through Firebase App Distribution | 20 allowlisted invitations sent after staged smoke tests | Firebase + tester emails |
| 18 | Update contracts, runbook and evidence register | CI and governance validators are green | Human evidence review |

Suggested rollout: 2–3 internal users, then 5 users, then all 20 after human review of each wave.

## 7. Inputs needed for full completion

- Twenty tester email addresses/usernames.
- Hosting target and authorized deployment access.
- Domain/DNS access for HTTPS endpoints.
- A dedicated Firebase staging project and server-side FCM credentials.
- A protected Android release keystore and signing configuration.
- Human approval for bounded external FCM delivery.
- Final wording for the four notification templates.

Do not paste secrets into chat or commit them. Put them directly in an approved secret store or
local environment excluded from Git.

## 8. Verification commands

```powershell
# Governance
python tooling/validate_contracts.py
python tooling/validate_chg017_evidence.py
python tooling/validate_chg017_approvals.py

# Experience API
cd services/experience-api
bun run typecheck
bun run test:payment-flow
bun run test:payment-matrix
bun run test:consumers
bun run test:erp
bun run test:reconciliation
bun run test:connectivity
bun run test:isolation
bun run test:concurrency
bun run test:expiry
bun run test:nats

# Flutter
cd ../../packages/agency_flutter_ui
flutter analyze
flutter test
cd ../../apps/prototype_app
flutter analyze
flutter test

# Web
cd ../web
npm ci
npm run typecheck
npm run build
```

Integration scripts require the corresponding local or hosted services to be running.

## 9. Non-goals for this increment

- Real Razorpay or another live payment provider.
- Real SMS/OTP delivery.
- Real carrier booking or production logistics.
- WhatsApp, transactional email or marketing automation.
- Production customer data or customer notifications.
- Production release authorization.

## 10. OpenCode kickoff prompt

Paste this into a new OpenCode session after cloning:

> Read all applicable AGENTS.md files, then read
> `client-projects/client101/workflow/workflow-state.yaml` and
> `docs/implementation/session-handoff-2026-10-07-hosted-pilot.md`. Treat repository contracts and
> evidence as authoritative. Continue the hosted bounded-staging pilot in the ordered plan, beginning
> with governance and identity. Preserve Medusa/Mercur/Tryton ownership boundaries, keep payment,
> logistics and OTP simulated, and do not authorize or route any production effects.
