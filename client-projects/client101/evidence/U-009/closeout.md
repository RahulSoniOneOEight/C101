# U-009 / B004 — Closeout

**Date:** 2026-10-30
**Branch:** `feat/u009-pincode-delivery`
**HEAD:** `0cdba54`
**Base / rollback:** `186a50f`
**Preview API image:** `buildkart-hosted-pilot-medusa:u009-preview` built from `0cdba54`
**Preview Experience API:** `buildkart-u009-preview-experience` built from the branch, running against a cloned experience DB
**Preview DBs:** `buildkart_u009_preview` and `buildkart_experience_u009_preview`
**Staging:** **not switched.** `/opt/buildkart-releases/current` is still `release-186a50f`, customer host 200.
**Production:** untouched.

---

## 1. Requirement ledger

| ID | Requirement | Status | Evidence |
|---|---|---|---|
| R1 | Migration creates `seller_delivery_rate` with unique + indexes; up/down clean | **PASS** (up) / **DEFERRED** (down) | Applied to the preview DB; `\d seller_delivery_rate` shows the unique `(seller_id,pincode)`, `(pincode,active)` index, non-negative fee check and actor check. `down()` exists but was not run while the table is in QC use. |
| R2 | Admin API + UI: list/search/filter, create, edit fee/active, delete, bulk import, validation | **PASS** (API) / **PASS-CODE** (UI) | HTTP: list 200, create 201 (`4900` minor, `updated_by=admin`), bulk `created=2 errors=1`, patch, delete, invalid pincode 422. The page compiles in the image build; visual QC deferred. |
| R3 | Seller API + UI scoped to own seller; cross-seller access denied | **PASS-CODE** | Vendor routes derive `seller_id` only from `vendorSellerId(req)` and include it in every lookup; unauthenticated request → 401. Member-authenticated vendor HTTP QC deferred (no staging vendor credentials in this session). |
| R4 | Admin edit wins; `updated_by` recorded | **PASS** | Admin writes `updated_by=admin`, seller writes `updated_by=seller`; one row per seller+pincode means last write wins. |
| R5 | One calculated Delivery option per seller; Standard/Express inactive for new carts; existing orders unchanged | **PASS** | Provisioning created 5 Delivery options (seller-linked) and flipped 10 legacy options to `enabled_in_store="false"`; order history untouched. |
| R6 | Home address binds to cart and resolves fee without a checkout visit | **PASS** | Live E2E: `POST /v1/carts/:id/customer-details` returned `delivery.lines[0].status="applied"` and `shipping_total=4900` before checkout. |
| R7 | Cart shows the per-seller fee and total; cart total includes it | **PASS** | Live E2E: B2C cart `shipping_total=4900`, `total=14,729,900` minor (₹147,299); B2B `14,444,900` (₹144,449). Cart metadata carries one applied line per seller with `seller_name`. |
| R8 | Checkout shows delivery read-only; only address required | **PASS** (code + widget test) | Tier radio removed; `checkout_canonical_flow_test` asserts two read-only seller lines and no Standard/Express. |
| R9 | Missing row → ₹99; multi-seller sums fees | **PASS** | Live gate: seeded → ₹29, missing pincode → ₹99, inactive row → ₹99. Multi-seller is the per-cart-seller loop in `applyDeliveryForCart`. |
| R10 | Pincode change re-resolves; rate change affects new carts without deploy | **PASS** | Live gate re-resolved 302001→999999→302001 on one cart. E2E seeded `(PowerMax, 400001) = ₹49` through the admin API, then a new cart charged ₹49. |
| R11 | Free-shipping offers still apply and render a discount line | **DEFERRED** | `shipping_discount_total` is exposed and rendered; no live FREESHIP/TRADEVIP cart in this session. |
| R12 | Order API exposes `shipping_total`, `shipping_discount_total`, `total`; order page shows the real fee | **PASS** | Experience API order: `shipping_minor=4900`, `total_minor` set. Admin order API: order #165 `shipping_total=49`, `total=147299`, method `Delivery ₹49`; order #166 `shipping_total=49`, `total=144449`. |
| R13 | Tests: module/unit, API, Experience API, Flutter analyze/test; admin + vendor builds | **PASS (with one known pre-existing golden)** | `tsc` PASS; Jest 5/5; Experience API `tsc --noEmit` PASS; `flutter analyze` clean; `flutter test --exclude-tags golden` 274/274; image build compiles API, admin and vendor. `visual_golden_test` "b2b checkout" fails on the base commit too (7.53% pixel drift). |

---

## 2. Live Phase 0 gate (clean image `0cdba54`)

```json
{
  "status": "PASS",
  "checks": {
    "seeded_is_29_major": true,
    "missing_is_99_major": true,
    "inactive_is_99_major": true
  },
  "steps": [
    { "step": "create_calculated_option", "status": "reused", "optionId": "so_01M66EPQ34KSFQ16ZR0EKK9M9J" },
    { "step": "seeded_pincode", "pincode": "302001", "amount": 29 },
    { "step": "missing_pincode", "pincode": "999999", "amount": 99 },
    { "step": "inactive_pincode", "pincode": "302001", "amount": 99 }
  ]
}
```

