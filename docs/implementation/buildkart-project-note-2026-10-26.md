# BuildKart - Project Reference Note

- **Date:** 2026-10-26
- **Status:** Staging pilot. Production not authorised.
- **Scope:** What is actually implemented, the module map, environments, credentials inventory, release state and known gaps.
- **Companion:** Secret *values* are deliberately absent from this file. They live in the local-only
  appendix `buildkart-secrets-appendix-2026-10-26.md` on the Desktop, and on the host under
  `/etc/buildkart/secrets/`.
- **Repo:** `C:\Users\LENOVO\C101-commission-statements` (a clone of the same origin as
  `C:\Users\LENOVO\C101`; both carry the same 43 branches).

---

## 1. What this is

BuildKart is a B2C + B2B hardware marketplace for the C101 engagement. Customers buy retail (B2C)
or through a business account with buyers, approvers and accounts (B2B). Sellers list and fulfil.
Operators run catalogue, merchandising, orders, returns, settlements and ERP posting.

Three rules hold everywhere:

1. **Staging only.** Production is never self-authorised and currently unauthorised.
2. **No secrets in Git.** Credentials, keys and the pilot allowlist stay in env files and the local appendix.
3. **Commerce rules live server-side.** Clients render the composed result; they never re-implement pricing, tax, stock or eligibility.

---

## 2. Surfaces (verified 2026-10-26)

| Surface | Code | Stack | Local | Staging | State |
|---|---|---|---|---|---|
| Customer + B2B app | `apps/prototype_app` | Flutter 0.3.0+15, Android + web | `flutter run -d chrome` | not deployed | source only |
| Web storefront | `apps/web` | Next 15.5.27, React 19, TS 5.7 | `:3000` | **not deployed** | 503 on app host |
| Admin console | `services/backend/apps/admin` | Mercur `@mercurjs/admin` 2.3.4, Vite | `:7000` dev | `/dashboard/` 200 | live |
| Seller portal | `services/backend/apps/vendor` | Mercur `@mercurjs/vendor` 2.3.4, Vite | `:7001` dev | `/seller/` 200 | live |
| Operator `/ops` | served by Experience API | HTML/JS | `:9020/ops` | `/ops` | live |
| Tryton ERP UI | `services/tryton` | Tryton 8.0 + SAO | `:8010` | `/erp/` | live |
| Customer API | `services/experience-api` | Bun + TypeScript | `:9020` | `/health` 200 | live |
| Commerce backend | `services/backend/packages/api` | Medusa v2 + Mercur | `:9010` | `/store`, `/admin`, `/vendor` | live |

**Important:** on staging the customer hostname deliberately returns 404 for `/dashboard`, `/seller`,
`/admin` and `/auth`. Those are routed only on the ops host. Root `/` on the ops host is also 404 -
there is no web storefront mounted there.

---

## 3. Implemented modules

### 3.1 Flutter app - `apps/prototype_app`

24 screen files under `lib/screens/`. Two shells:

- **D2C (`d2c_shell`)**: home, discovery, product list, collection, PDP, cart, checkout, order
  confirmation, orders, tracking, returns, notifications, account.
- **B2B (`b2b_shell`)**: home, browse, offers, quick order, procurement lists, RFQ/quotes,
  projects, support, workspace (collaborative drafts and approvals).

Supporting layers: `core/` (config, env), `data/` (`experience_api.dart` Dio client),
`domain/` (models), `providers/` (Riverpod 3), `router/` (go_router 18), `theme/`, `widgets/`.

Runtime config via `--dart-define`: `BUILDKART_ENVIRONMENT`, `MEDUSA_BASE_URL`,
`EXPERIENCE_API_BASE_URL`, `MEDUSA_PUBLISHABLE_KEY`. Mock catalogue fallback is `kDebugMode` only.

Auth is **OTP**, not password: `POST /v1/auth/otp/challenges` -> `POST /v1/auth/otp/verify` ->
bearer token.

### 3.2 Web storefront - `apps/web`

Four routes: `/` (catalogue), `/products/[id]`, `/checkout`, `/api/checkout`. Calls the Experience
API **server-side** via `lib/experience-api.ts`. No client cart, no order history, no cross-sell.
Success is only rendered when the server returns a canonical order group with
`payment_mode=simulated` and `test_data=true`.

### 3.3 Admin console - 13 route areas

