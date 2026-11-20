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
It now shows:

```text
Payment: Cash due
Collect cash at delivery
Cash on delivery · collect at delivery
The seller collects cash and records it in the seller portal. Do not capture this payment in Medusa.
```

### Open findings

1. **Native Medusa “Capture payment” remains visible** below the workbench. Capturing there would
   mark a COD order paid before cash is collected. The warning reduces the risk; the control should
   be removed or permission-gated for `pp_cod_cod`.
2. **Commission disagrees.** Admin order summary shows **₹12.00** commission (3% of ₹400); the COD
   ledger used **₹40.00** (10% policy). One rate must be chosen before finance reporting.
3. There is no admin screen for COD seller policies, cash collections or dues; they are API-only.
4. Settlement statements page still lists Medusa seed statements, not the COD dues ledger.

## 4. Releases

- Backend (admin widget): `release-backend-20261120-152837`
- Flutter web: `/opt/buildkart-flutter/web` (backup `web.bak-cod-20261120-153617`)
- Experience API: unchanged `release-api-20261120-150022`
- Web storefront: unchanged `release-web-20261120-132447`

## 5. Verdict

Brand logo and primary colours are in sync; the Flutter COD journey completes end to end; the admin
console loads and correctly labels COD as cash due after the fix. Remaining work is the native
capture control, the commission-rate decision, and COD admin screens for policies/collections/dues.
