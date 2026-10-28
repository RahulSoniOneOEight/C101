# CHG-089 — Staging deployment and submit-path QC

**Status:** STAGING DEPLOYED AND VERIFIED
**Change:** CHG-089 Revision 1 — customer web return initiation
**Environment:** staging only. Production is not authorized and was not touched.
**Deploy owner:** requester-authorized OpenCode agent
**Completed:** 2026-10-29

---

## 1. Release identity

| Item | Value |
|---|---|
| Baseline before release | `/opt/buildkart-releases/release-2bdc555` (`2bdc555`, CHG-088) |
| Target branch | `release/chg-089` |
| Release commit | `bab4e5171` |
| Commit range | `2bdc555..bab4e51` — one feature commit; 6 code files plus CHG-089 governance/evidence |
| Release worktree | `/opt/buildkart-releases/release-bab4e51` |
| Current symlink | `/opt/buildkart-releases/current -> release-bab4e51` |
| Rollback release | `/opt/buildkart-releases/release-2bdc555` |
| Rollback image | `buildkart-hosted-pilot-web:rollback-2bdc555` (`16e4494fe52d`) |
| New web image | `buildkart-hosted-pilot-web:latest` (`4250786d4468`) |
| Production | Not authorized, not touched |

No schema and no Experience API change. Only the customer web image was rebuilt and `web` was recreated; `proxy` was restarted.

---

## 2. Pre-change gates

| Gate | Result |
|---|---|
| Staging current re-read | `release-2bdc555` |
| Public health before change | API 200, app sign-in 200 |
| Rollback image tag | Created from the running `2bdc555` web image before deploy |
| No-cache web build | PASS |
| Marker in image | PASS — `Start a return` in `/app/.next/server/app/orders/[id]/…` chunks |

---

## 3. Deploy

| Check | Result |
|---|---|
| Running image | `sha256:4250786d4468…` |
| `web` health | healthy |
| `https://app-staging.pinakaplay.cloud/sign-in` | 200 |
| `https://api-staging.pinakaplay.cloud/health` | 200 |
| `/dashboard/` (Admin) | 200 |
| Server-rendered route present | `/orders/[id]/returns/new` |

---

## 4. Submit-path QC

**Result: 13/13 PASS**, 4 screenshots, zero console errors, zero unexpected failed requests.

| Step | Result |
|---|---|
| Owner sign-in (simulated OTP) | PASS |
| Order page shows Start a return | PASS |
| Return form renders eligible lines | PASS |
| Submit disabled at zero units, enabled after one | PASS |
| Submit creates the return | PASS — `ret_e624bfb25b20406e80c2ac89a9b8f871` |
| Redirect to the return status page | PASS |
| Status is `requested`, not decided or refunded | PASS |
| Progress starts at "Request recorded" | PASS |
| No-refund boundary wording | PASS |
| New return listed on the order page | PASS |
| Mobile 390×844 view of the created return | PASS, no overflow |

Fixture: one unit of `OHS-CHR-1787` on order `cart_01M5Y54HVDTDJ2MTP6X45Q5W9R` (#137 group), reason
`damaged`, note `CHG-089 staging QC: temporary return, safe to remove.`

Evidence:

- `staging-submit-qc.json`
- `staging-screenshots/{desktop,mobile}/`
- `tools/staging-submit-qc.cjs`

---

## 5. Zero-effect evidence

Counts before the fixture and after cleanup are identical:

| System | Before | After |
|---|---|---|
| Medusa `payment` | 20 | 20 |
| Medusa `refund` | 1 | 1 |
| Medusa `order_transaction` | 1 | 1 |
| Medusa `payment_collection` | 31 | 31 |
| Medusa `payment_session` | 31 | 31 |
| Experience returns | 4 | 4 |
| Experience return events | 10 | 10 |
| Experience refund simulations | 0 | 0 |
| Experience notifications | 95 | 95 |
| Experience delivery attempts | 29 | 29 |
| Experience domain events | 207 | 207 |
| Tryton `stock_move` | 55 | 55 |
| Tryton shipment tables | 0 each | 0 each |

No notification delivery attempt was created; the owner has no active device registration.

---

## 6. Cleanup

| Item | Result |
|---|---|
| Fixture return and lines/events | 0 rows |
| `return.requested` domain event | 0 rows |
| Notification created for the event | 0 rows |
| Privileged-audit rows | none created for the customer route |
| Counts after cleanup | identical to baseline |

---

## 7. Rollback

```sh
docker tag buildkart-hosted-pilot-web:rollback-2bdc555 buildkart-hosted-pilot-web:latest
ln -sfn /opt/buildkart-releases/release-2bdc555 /opt/buildkart-releases/current
cd /opt/buildkart-releases/release-2bdc555/services/hosted
docker compose -f docker-compose.hosted.yml up -d --no-deps --force-recreate web
docker restart buildkart-hosted-pilot-proxy-1
```

No schema or data rollback is required.

---

## 8. Deferred and residual

- Production release remains unauthorized.
- Return evidence upload needs object storage and a retention policy.
- Real refunds, Tryton disposition, carrier and settlement remain deferred.
- The API rejection path (ineligible line, over-quantity) is enforced server-side and covered by the
  existing acceptance suite; this QC exercised the happy path only.
- Staging FCM remains enabled with its pre-existing dead-letter backlog.