`content`, `editorial`, `inventory-requests`, `merchandising` (with `banners`,
`storefront-layouts`, and `bought-together` on `feat/bt-sku-pairs`), `merchandising-presets`,
`order-channels`, `order-statuses`, `product-studio`, `returns`, `search-insights`,
`seller-activity`, `settlement-statements`, `shipments`.

### 3.4 Seller portal - 3 route areas

`product-studio`, `returns`, `shipments`. Deliberately thin: sellers operate their own listings,
returns and shipments only.

### 3.5 Commerce backend - `services/backend/packages/api`

- Split by audience: `src/api/{admin,store,vendor}`.
- **17 Buildkart admin API routes**: categories, content, inventory, merchandising-offers,
  merchandising-presets, offers, order-channels, order-groups, order-statuses, product-studio,
  returns, search-insights, seller-activity, sellers, settlement-statements, shipment-exceptions,
  shipments.
- Custom modules: `marketplace-settlement`, `simulated-payment`.
- Subscribers: `publish-marketplace-allocations`, `storefront-cache-revalidate`.
- Proxy helper `lib/experience-admin.ts` forwards operator identity, correlation id and service
  secret to the Experience API; supports GET/POST/PATCH on `feat/bt-sku-pairs`.

### 3.6 Experience API - `services/experience-api`

Bun service, 15 source domains: `auth`, `catalogue`, `collections`, `commerce`, `content`,
`events`, `logistics`, `medusa`, `notifications`, `payment`, `returns`, `store`, `tryton`,
`workers`, plus `scripts`.

9 persistent stores: cms-content, correlation, event, inventory-request, notification,
privileged-audit, reservation, return, search-insights (+ `bought-together-store.ts` on the bt branch).

**43 verification scripts** (`test:*` in `package.json`) covering acceptance, RBAC and RBAC-HTTP,
identity, isolation, payments (flow + outcome matrix), shipments (ordering, restart, auth, seller
auth, exception reconcile), returns (idempotency, eligibility, no-effects), manual transitions
(db + http), cart totals and customer context, promotions, CMS content, storefront layout,
presentation, merchandising content, search insights, B2B pricing read, collection URLs, image
quality ordering, NATS consume/publish, ERP movement, reconciliation, connectivity, load.

This service is the **single client-facing API**. It owns pair/config state, RBAC, pilot identity
and composition, and proxies to Medusa.

### 3.7 Workspace service - `services/workspace`

B2B collaborative workspace (Phase 2 kernel): workspaces scoped to a commerce business account,
procurement and approvals channels, durable messages, product-share references, immutable
purchase-draft revisions with a server-computed commercial hash, proposals
(`add_line` / `update_quantity` / `remove_line` / `update_instruction`), explicit
accept / edit-and-accept / reject / cancel, approval requests bound to one revision and hash, no
self-approval, REST reads/writes plus a cursor WebSocket feed proxied by the Experience API.

Clients never call it directly: the Experience API authenticates the pilot member, checks the
business-account role, and signs an actor context with `WORKSPACE_SERVICE_SECRET`.

### 3.8 CMS - `services/cms`

Strapi 5 (`buildkart-cms`) for editorial content and media. Not used for relational commerce
configuration (pairs, presets), which stays in the Experience API.

### 3.9 ERP - `services/tryton`

Tryton 8.0 with `stock`, `sale`, `stock_supply`, `account`, `account_invoice`. Receives postings
and stock movements from NATS consumers. Own UI at `/erp/`.

### 3.10 Edge and hosting - `services/proxy`, `services/hosted`

- `services/hosted/docker-compose.hosted.yml`: **20 services** (postgres, redis, nats,
  medusa-migrate, medusa-api, medusa-worker, tryton, workspace, experience-api, event-workers, cms,
  proxy, cloudflared, fcm, plus named volumes and networks).
- `services/hosted/nginx.conf.template` is the **authoritative** routing config:
  - `/dashboard|/seller|/vendor|/admin|/auth|/static|/uploads` -> Medusa
  - `/v1/`, `/ops`, `/metrics` -> Experience API
  - `/erp/` -> Tryton
  - `/v1/internal/` -> 404, `/` -> 404
- `services/proxy/nginx.conf` is a **stale 59-line variant** with no `/dashboard` or `/seller`
  routes. Do not reason about staging from that file.

### 3.11 Shared Flutter UI - `packages/agency_flutter_ui`

Governed components and design tokens consumed by the app as a local path dependency.

---

