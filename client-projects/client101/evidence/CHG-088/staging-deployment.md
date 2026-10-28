# CHG-088 — Staging deployment and order-page QC

**Status:** STAGING DEPLOYED AND VERIFIED
**Change:** CHG-088 Revision 1 — native order operations, return context and fulfillment depth
**Environment:** staging only. Production is not authorized and was not touched.
**Deploy owner:** requester-authorized OpenCode agent
**Completed:** 2026-10-29

---

## 1. Release identity

| Item | Value |
|---|---|
| Baseline before release | `/opt/buildkart-releases/release-0dfdbff` (`0dfdbff`, CHG-087) |
| Target branch | `release/chg-088` |
| Release commit | `2bdc55503` |
| Commit range | `0dfdbff..2bdc555` — one feature commit; 5 files |
| Release worktree | `/opt/buildkart-releases/release-2bdc555` |
| Current symlink | `/opt/buildkart-releases/current -> release-2bdc555` |
| Rollback release | `/opt/buildkart-releases/release-0dfdbff` |
| Rollback image | `buildkart-hosted-pilot-medusa:rollback-0dfdbff` (`64b4bfbcab7f`) |
| New image | `buildkart-hosted-pilot-medusa:latest` (`fef65afae70e`) |
| Production | Not authorized, not touched |

No infrastructure or schema change: `services/hosted` is identical between `0dfdbff` and `2bdc555`. Only the Admin and Seller dashboard bundles inside the Medusa image changed.

---

## 2. Pre-change gates

| Gate | Result |
|---|---|
| Staging current re-read | `release-0dfdbff` |
| Public health before change | API 200, ops 200, Admin 200, Seller 200, app sign-in 200 |
| Rollback image tag | Created from the running `0dfdbff` image before deploy |
| No-cache Medusa build | PASS |
| Bundle markers in image | PASS — `Open return workbench`, `Partially delivered` in Admin and Seller assets |

---

## 3. Deploy

`medusa-api` was recreated from `release-2bdc555` with `--no-deps`; `proxy` was restarted. No other service was recreated.

| Check | Result |
|---|---|
| Running image | `sha256:fef65afae70e…` (`buildkart-hosted-pilot-medusa`) |
| `medusa-api` health | healthy |
| `https://api-staging.pinakaplay.cloud/health` | 200 |
| `https://ops-staging.pinakaplay.cloud/health` | 200 |
| `/dashboard/` | 200 |
| `/seller/` | 200 |
| `https://app-staging.pinakaplay.cloud/sign-in` | 200 |
| Served Admin bundle contains CHG-088 markers | PASS |
| Served Seller bundle contains CHG-088 markers | PASS |

---

## 4. QC fixture

Experience-only and removed after QC. No Medusa order, payment, refund, Tryton movement or carrier call was created.

| Field | Value |
|---|---|
| Fixture | `chg088_staging_qc` |
| Order page (Admin and Seller) | `#137` / `order_01M5Y5K08DDZDPARWB2X73YG6Q` |
| Order group | `og_01M5Y5K08Z21PYDZY7M8CMS3KD` |
| Seller | BuildMaster Supplies (`sel_01M4EC9C7YNSFGCG6A4B3Q6PG8`) |
| Return | `ret_2cfaed38ec284cc6a6bef747e471fa8f` |
| Lifecycle driven | `requested → approved → received → inspection_complete → closed` |
| Refund projection | `SIM-REFUND-A03BB208`, ₹3,990.00, `simulated_completed` |
| Delivery order page | `#128` / `order_01M5VZ85WVBDPS2PXK0WTWH8X7` (booked shipment) |
| Delivery fixture | `ship_chg088stagingqc` in throwaway group `og_chg088qc` (API acceptance only) |

The existing approved return `ret_70822cba…` on the same order group was left untouched and served as a second live card during QC.

---

## 5. Browser QC

**Result: 96/96 PASS** (32 checks × 3 lifecycle phases), 36 screenshots, zero console errors, zero unexpected failed requests, at 390×844 and 1440×900.

