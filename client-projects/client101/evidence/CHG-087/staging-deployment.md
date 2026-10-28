# CHG-087 — Staging deployment and verification

**Status:** STAGING DEPLOYED AND VERIFIED
**Change:** CHG-087 Revision 1 — return inspection and simulated refund closure
**Environment:** staging only. Production is not authorized and was not touched.
**Deploy owner:** requester-authorized OpenCode agent
**Completed:** 2026-10-28

---

## 1. Release identity

| Item | Value |
|---|---|
| Baseline before release | `/opt/buildkart-releases/release-a13bcb4` (`a13bcb4`, U-003/U-005 + CHG-086) |
| Target branch | `release/chg-087` |
| Release commit | `0dfdbff7db66761e3bc1a393b3050235e65cb035` |
| Commit range | `a13bcb4..0dfdbff` — one CHG-087 feature commit; 74 files |
| Release worktree | `/opt/buildkart-releases/release-0dfdbff` |
| Current symlink | `/opt/buildkart-releases/current -> release-0dfdbff` |
| Rollback release | `/opt/buildkart-releases/release-a13bcb4` |
| Rollback images | `buildkart-hosted-pilot-medusa:rollback-a13bcb4`, `buildkart-hosted-pilot-experience-api:rollback-a13bcb4`, `buildkart-hosted-pilot-web:rollback-a13bcb4` |
| Production | Not authorized, not touched |

The release branch is pushed to `origin/release/chg-087`. The deployed SHA is an immutable commit; no branch HEAD was deployed.

---

## 2. Pre-change gates

| Gate | Result |
|---|---|
| Staging current re-read | `release-a13bcb4`; re-baselined from the earlier `ecb01e1` record |
| Public health before change | API 200, ops 200, Admin 200, Seller 200 |
| Encrypted backup | `20261028T174232Z` under `/var/backups/buildkart/` |
| Restore proof | PASS — 23 public tables restored into a disposable database |
| Schema rehearsal | PASS — new image applied additive schema; DB acceptance passed |
| Old-image compatibility | PASS — `rollback-a13bcb4` DB acceptance passed against the new schema |
| No-cache builds | PASS — Medusa, Experience API, Web |
| Behavior markers | PASS — Experience API subject/route marker, Web sign-in/orders/returns server routes, Medusa refund-simulation API route and dashboard chunks |

Schema rehearsal counts: `return_case` 4, `return_line` 4, `return_event` 10 before and after; `pilot_return_refund_simulation` created with 0 rows. No destructive schema change.

---

## 3. Images and services

| Image | New image ID | Rollback image ID |
|---|---|---|
| `buildkart-hosted-pilot-medusa` | `64b4bfbcab7f` | `9b9cbc1144a2` |
| `buildkart-hosted-pilot-experience-api` | `605482096651` | `dedfd0ed3e01` |
| `buildkart-hosted-pilot-web` | `16e4494fe52d` | `45f08c8faec8` |

Services recreated and healthy/ready:

- `medusa-api` — healthy
- `experience-api` — healthy, NATS connected, identity store connected
- `medusa-worker` — ready on 9011
- `event-workers` — ready on 9030; its `pilot-notification-dispatch` consumer reports a **pre-existing** failed/dead-letter backlog from invalid FCM credentials (`failed: 40`, `deadLettered: 8`). The last delivery attempt was `2026-10-28 13:43:48Z`, before the CHG-087 smoke; no delivery attempt was created during the smoke. This is recorded as a staging finding, not a CHG-087 code regression.
- `web` — healthy
- `proxy` — restarted after recreation

Public checks after the proxy restart:

| Surface | Result |
|---|---|
| `https://api-staging.pinakaplay.cloud/health` | 200 |
| `https://ops-staging.pinakaplay.cloud/health` | 200 |
| `/dashboard/` | 200 |
| `/seller/` | 200 |
| `https://app-staging.pinakaplay.cloud/sign-in` | 200 |

`app-staging.pinakaplay.cloud` is the confirmed `PUBLIC_APP_HOSTNAME`.

---

## 4. Staging smoke fixture

| Field | Value |
|---|---|
| Fixture | `chg087_staging_smoke` |
| Order | `checkout_chg087_staging_smoke` |
| Return | `ret_96ddc7d0643948f5a39beb60519d1904` |
| Owner | first allowlisted staging pilot; identity not recorded here |
| Seller | `sel_01M4EC9C7YNSFGCG6A4B3Q6PG8` (BuildMaster Supplies) |
| Final status | `closed` |
| Refund projection | `SIM-REFUND-EC1E8AA9`, ₹3,047.00, `simulated_completed` |
| Domain events | `return.requested`, `return.decision`, `return.status_changed`, `return.inspection_completed`, `return.refund_simulation_recorded` |
| Closure notifications | 2 (`return.inspection_completed`, `return.refund_simulation_recorded`) |
| Money / stock effect | `none` / `none` |