## 4. Data and integrations

| Concern | Owner |
|---|---|
| Commerce, catalogue, carts, orders | Medusa v2 |
| Marketplace sellers, offers, allocation | Mercur |
| Inventory and accounting | Tryton |
| Search | Meilisearch |
| Editorial CMS / DAM | Strapi |
| Support | Chatwoot |
| Automation | Activepieces |
| Events | NATS |
| Push | Firebase / FCM (project `buildkart-staging`) |

---

## 5. Feature status

| Capability | Change | State |
|---|---|---|
| B2C browse / PDP / cart / checkout (simulated payment) | CHG-054/067 lineage | staging live |
| B2B browse, offers, quick order, procurement lists, projects | CHG-067 | staging live |
| RFQ / quotes | CHG-067 | staging live |
| Returns + shipment lifecycle | prior CHGs | staging live |
| B2B collaborative workspace (drafts, proposals, approvals) | CHG-070 | staging live |
| Product Studio consolidation (admin + seller) | CHG-076 | staging deployed-verified |
| B2B storefront price consumption (snapshot, MOQ, tiers) | CHG-078 | staging deployed-verified |
| Bought Together, product-level | CHG-079 | staging deployed |
| Bought Together, SKU-level pairs + admin clarity | CHG-080 | staging deployed at `d365eba` |
| Merchandising presets / offers / storefront layouts | CHG-029 and later | staging live |
| Search insights (admin route + store) | CHG-075 | approved, code complete, staging verification pending |
| Next.js web storefront cross-sell | - | not built (By design, Lane B/C work) |

### Bought Together - current truth

- **Contract:** CHG-079 (product-level) extended by **CHG-080** (SKU-level), status
  `staging-deployed-verified`, `staging_base_release: 7a27de7`, `staging_release: d365eba`,
  staging pair `btp_710026edf43347c9a92bed32f58a7eba`.
- **Branch:** `feat/bt-sku-pairs`. Branch **HEAD is `6228f9c`** (a docs-only commit recording
  CHG-080 evidence); `d365eba` is its parent and is what staging runs. Do not assume HEAD == deployed.
- **Files:** `apps/prototype_app/lib/{domain/bought_together.dart,widgets/bought_together_section.dart}`,
  `test/bought_together_test.dart`, admin page
  `routes/merchandising/bought-together/page.tsx`, four admin proxy routes, and
  `services/experience-api/src/store/bought-together-store.ts`.
- **Storefront endpoint:** `GET /v1/products/:id/bought-together?channel=b2c|b2b` (+ SKU/variant
  scoping from CHG-080). Progressive enhancement: any failure returns `paired: null`, the PDP still renders.
- **RBAC:** `merchandising.read` / `merchandising.update` were added to `BUILDKART_PERMISSIONS`;
  `catalogue_admin` gets both, `marketplace_admin` gets read only, `super_admin` gets all.
- **Not implemented by design:** combined add-to-cart, bundles, inferred recommendations,
  scheduling, archive restore, variant-level CTA beyond the single-eligible-variant rule.

---

## 6. Change history (tail)

CHG-010 through CHG-078 are in `client-projects/client101/changes/`. Notable recent ones:

| ID | Subject |
|---|---|
| CHG-076 | Product Studio consolidation (admin + seller), staging deployed-verified |
| CHG-078 | B2B storefront price consumption, staging deployed-verified |
| CHG-079 | Four staging updates incl. Bought Together, staging deployed-verified |
| CHG-080 | Bought Together moved to SKU-level pairing, staging deployed-verified |

CHG-079 and CHG-080 exist only on `feat/bt-sku-pairs`, not on the currently checked-out branch.

---

## 7. Environments

| Surface | Local | Staging |
|---|---|---|
| Customer API | `http://localhost:9020` | `https://api-staging.pinakaplay.cloud` |
| Medusa / Mercur | `http://localhost:9010` | `/store` on customer host; `/admin`, `/vendor` on ops host |
| Admin | `http://localhost:9010/app` | `https://ops-staging.pinakaplay.cloud/dashboard/` |
| Seller | `http://localhost:9010/seller` | `https://ops-staging.pinakaplay.cloud/seller/` |
| Ops | `http://localhost:9020/ops` | `https://ops-staging.pinakaplay.cloud/ops` |
| Tryton | `http://localhost:8010` | `https://ops-staging.pinakaplay.cloud/erp/` |
| Web storefront | `http://localhost:3000` | **not deployed** |
| App (Flutter) | `flutter run -d chrome` | `app-staging` -> TLS failure, then 503 |

