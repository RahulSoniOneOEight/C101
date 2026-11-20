# COD capture, policies, dues and Flutter UI — 2026-11-20

Status: **staging bundle complete** for seller-collected COD · TCS computes at a governed 18%
default until product rates exist · production untouched.

Change contract: `CHG-099`. Design: `docs/architecture/payments-cod.md`.

## 1. Delivered

### Cash capture and audit

New Experience API store `services/experience-api/src/store/cod-store.ts` with:

- `cod_collection` — one row per order group: `pending → collected | short | refused`, expected and
  collected amounts, collector, proof, reason, optimistic `version`;
- `cod_collection_event` — every transition, actor, roles and payload;
- `seller_dues_ledger` — commission, GST on commission, TCS, COD fee, adjustments.

Endpoints:

```text
GET  /v1/seller/shipments/:id/cod
POST /v1/seller/shipments/:id/cod        seller records cash
GET  /v1/admin/orders/:groupId/cod
POST /v1/admin/orders/:groupId/cod       correction, reason required
GET  /v1/seller/dues?period=YYYY-MM      seller statement (+ &format=csv)
GET  /v1/admin/cod/statements?period=…   all sellers (+ &format=csv)
GET/POST /v1/admin/cod/policies          seller opt-in, pincodes, categories, caps, commission
```

Seller portal: a **Cash on delivery** panel on the shipment detail page records collected / short /
refused with proof, reason and the current dues.

### Eligibility

- seller opt-in (new sellers default **off**; six staging sellers seeded on),
- pincode allowlist,
- blocked product categories,
- per-order cap plus seller policy override,
- buyer daily cap and seller daily cap,
- all evaluated server-side on the canonical cart.

### Idempotency

`cod_checkout_request` claims `(owner scope, idempotency-key)` with a request hash. Same key + same
payload replays the stored order; same key + different payload returns `409 idempotency-conflict`;
an in-flight key returns `409 checkout-in-progress`.

### Dues and TCS

On collection the seller ledger writes:

```text
commission        10% of the seller's goods value (policy bps)
GST on commission 18% of commission
COD fee           seller policy, default 0
TCS               0.5% of net taxable value; product `gst_rate` or a governed 18% default
```

When a product has no `gst_rate`, TCS is computed at the **18% default** and the ledger note says so.
The statement exposes `tcs_default_rate_applied: true` and `tcs_pending: false`; CSV export carries
the same note. A product-level rate overrides the default once supplied.

### Flutter

- Cart lines now expose `offer_id`.
- Checkout offers **Prepaid (staging simulated)** or **Cash on delivery**.
- COD calls `/v1/checkouts/cod/place` with an idempotency key and shows a cash-due confirmation.
- `flutter analyze`: 0 errors (4 RadioListTile deprecation notices); web release built and published.

## 2. Verification

### Eligibility matrix

```text
seller disabled                  400 cod-not-eligible · not enabled for a seller
pincode allowlist 999999         400 cod-not-eligible · postcode unavailable
blocked product category         400 cod-not-eligible · product unavailable
buyer daily cap ₹1               400 cod-not-eligible · buyer limit reached
policy restored                  200 order placed
```

### Idempotency

```text
first  200 BK-261120-Y8ZD93
replay 200 BK-261120-Y8ZD93 · idempotent_replay=true
changed payload 409 idempotency-conflict
```

### Cash capture

Order `BK-261120-Y8ZD93`, seller `sel_01M4EC9CVVHG168X1DHHBY29HY`:

```text
GET  seller cod   200 · pending · expected 47900 · version 1
POST seller cod   200 · collected · 47900 · proof qc-cash-receipt-1 · version 2
event             cod.seller_recorded · actor seller_qc
dues              commission 4000 · GST 720 · TCS 169 at 18% default
```

Admin correction:

```text
POST admin cod    200 · collector admin · reason "QC admin readback" · version 3
event             cod.admin_corrected
```

Statement:

```text
GET /v1/admin/cod/statements?period=2026-11   200
total_due_minor 4889 · tcs_pending false · tcs_default_rate_applied true
GET /v1/seller/dues?period=2026-11            200
```

Recompute after the 18% default was introduced:

```text
POST /v1/admin/cod/recompute-dues  200
collections 1 · seller_dues_recomputed 1 · default_gst_rate_percent 18
```

Fresh order check: `BK-261120-GAKT78` captured with TCS **169** at the 18% default, no recompute.

Final placement check after the bundle: `BK-261120-V7HRJ1`, `cod / pending`.

## 3. Defect found and fixed

`/v1/admin/cod/*` returned `401 authentication-required` for the admin service identity. The global
`privilegedRoles` gate maps all unmatched `/v1/admin/*` paths to `super_admin`, so the marketplace
service identity was rejected before the route ran. Added a COD-specific mapping:

```text
/v1/admin/cod  ->  marketplace_operator, finance_operator, super_admin
```

Admin COD routes now work through the same service-auth path as shipments.

## 4. Releases

- Backend: `release-backend-20261120-131634`
- Experience API: `release-api-20261120-150022` (final, 18% TCS default)
- Web: `release-web-20261120-132447`
- Flutter web: `/opt/buildkart-flutter/web` (backup `web.bak-cod-20261120-134110`)

## 5. Still open

- **Product GST rate**: TCS now uses a **18% default** because no product carries `gst_rate`. This is
  an interim rate, not a tax determination: exempt or differently-rated goods will over- or
  under-collect until sellers supply the product rate. The override key is product metadata
  `gst_rate`; a Product Studio field and finance approval are still needed.
- **Medusa payment capture**: cash capture writes the COD ledger and audit, but the Medusa payment
  session remains `authorized`; it is not captured via the admin API. The COD ledger is the source of
  truth for cash. Align the two before finance reporting.
- Seller COD panel and admin correction were verified by API, not visually in the seller dashboard.
- Flutter COD was analyzed and built, not journey-tested in a browser.
- CSV exports are API-only; there is no statement screen in the admin console.
- Delivery-fee ownership, refusal/forfeiture legal review and the dues suspension thresholds remain
  policy decisions.
- Production untouched.

## 6. Verdict

Every COD mechanic requested is now present on staging: capture with proof and audit, admin
correction, seller-level opt-in and limits, idempotent placement, a seller receivable with statement
and TCS at the 18% default, and a Flutter payment choice. The remaining blockers are the product-wise
GST rates, one accounting alignment (Medusa capture) and visual UAT, not missing COD state.