The fixture was created, driven through the real HTTP lifecycle, browser-verified, then removed. A post-cleanup query returned zero rows for the fixture order, shipment, correlation and domain events.

The fixture is intentionally Experience-only: no Medusa order, payment, refund, Tryton movement or carrier call was created.

---

## 5. Browser QC

**Result: 30/30 PASS**, 12 screenshots, zero console errors, zero unexpected failed requests.

| Surface | Desktop 1440×900 | Mobile 390×844 |
|---|---|---|
| Customer web | PASS | PASS |
| Admin | PASS | PASS |
| Seller | PASS | PASS |

Customer web verified OTP sign-in, order list, order detail, return detail, `SIM-` reference, and no-real-money wording. Admin verified the closed return and refund summary. Seller verified the closed return, inspection evidence, and absence of the refund amount/reference. No page-level horizontal overflow.

Evidence:

- `staging-browser-qc.json`
- `staging-screenshots/web/{desktop,mobile}/`
- `staging-screenshots/admin/{desktop,mobile}/`
- `staging-screenshots/seller/{desktop,mobile}/`
- `tools/staging-browser-qc.cjs`

Staging seller login required selecting the BuildMaster Supplies store after login; the QC script records this flow. No staging password or OTP is present in the report or screenshots.

---

## 6. Zero-effect evidence

Counts before and after the full staging smoke:

| System | Before | After |
|---|---|---|
| Medusa `payment` | 20 | 20 |
| Medusa `refund` | 1 | 1 |
| Medusa `order_transaction` | 1 | 1 |
| Medusa `payment_collection` | 31 | 31 |
| Medusa `payment_session` | 31 | 31 |
| Tryton `stock_move` | 55 | 55 |
| Tryton shipment tables | 0 each | 0 each |

The smoke asserted deep equality of the before/after count snapshots and failed closed if either changed.

### External delivery finding

Staging has `FCM_DELIVERY_ENABLED=true` (not `false` as the planning assumption stated). The smoke itself created **zero notification delivery attempts**: the most recent delivery attempt in the database is `2026-10-28 13:43:48Z`, before the smoke; the owner had no active device registration. No external push/SMS/email was observed.

The event worker still reports a **pre-existing** FCM invalid-credential backlog (`failed: 40`, `deadLettered: 8`) from earlier staging traffic. This is a staging configuration/provider issue outside CHG-087's code path. It should be remediated by disabling FCM delivery or supplying valid provider credentials before wider tester use.

---

## 7. Cleanup

- Staging smoke fixture deleted by allowlisted IDs/references.
- Post-cleanup fixture rows: 0 across return, shipment, correlation and domain-event tables.
- Smoke notifications: 0 remaining.
- No rehearsal database remains.
- Temporary `/tmp` scripts and fixture JSON are outside the repository and are not required at runtime.
- The release images, release worktree and rollback tags remain for rollback capability.

---

## 8. Rollback

If rollback is required:

```sh
docker tag buildkart-hosted-pilot-medusa:rollback-a13bcb4 buildkart-hosted-pilot-medusa:latest
docker tag buildkart-hosted-pilot-experience-api:rollback-a13bcb4 buildkart-hosted-pilot-experience-api:latest
docker tag buildkart-hosted-pilot-web:rollback-a13bcb4 buildkart-hosted-pilot-web:latest
ln -sfn /opt/buildkart-releases/release-a13bcb4 /opt/buildkart-releases/current
cd /opt/buildkart-releases/release-a13bcb4/services/hosted
docker compose -f docker-compose.hosted.yml up -d --no-deps --force-recreate \
  medusa-api medusa-worker experience-api event-workers web
docker restart buildkart-hosted-pilot-proxy-1
```

The Experience API schema is additive and backward compatible. On code rollback, leave the new tables/columns in place; remove only the smoke fixture. Restore the encrypted backup only if corruption is proven.

---

## 9. Deferred and residual

- Production release remains unauthorized.
- Real refund execution, Tryton stock disposition, Shiprocket/carrier integration, settlement/accounting and legal/tax-approved policy remain deferred.
- Staging FCM delivery is enabled and has a pre-existing invalid-credential backlog; no delivery attempt occurred during this smoke, but the worker should be remediated before wider tester use.
- The customer return response is owner-scoped but still returns more internal fields than the UI renders; a narrower production projection remains advisable.
- The Admin/Seller bundle markers were verified from image contents and live pages; the staging browser QC used the real dashboards with real staging sessions.
