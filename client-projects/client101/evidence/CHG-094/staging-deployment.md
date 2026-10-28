# CHG-094 — Staging deployment and checkout QC

**Status:** STAGING DEPLOYED AND VERIFIED

**Completed:** 2026-10-29

**Environment:** staging only; production was not authorized or touched.

**Deploy owner:** requester-authorized OpenCode agent

## Outcome

The customer web now requires owner sign-in before checkout, preserves the exact checkout path
through OTP, forwards the HTTP-only session to every cart/checkout call, and renders success only
after the Experience API returns a canonical simulated order group.

```text
checkout (signed out)
  → sign-in?next=/checkout?productId=…&sku=…
  → OTP verification
  → same checkout
  → POST /api/checkout with server-side HTTP-only session
  → canonical order group confirmation
  → owner order list/detail
```

## Release identity

| Item | Value |
|---|---|
| Baseline | `23bb1040d` · `/opt/buildkart-releases/release-23bb104` |
| Release branch | `release/chg-094` |
| Release commit | `b7f93b9b6e4038d87f42e8f6a0b0fb852b485f5c` |
| Release worktree | `/opt/buildkart-releases/release-b7f93b9` |
| Current symlink | `/opt/buildkart-releases/current -> release-b7f93b9` |
| Commit range | `23bb104..b7f93b9` — one commit, five approved web files |
| Deployed web image | `sha256:b708b8a9ac295688ac255552552590e68f9b4afacf7c020a9131e1862da48449` |
| Rollback web image | `buildkart-hosted-pilot-web:rollback-23bb104` · `sha256:fa241201…` |

The server-side diff contained only:

1. `apps/web/app/api/checkout/route.ts`
2. `apps/web/app/checkout/page.tsx`
3. `apps/web/app/sign-in/page.tsx`
4. `apps/web/app/sign-in/sign-in-form.tsx`
5. `apps/web/lib/experience-api.ts`

No Experience API, Medusa/Admin/Seller, compose, schema, worker or provider code was released.

## Deploy gate

| Gate | Result |
|---|---|
| Atomic deploy lock | PASS — requester-authorized OpenCode agent |
| Current release re-read before build | PASS — unchanged at `23bb1040d` |
| No-cache web build | PASS |
| CHG-094 marker in built and running image | PASS |
| `web` recreated only | PASS |
| `web` health | healthy |
| Proxy restart | PASS |
| API / app / Admin / Seller HTTP | 200 / 200 / 200 / 200 |
| Signed-out checkout | 307 to encoded owner sign-in return path |

## Deployed browser QC

### Customer journey

**31/31 PASS**, including:

- signed-out checkout redirect and exact `next` preservation;
- OTP return to the exact product/SKU checkout;
- HTTP-only, Secure, SameSite=Lax session;
- canonical server response and explicit simulated/test-data payment;
- desktop 1440×900 and mobile 390×844 confirmation/order views with no overflow;
- owner list and detail visibility;
- hostile protocol-relative `next=//example.com` rejected back to `/orders`;
- zero console errors, page errors or unexpected failed requests.

The first harness output (`staging-browser-qc-initial.json`) reported 16/18 because it incorrectly
expected product titles on native order cards and counted cancelled Next.js `_rsc` prefetches as
network failures. A read-only reconciliation checked the canonical order number and detail page,
classified only `net::ERR_ABORTED` `_rsc` requests as expected, and produced the final 31/31 report.
Both raw and reconciled evidence are retained.

### Admin and Seller visibility

**12/12 PASS** read-only checks:

- Admin order #150 renders Payment Authorized, Booked and No refund;
- owning Seller (UrbanBuild Supply) renders #150 and the Delivery and returns widget;
- desktop surfaces and Seller 390×844 have no document overflow;
- zero console errors, page errors or unexpected failed requests.

Visual inspection found one pre-existing low-severity Seller-mobile defect: the line price and
Allocated badge overlap at 390×844. Seller code was outside CHG-094 and was not changed.

## Canonical staging order

| Field | Value |
|---|---|
| Checkout reference | `cart_01M624MH558QNVK63BJVN0JQ8H` |
| Order group | `og_01M624MKXNDYY0EQ0DBYYQ96DN` |
| Medusa order | `order_01M624MKX6SNH9CTJ1RM6TXMAQ` · #150 |
| Customer reference | `BK-261028-B2HR38` |
| Owner / channel | `pilot_customer_b2c04` / `b2c` |
| Line / total | `XZ5QR` × 1 / ₹514.05 |
| Payment | `pp_simulated_simulated` · authorized · not linked to order |
| Shipment | `ship_eaa77870…` · booked · provider `simulated` |
| Notification | `order_confirmed_v1` |
| Tryton move | none |

Order #150 is retained as allowed staging test data.

## Before/after and provider boundaries

| Record | Before | After | Verdict |
|---|---:|---:|---|
| Medusa orders / groups | 37 / 28 | 38 / 29 | expected +1 / +1 |
| Simulated payment / collection / session | 22 / 33 / 33 | 23 / 34 / 34 | expected +1 each |
| Refund / order transaction | 1 / 1 | 1 / 1 | PASS — unchanged |
| Order-payment links | 1 | 1 | unchanged; known gap |
| Experience correlation / shipment / notification / event | 163 / 37 / 97 / 209 | 164 / 38 / 98 / 210 | expected +1 each |
| Returns | 4 | 4 | PASS — unchanged |
| External delivery attempts | 29 | 29 | PASS — unchanged; last row predates QC |
| Tryton stock moves | 55 | 55 | PASS — unchanged |
| Tryton outbound/return shipments | 0 / 0 | 0 / 0 | PASS — unchanged |

Worker health remained `ok`, payment mode `simulated`, FCM delivery `disabled`, with zero failed or
dead-lettered activity in the current workers. No real PSP, refund, order transaction, Tryton stock,
external carrier, notification-delivery, settlement or accounting effect occurred.

## Requirement ledger

| ID | Requirement | Result | Evidence |
|---|---|---|---|
| R1 | Forward owner session on every checkout call | PASS | canonical order #150 |
| R2 | Sign-in gate and exact return path | PASS | browser QC + 307 Location |
| R3 | Canonical success only | PASS | group `og_01M624…` |
| R4 | Safe local-only `next` | PASS | `//example.com` returned to `/orders` |
| R5 | Source typecheck/build/QC | PASS | local verification + no-cache image build |
| R6 | Five-file scoped release | PASS | `23bb104..b7f93b9` diff |
| R7 | Healthy deployed journey; no prohibited effects | PASS | browser/operator/data evidence |

## Rollback

```sh
docker tag buildkart-hosted-pilot-web:rollback-23bb104 buildkart-hosted-pilot-web:latest
ln -sfn /opt/buildkart-releases/release-23bb104 /opt/buildkart-releases/current
cd /opt/buildkart-releases/release-23bb104/services/hosted
docker compose -f docker-compose.hosted.yml up -d --no-deps --force-recreate web
docker restart buildkart-hosted-pilot-proxy-1
```

No schema rollback is needed. Orders #149 and #150 are retained staging test data and are not removed
by an image rollback.

## Deferred / residual

- Payment collection linkage, simulated capture policy and Tryton reserve/commit remain CHG-093
  decisions; order #150 therefore appears Pending/Paid ₹0 in native operations despite the authorized
  simulated session.
- B2B pricing and canonical order wiring remain unresolved in CHG-093.
- Seller mobile line-summary overlap is recorded but not changed because Seller code was a no-touch area.
- CHG-092 evidence-upload QC remains separately pending.
- Production remains unauthorized.
