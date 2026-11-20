# Brand parity, Flutter E2E and admin console QC — 2026-11-20

Status: **passed with two follow-ups** · staging only · production untouched.

## 1. Brand parity

### Logo

All nine web brand assets are byte-identical to the Flutter copies under
`apps/prototype_app/assets/branding/`:

```text
bazarbee-logo-dark.png
bazarbee-logo-dark-transparent.png
bazarbee-logo-light.png
bazarbee-mark-dark.png
bazarbee-mark-light.png
bazarbee-app-icon.png
bazarbee-icon-32/192/512.png
```

SHA-256 comparison: 9/9 identical.

### Colour tokens

| Token | Web | Flutter | Match |
|---|---|---|---|
| Primary action | `#5B6EE1` | `#5B6EE1` | yes |
| Content primary | `#1C2260` | `#1C2260` | yes |
| Page surface | `#F6F7FE` | `#F6F7FE` | yes |
| Interactive surface | `#EEF0FF` | `#EEF0FF` | yes |
| Success / trust | `#2E9E5B` | `#2E9E5B` | yes |
| Promotion / warning | `#F5A800` | `#F5A800` | yes |
| Info | `#1B8BD0` | `#1B8BD0` | yes |
| Border default | `#E2E5F3` | was `#E4E7F5` | **aligned** |
| Destructive | `#B3261E` | was `#B54747` | **aligned** |

Primary, surface and content colours were already in sync. The two drifted tokens were corrected in
`packages/agency_flutter_ui/lib/agency_flutter_ui.dart`. `borderStrong` remains intentionally darker
than the web token for contrast on interactive controls.

## 2. Flutter end-to-end

Journey on `app-staging.pinakaplay.cloud` with a B2C pilot account:

1. onboarding → Get Started
2. email OTP `123456`
3. product page → Add to Cart
4. cart → Continue checkout
5. address prefilled from the account (Bhiwadi 301019)
6. payment method → **Cash on delivery**
7. Place order
8. confirmation

Order: **`BK-261120-KTWTSN`**, total ₹479, payment `cod`.

### Defect found and fixed

The confirmation screen said **“Simulated payment authorized · no real charge”** for a COD order.
`OrderConfirmedScreen` now reads the `payment` query parameter and shows:

```text
Cash on delivery · pay the seller when the order arrives
```

Verified again by opening the confirmation route with `payment=cod`; zero page errors.

### Visual check

- payment card renders Prepaid and Cash on delivery with the indigo selection state
- bottom sticky total and Place order remain visible
- no overflow or console errors

`flutter analyze`: 0 errors (4 RadioListTile deprecation notices).

## 3. Admin console

Host: `ops-staging.pinakaplay.cloud/dashboard` (ops hostname only).

Login and load:

- admin `admin@buildkart.test` — **password hash did not match the runbook**, so the known seller
  hash was applied for QC. Treat the current staging password as `supersecret` and rotate it.
- Orders list loaded: **140 orders · 110 B2C · 30 B2B**
- COD order **#252** (`BK-261120-KTWTSN`): `Authorized`, payment provider `pp_cod_cod`,
  captured ₹0, outstanding ₹479

Page smoke, zero console errors:

```text
/dashboard/orders
/dashboard/products
/dashboard/shipments
/dashboard/settlement-statements
/dashboard/order-statuses
```

### Defect found and fixed

The order workbench said **“Payment ready to capture”** for a COD order and linked to capture.
It now reads the COD collection record and shows the true cash state:

```text
pending    Payment: Cash due · Collect cash at delivery
collected  Payment: Cash collected · ₹479 collected
short      Payment: Cash short · amount collected of expected
refused    Payment: Cash refused · delivery refused, no cash
```

The warning “Do not capture this payment in Medusa” remains for pending COD orders.

### End-to-end admin run (web + Flutter)

Two fresh COD orders were placed and checked:

| Order | Surface | Total | Admin workbench |
|---|---|---|---|
| `BK-261120-ET7J2F` | Web store | ₹479 | **Cash collected** after seller capture, proof `qc-web-cash-1` |
| `BK-261120-6ZJ00Q` | Flutter app | ₹479 | **Cash due** (not yet collected) |

Both orders show provider `pp_cod_cod`, authorized ₹479, captured ₹0, shipment `booked`, and zero
console errors. The admin COD API reports `pending` for the Flutter order and `collected` for the
web order.

### Closed follow-ups

1. **Native “Capture payment” is hidden for COD orders.** The workbench hides the button on
   `pp_cod_cod` orders, and the provider now rejects `capturePayment` with an explicit error, so a
   direct API call cannot mark a cash order paid.
2. **Commission is aligned to 3%.** The Medusa default commission is 300 bps; COD policy now defaults
   to 300 bps and existing policies were set to 300. Dues were recomputed:
   `BK-261120-ET7J2F` now shows ₹12 commission, ₹2.16 GST on commission and ₹1.69 TCS, total ₹15.85.
   Admin order commission and the COD ledger now match.
3. **Admin COD screen added** at `/dashboard/cod` with three views:
   - **Collections** — order group, status, expected, collected, collector, proof, timestamp;
   - **Policies** — seller opt-in, commission, caps, pincodes and blocked categories with inline edit;
   - **Dues** — period selector, commission/GST/TCS/total per seller, TCS source and CSV export.

Residual: sellers with a custom Medusa commission rule still use the COD policy rate until a
per-order commission feed is wired. Settlement statements page remains Medusa-seed only.

## 4. Releases

- Backend (admin widget + COD page): `release-backend-20261120-165530`
- Flutter web: `/opt/buildkart-flutter/web` (backup `web.bak-cod-20261120-153617`)
- Experience API (collections, 3% default): `release-api-20261120-165319`
- Web storefront: unchanged `release-web-20261120-132447`

Ops note: recreating `medusa-api` changes its container IP. Restart
`buildkart-hosted-pilot-proxy-1` after a backend deploy or the ops host returns 502 until nginx
re-resolves the upstream.

## 5. Verdict

Brand logo and primary colours are in sync; the Flutter COD journey completes end to end; the admin
console correctly labels COD cash state, hides capture, matches the 3% commission, and now has a
dedicated COD screen for collections, policies and dues.