**Host:** `89.116.20.164` (`srv2040286`), user `root`, port 22.
**Release layout:** `/opt/buildkart-releases/current` symlink -> `/opt/buildkart-releases/release-<sha>`;
`/opt/buildkart` is a mutable operator checkout and must never be deployed from.

**Pilot:** `PILOT_EXPECTED_USER_COUNT=21`, allowlist in the secret env, shared staging OTP, simulated
payments, `test_data=true` throughout.

---

## 8. Credentials and keys - inventory (no values)

All values are in the local-only appendix on the Desktop, and on the host at
`/etc/buildkart/secrets/*.env` (root, 0600).

| Credential | Purpose | Stored at | Notes |
|---|---|---|---|
| Postgres app password | DB for Medusa, experience, workspace, CMS, Tryton | `postgres.env` | shared across four databases |
| Redis password | Session/queue cache | `redis.env` | |
| NATS user + password | Event bus | `nats.env` | workspace uses user/password separately |
| `JWT_SECRET`, `COOKIE_SECRET` | Medusa auth signing | `medusa.env` | rotate invalidates all sessions |
| `DATABASE_URL`, `REDIS_URL` | Medusa connection strings | `medusa.env` | embed the two passwords above |
| `STOREFRONT_REVALIDATE_SECRET` | Next/Flutter revalidate hook | `medusa.env` | |
| `CMS_OPERATOR_SECRET` | CMS operator projection | `medusa.env` + `cms.env` | verify: value ends in a stray `n` |
| `EXPERIENCE_OPERATOR_SECRET` | Private draft preview projection | `medusa.env` + `experience-api.env` | must match on both sides |
| `CMS_API_TOKEN` | Experience API -> Strapi | `experience-api.env` | long-lived token |
| `CMS_WEBHOOK_SECRET` | Strapi -> Experience API | `experience-api.env` + `cms.env` | tolerance 300 s |
| `WORKSPACE_SERVICE_SECRET` | Experience API -> Workspace HMAC | `experience-api.env` + `workspace.env` | must match on both sides |
| Tryton admin password | ERP RPC + admin UI | `tryton.env` + `experience-api.env` | |
| Strapi `APP_KEYS`, `API_TOKEN_SALT`, `ADMIN_JWT_SECRET`, `TRANSFER_TOKEN_SALT`, `JWT_SECRET`, `ENCRYPTION_KEY` | Strapi internals | `cms.env` | `ENCRYPTION_KEY` is unrecoverable if lost |
| `MEDUSA_PUBLISHABLE_KEY` | Store API key | `experience-api.env`, app `--dart-define` | public by design (`pk_`) |
| `MEDUSA_*_SALES_CHANNEL_ID`, region IDs, seller ids | Non-secret identifiers | `experience-api.env` | B2C/B2B channel and region routing |
| Firebase admin service account JSON | FCM + App Distribution | `/etc/buildkart/secrets/firebase-admin.json` | path via `GOOGLE_APPLICATION_CREDENTIALS` |
| SSH deploy key (ed25519) | Host access | `C:\Users\LENOVO\.ssh\buildkart_deploy` | not passphrase protected |
| Admin console password | `/dashboard/` login | local appendix | static; **not rotated** by policy |
| Seller seed passwords | Seller portal logins | seeded in Medusa | staging fixtures |
| Android signing keystore | APK signing | `C:\Users\LENOVO\buildkart-keystore` | present, contents not inspected |
| Pilot OTP | Shared staging customer login | `experience-api.env` | simulated, staging only |

**Handling rules**

1. Never commit any of these. Never paste them into a ticket, chat or email.
2. The appendix is local-only and must stay outside both worktrees.
3. Widen access by adding named pilot users to `PILOT_USERS_JSON` /
   `PILOT_ROLE_ASSIGNMENTS_JSON` - never by forwarding a credential.
4. Staging credentials must never be reused in production; production must fail closed.
   `experienceAdminConfig()` already throws when `BUILDKART_ENVIRONMENT=production`.
5. Backups of secret material must be encrypted archives, never plaintext copies on the Desktop.

---

## 9. Release and branch state (2026-10-26)