Amounts here are Medusa major units (₹29 and ₹99). The provider divides the
stored minor fee by 100.

## 3. End-to-end QC — home, B2C order, B2B order

Script: `evidence/U-009/qc-e2e.py` (22/22 checks PASS). It drives the same
Experience API endpoints the Flutter app calls, against the preview Medusa
image and an isolated Experience API (own DB, own NATS/Redis; NATS was
disconnected so cross-system events were disabled).

### Home page
| Check | Result |
|---|---|
| `/health` | 200, `pilot_user_count=21`, simulated payment |
| `GET /v1/products?limit=6` | 200, 6 products |
| `GET /v1/content/app-shell` | 200, 9 content items |
| `GET /v1/content/presentation` | 200 |
| `GET /v1/content/curated-collections` | 200 |

### B2C — `rsoni001@gmail.com`
| Step | Result |
|---|---|
| Cart | `cart_01M66PFKV2YWMVRBA4EQV505V8`, channel `b2c` |
| Line | PowerMax “Sumsan Fold 7”, 1 × ₹155,000 |
| Address 400001 → delivery | `Delivery · PowerMax Depot`, **₹49.00**, applied |
| Cart totals | subtotal ₹155,000, discount ₹7,750, delivery ₹49, total ₹147,299 |
| Order | `BK-261030-0RSK1D`, group `og_01M66PFS9EVRCHCPVY673X9GT6`, Medusa #165 |
| Customer order read | `shipping_minor=4900`, `total_minor=14,729,900` |
| Admin order read | `shipping_total=49`, `total=147299`, method `Delivery ₹49` |

### B2B — `buyer.b2b01@buildkart.test` (Arjun Traders)
| Step | Result |
|---|---|
| Cart | `cart_01M66PFSWM0Q293RAR81MAHATV`, channel `b2b` |
| Line | PowerMax “Sumsan Fold 7”, 1 × ₹152,000 (B2B price) |
| Address 400001 → delivery | `Delivery · PowerMax Depot`, **₹49.00**, applied |
| Cart totals | subtotal ₹152,000, discount ₹7,600, delivery ₹49, total ₹144,449 |
| Order | `BK-261030-E4ZEDZ`, group `og_01M66PFYHB2PKZWZ9NRYWP0PR2`, Medusa #166 |
| Customer order read | `shipping_minor=4900`, `total_minor=14,444,900` |
| Admin order read | `shipping_total=49`, `total=144449`, method `Delivery ₹49` |

Both orders belong to PowerMax Depot (seller link present), are `pending` with
a simulated payment collection/session, and carry the real ₹49 delivery fee in
the customer payload and the Medusa order.

## 4. Defects found by the E2E run (both fixed in `0cdba54`)

1. **Major vs minor units.** The provider returned the stored minor amount
   (4900) as a Medusa amount, charging ₹4,900 instead of ₹49. The provider now
   returns `minor / 100`; the gate expects 29/99/99 major units.
2. **Missing seller link.** Mercur’s storefront groups shipping options by the
   `shipping_option ↔ seller` link. Provisioned options had no link, so
   `/store/shipping-options` returned `{}` while pricing worked. The
   provisioning script now creates the link (idempotent), matching Mercur’s
   `linkSellerShippingOptionStep`.

## 5. Deferred register

| Item | Why | Next step |
|---|---|---|
| Vendor HTTP QC with a member session | No staging vendor credentials in this session | Log in as a seller member; repeat CRUD + cross-seller 404 |
| FREESHIP / TRADEVIP live cart | No promotion test | Apply each code to a fee-bearing cart and assert the shipping discount line |
| Admin/Vendor page visual QC + screenshots | No browser session against the preview dashboard | Open both pages; create/edit/delete/import; capture screenshots |
| Migration `down()` | Table in active QC use | Run on a throwaway clone before release |
| Staging deploy | Brief forbids it; human gate only | Release bundle: migration → image → switch → health → proxy → QC |
| B2B Standard/Express selector in the B2B UI | API ignores the tier now (`/delivery`) | Remove the selector in a follow-up |
| Web checkout delivery | Out of scope (C-10) | Separate change |

## 6. Residual risks

1. **Calculated options are unpriced in Mercur’s store list.** The app reads
   the amount from the applied cart method. Any future UI that reads
   `/store/shipping-options.amount` for a calculated option would show 0.
2. **Bulk import caps at 5,000 rows per request**; 19k pincodes need four
   batches.
3. **One row per (seller, pincode)**; audit is `updated_by` + `updated_at`.
4. **Preview artifacts remain on the host**: `buildkart_u009_preview`,
   `buildkart_experience_u009_preview`, `buildkart-u009-preview-api`,
   `u009-preview-experience`, `u009-preview-nats`, `u009-preview-redis`,
   image `u009-preview`, worktree `/opt/buildkart-preview-u009`.

## 7. Rollback

- Staging: still `release-186a50f`; nothing to roll back.
- Preview: stop/remove the preview containers; drop the two preview databases;
  delete the preview image.
