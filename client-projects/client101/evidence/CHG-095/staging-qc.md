# CHG-095 — One B2C staging order QC

**Status:** QC COMPLETE — PASS WITH RECORDED RESIDUALS

**Completed:** 2026-10-29

**Environment:** staging only; production was not authorized or touched.

## Outcome

Exactly one B2C order was placed through the deployed customer web. The canonical order is visible
to its customer owner, Admin and the owning Seller; a different valid customer receives a 404 with no
order-number leak. Payment and logistics remained simulated, and all prohibited-effect counters stayed
unchanged.

```text
signed-out checkout
  → owner OTP sign-in
  → exact product/SKU checkout
  → one POST /api/checkout
  → canonical simulated order group
  → owner list/detail
  → Admin payment/refund view
  → owning Seller delivery/return view

different valid customer
  → same checkout reference
  → 404, no order-number leak
```

## Release identity and scope

| Item | Value |
|---|---|
| Release under test | `b7f93b9b6e4038d87f42e8f6a0b0fb852b485f5c` |
| Release path | `/opt/buildkart-releases/release-b7f93b9` |
| Final web health | healthy |
| Public API / app / Admin / Seller | 200 / 200 / 200 / 200 |
| Deployment | none; release stayed unchanged |
| Code/source change | none |
| Production | untouched and unauthorized |

The branch commits after the deployed SHA are governance/evidence and unrelated historical work; none
were released by CHG-095. No scoped runtime release or rollback action applies to this verification.

## Canonical order

| Field | Value |
|---|---|
| Checkout reference | `cart_01M633BMCPDPEFABNG2W2PQJZ9` |
| Order group | `og_01M633BSJSH4023AHJPCKHNNKA` |
| Medusa order | `order_01M633BSHHWEMM9YT6K5S7PVCZ` · #151 |
| Customer reference | `BK-261029-WT4R93` |
| Owner / channel | `pilot_customer_b2c04` / `b2c` |
| Line / customer total | `XZ5QR` × 1 / ₹514.05 |
| Payment | `pp_simulated_simulated` · authorized · explicit test data |
| Payment collection / session | `pay_col_01M633BS0R7K0PQ5XWYBX5AMV2` / `payses_01M633BS64P8550FF0SD5P9JB1` |
| Shipment | `ship_b95869b96fbe49df9a32295d041fb199` · booked · provider `simulated` |
| Tracking | `SIM-A8801363DD92` |
| Notification | `order_confirmed_v1` |
| Tryton move | none |

Order #151 is retained as the single allowed staging test record.

## Browser QC

### Customer — 24/24 PASS

- signed-out checkout redirected to sign-in with the exact product/SKU `next` path;
- OTP returned to that exact checkout;
- the owner cookie was HTTP-only, Secure and SameSite=Lax;
- exactly one checkout POST returned HTTP 200 and a canonical order group;
- confirmation identified simulated test-data payment;
- the new order was first in the owner list and its detail showed `XZ5QR`, ₹514.05 and booked tracking;
- desktop 1440×900 and mobile 390×844 had no document overflow;
- zero console errors, page errors or unexpected failed requests.

### Admin, Seller and ownership — 15/15 PASS

- Admin showed #151, Payment Authorized, Booked and No refund;
- UrbanBuild Supply showed #151, booked delivery and the explicit boundary that Admin manages payment/refunds;
- Admin/Seller desktop and Seller mobile had no document overflow;
- alternate valid customer `pilot_customer_b2c01` received HTTP 404 and no `BK-261029-WT4R93` leak;
- zero unexpected console errors, page errors or failed requests;
- one expected browser resource log accompanied the intentional owner-denial 404.

All ten screenshots were visually reviewed. Customer desktop/mobile, Admin desktop, Seller desktop and
the cross-owner denial rendered correctly. Seller mobile reproduces the pre-existing line price /
Allocated-badge overlap visible in CHG-094 order #150; it is non-blocking and not a CHG-095 regression.

## Before/after and provider boundaries

| Record | Before | After | Verdict |
|---|---:|---:|---|
| Medusa orders / groups | 38 / 29 | 39 / 30 | expected +1 / +1 |
| Simulated payment / collection / session | 23 / 34 / 34 | 24 / 35 / 35 | expected +1 each |
| Refund / order transaction | 1 / 1 | 1 / 1 | PASS — unchanged |
| Global order-payment links | 1 | 1 | unchanged; target order has none |
| Experience correlation / shipment / notification / event | 164 / 38 / 98 / 210 | 165 / 39 / 99 / 211 | expected +1 each |
| Returns | 4 | 4 | PASS — unchanged |
| External delivery attempts | 29 | 29 | PASS — unchanged; latest row predates QC |
| Tryton stock moves | 55 | 55 | PASS — unchanged |
| Tryton outbound / return shipments | 0 / 0 | 0 / 0 | PASS — unchanged |

Worker health remained `ok`, payment mode `simulated`, FCM delivery `disabled`, with zero failed or
dead-lettered activity. No real PSP, refund, order transaction, Tryton stock, external carrier,
notification delivery, settlement, accounting or production effect occurred.

## Requirement ledger

| ID | Requirement | Result | Evidence |
|---|---|---|---|
| R1 | Exactly one deployed-web B2C order | PASS | one checkout POST; orders 38 → 39; order #151 |
| R2 | Owner sign-in and exact return | PASS | customer QC redirect, cookie and OTP checks |
| R3 | Canonical simulated confirmation | PASS | HTTP 200; group `og_01M633…`; test-data flag |
| R4 | Owner list/detail visibility | PASS | list/detail screenshots and 24/24 report |
| R5 | Role-scoped Admin/Seller visibility | PASS | Admin/Seller screenshots and 15/15 report |
| R6 | No prohibited provider effects | PASS | before/after counts and worker health |
| R7 | Runtime quality | PASS | no unexpected errors/failures; visual review with known residual |

## Evidence artifacts

- `staging-baseline.json` — pre-write release, health and data counts.
- `staging-customer-checkout-qc.json` — the sole checkout writer and Customer 24/24 result.
- `staging-cross-surface-qc.json` — read-only Admin/Seller/ownership 15/15 result.
- `staging-post-write.json` and `staging-post-write-runtime.txt` — final counts, target records and worker health.
- `screenshots/` — ten reviewed Customer, Admin, Seller and security captures.
- `tools/` — the executed QC harnesses; credentials remain external and are not committed.

## Rollback and data disposition

No code or deployment rollback applies because CHG-095 released nothing. Order #151 and its simulated
payment/session, shipment, event and notification are retained as explicitly authorized staging test
data. Production remains immutable.

## Deferred / residual

- Payment-to-order linkage, three-decimal amount handling and Tryton reservation remain CHG-093
  product/architecture decisions. Native operations show Paid ₹0 and Outstanding ₹514.06 while the
  customer total is ₹514.05.
- B2B canonical ordering remains outside this B2C-only request.
- The pre-existing Seller-mobile line-summary overlap remains low severity and outside the no-touch scope.
- CHG-092 return-photo upload/read QC remains separately pending.