| Branch | HEAD | Bought Together | Notes |
|---|---|---|---|
| `feat/bt-sku-pairs` | `6228f9c` | yes, SKU-level | **staging runs `d365eba`**, one commit behind HEAD |
| `feat/staging-updates-02-04` | `7a27de7` | yes, product-level | base release for CHG-080 |
| `feat/order-detail-workbench` | `82dcfbc` | no | checked out in the commission-statements clone, dirty |
| `feat/buildkart-operations-console` | `fcdca49` | no | checked out in `C:\Users\LENOVO\C101`, dirty |
| `release/pilot-cap-21` | `148b430` | no | referenced by the older SSH handover note |

**Documented release SHAs disagree across sources.** Resolved reading: `d365eba` is current,
`7a27de7` was the base, `148b430` is historical.

**Host-verified 2026-10-26:** `readlink -f /opt/buildkart-releases/current` returns
`/opt/buildkart-releases/release-d365eba`; it is also the newest release directory;
`medusa-api` is `running`/`healthy`; 16 containers are up. No deploy is needed to "update to latest" -
staging is already on the newest release.

Deploy discipline: build once, switch `current`, `up -d`, wait for `medusa-api` healthy, restart the
proxy, verify, record the rollback SHA. Never deploy branch HEAD by default.

---

## 10. Known gaps and open defects

| # | Gap | Impact |
|---|---|---|
| 1 | Web storefront not hosted: no `web` service in compose, `/` returns 404 | Next.js surface cannot be demonstrated |
| 2 | `app-staging` serves an **untrusted TLS chain**; normal clients fail before HTTP, 503 only with verification off | Even once deployed, browsers and Flutter web fail on the certificate - fix the cert, not just the app |
| 3 | Flutter app not deployed for staging | customer surfaces are source-only |
| 4 | Bought Together is absent from the currently checked-out branches | building the app from them silently drops the feature |
| 5 | Both worktrees are dirty; C101 has 5 entries incl. untracked `admin/src/widgets/`, `vendor/src/widgets/` | unrelated work can ride along in a build (G1/G2 stop condition) |
| 6 | `services/proxy/nginx.conf` diverges from `services/hosted/nginx.conf.template` | reasoning about staging from the wrong file |
| 7 | Pair-store audit records role as `marketplace_operator` even for `catalogue_admin` | audit actor role is imprecise |
| 8 | `CMS_OPERATOR_SECRET` appears to end in a stray `n` | verify against the host |
| 9 | Repo `README.md` documents only the Flutter app and shared UI | under-describes two-thirds of the tree |
| 10 | `apps/web` had no cross-sell by design | adding it is separate Lane B/C work |
| 11 | `workflow-state.yaml` omits CHG-079 and CHG-080 and still reports `latest_staging_release` at `17109f8` / `15c31e4` | AGENTS.md makes workflow state authoritative, so it currently contradicts the deployed reality (`d365eba`); update it before the next governed change |

---

## 11. Governance

- **Update Delivery Framework v2** governs every request: lane (A-E), release mechanism, scope lock,
  baseline, requirement ledger, scoped release, deploy gate, evidence closeout.
- **Change-delivery SOP** for C101:
  `docs/implementation/change-delivery-sop.md`.
- **Change contracts:** every material change gets a `CHG-xxx.yaml` with approvals, decisions,
  affected surfaces, verification and a `production_release_authorized: false` line.
- **Production:** immutable and human-authorised. Nothing in this note authorises a production release.

---

## 12. Quick commands

```powershell
# Staging health
curl.exe -s -o NUL -w "%{http_code}`n" https://api-staging.pinakaplay.cloud/health
curl.exe -s -o NUL -w "%{http_code}`n" https://ops-staging.pinakaplay.cloud/dashboard/

# Admin token
$body = @{ email = $adminEmail; password = $adminPassword } | ConvertTo-Json
$auth = Invoke-RestMethod -Uri https://ops-staging.pinakaplay.cloud/auth/user/emailpass `
  -Method Post -ContentType 'application/json' -Body $body
```

```powershell
# Flutter app
cd C:\Users\LENOVO\C101\apps\prototype_app
flutter run -d chrome
flutter analyze
flutter test test/bought_together_test.dart
```

```powershell
# Web storefront
cd C:\Users\LENOVO\C101\apps\web
npm run dev        # :3000
npm run typecheck
```

```bash
# Experience API verification (inside the private network)
cd /opt/buildkart-releases/current/services/hosted
docker compose -f docker-compose.hosted.yml up -d --force-recreate experience-api
```