| Phase | Admin order page | Seller order page |
|---|---|---|
| `received` | Received · inspection pending; legacy "Return Completed" absent; workbench link | Same status, no refund data, no decision action |
| `inspection_complete` | Inspection complete · refund pending; no refund reference yet | Inspection status only |
| `closed` | Closed + Simulated refund ₹3,990 + `SIM-REFUND-A03BB208` + no-real-money/stock wording | Closed — workflow evidence only; no amount, no reference |

Order operations tile in all phases: Payment as native, Refund shows `No refund` then the simulated refund, Return shows `Received`/inspection pending, Delivery totals.

### Fulfillment depth

| Check | Result |
|---|---|
| Booked shipment on #128 — Admin delivery options | `Ready for pickup`, `Dispatched`, `Cancelled` (exactly 3, derived from `allowedTransitions`) |
| Booked shipment on #128 — Seller delivery options | `Ready for pickup`, `Dispatched` (exactly 2; cancellation excluded) |
| Delivered shipment on #137 | No update control; "Completed — no further delivery updates." |
| Partial delivery acceptance (real Admin API) | `out_for_delivery → partially_delivered`, v1→v2, proof `POD-CHG088-QC-01`, line delivered 1 of 2 |
| Required fields | Reason required in every case; proof required for delivery evidence; attempt/buyer-action/delay fields render from status |

The partial-delivery submission was exercised through the Admin API with the exact payload the order-page form builds. Submitting it from the browser against a live pilot order was not performed: the one-shipment-per-seller-per-group constraint and the absence of a disposable Medusa order would require mutating a real staging order. The browser checks cover the rendered form and option derivation.

Evidence:

- `staging-order-qc-received.json`, `staging-order-qc-inspected.json`, `staging-order-qc-refunded.json`
- `staging-screenshots/{admin,seller}/{desktop,mobile}/`
- `tools/staging-order-qc.cjs`

---

## 6. Zero-effect evidence

Counts before the fixture and after cleanup are identical:

| System | Before | After |
|---|---|---|
| Medusa `payment` | 20 | 20 |
| Medusa `refund` | 1 | 1 |
| Medusa `order_transaction` | 1 | 1 |
| Medusa `payment_collection` | 31 | 31 |
| Medusa `payment_session` | 31 | 31 |
| Tryton `stock_move` | 55 | 55 |
| Tryton shipment tables | 0 each | 0 each |

The fixture script asserted deep equality and failed closed on any change.

---

## 7. Cleanup

| Item | Result |
|---|---|
| Fixture return and lines/events/refund projection | 0 rows |
| Fixture shipment, lines, events | 0 rows |
| Domain events for correlation `chg088-staging-qc` | 0 rows |
| Notifications created for the fixture | 0 rows |
| Privileged-audit rows for the fixture calls | 4 removed (synthetic fixture only) |
| Return cases / shipments after cleanup | 4 / 35 — same as before |
| QC script in the running container | Removed |
| External notification delivery attempts | Unchanged: 29 rows, last attempt `2026-10-28T13:43:48Z`, before this QC |

Staging FCM remains enabled with a pre-existing dead-letter backlog (29 rows). No delivery attempt was created by this QC; the owner had no active device registration. Remediation is still required before wider tester use.

---

## 8. Rollback

```sh
docker tag buildkart-hosted-pilot-medusa:rollback-0dfdbff buildkart-hosted-pilot-medusa:latest
ln -sfn /opt/buildkart-releases/release-0dfdbff /opt/buildkart-releases/current
cd /opt/buildkart-releases/release-0dfdbff/services/hosted
docker compose -f docker-compose.hosted.yml up -d --no-deps --force-recreate medusa-api
docker restart buildkart-hosted-pilot-proxy-1
```

No schema or data rollback is required: the release changed dashboard code only.

---

## 9. Deferred and residual

- Production release remains unauthorized.
- Real refunds, Tryton stock disposition, Shiprocket/carrier, settlement/accounting and legal/tax wording remain deferred.
- Partial delivery is proven at API level; a browser submission against a disposable order is deferred.
- Order-list/summary redesign remains a design artifact; native Mercur order pages were enhanced, not replaced.
- Customer web return initiation and return evidence upload remain outside CHG-088.
