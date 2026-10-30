# Product creation / add-product QC (preview stack)

**Date:** 2026-10-30
**Environment:** U-009 preview (`buildkart_u009_preview` + preview Experience API)
**Script:** `qc-product.py` (12/12 checks PASS)
**Public staging store:** not modified.

## Flow exercised

1. Admin session (`u009-qc@buildkart.test`).
2. Category picked from the live catalogue.
3. **Product Studio create** (`POST /admin/buildkart/product-studio`) acting for
   PowerMax Depot, with one variant and the B2C sales channel.
4. Studio read: seller offer auto-created, stock provisioned, readiness checks.
5. **Offer price** (`POST /admin/buildkart/offers/:id/pricing`) — ₹1,499.
6. Readiness re-check: all required checks pass, B2C visibility true.
7. Storefront verification:
   - Medusa Store `/store/products?q=…` returns the product.
   - Experience API `/v1/products` catalogue contains it.
   - `/v1/products/:id` detail returns one variant.
   - B2C cart add-to-cart returns unit price ₹1,499.
   - Cart bound to pincode 400001 resolves Delivery ₹49 (U-009) and totals.

## Result

| Item | Value |
|---|---|
| Product | `prod_01M66WZJ0JEJXEX4GYPR33E0FP` |
| Title | QC Test Steel Clamp 13mm |
| SKU | `QC-U009-CLAMP-13` |
| Handle | `qc-test-steel-clamp-13mm` |
| Offer | `offer_01M66WZJJ4CGB363B299AADM4X` |
| Price | ₹1,499 (stored `1499`, cart minor `149900`) |
| Status | `published`, B2C channel |
| Review | ready = true; B2C visible = true |
| Catalogue | present in the web-store feed (scanned 255 products) |
| Add to cart | unit price `149900` minor, 1 item |
| Delivery | PowerMax ₹49 applied (pincode 400001), cart total ₹147,305 |

## Observations

- **Product creation auto-publishes** (`status: published`); visibility is gated
  by the commercial readiness rule (published + channel + INR offer price +
  stock), which is why the product is absent from the feed until the offer price
  is set. The studio correctly reported `pricing: false` before the price and
  `ready: true` after.
- **Offer pricing amounts are major units** (Medusa convention). Sending
  `149900` produced ₹149,900; `1499` produces ₹1,499. The API validation message
  still says “minor units” — worth a follow-up copy fix.
- **SKU uniqueness includes soft-deleted products.** Deleting the first QC
  product left its variant SKU reserved, so the second run used a new SKU.
- The admin studio’s readiness call uses `EXPERIENCE_OPERATOR_BASE_URL`. The
  preview API container was restarted with that pointed at the preview
  Experience API; otherwise it would query the staging Experience API and
  falsely report “not published or not in channel”.

## Not done

- No product was created on the public staging store: the staging vendor/admin
  login could not be established in this session (no credentials, and
  `/auth/member/emailpass` is not exposed on the staging API host).
- No screenshot of the storefront UI; the verification is API-level against the
  exact feed the web store renders.
