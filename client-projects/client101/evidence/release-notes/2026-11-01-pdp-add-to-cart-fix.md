# Update note — PDP add-to-cart fix + benchmark batch (2026-11-01, evening)

- **Bundle:** `fix(pdp)` — `59e8796` + `ebf5b92`
- **Live web:** `ebf5b92` · 3,942,376 bytes · SHA-256 `95e9ef9582692a9332ccfa6243a929d5e173f86f1559e4a14e1c5b634dca7211` · banner `STAGING · ebf5b92`
- **Scope:** B2C product page + shell navigation. No API, DB, admin or B2B flow change.

## 1. The reported bug

“Add to cart is not working in products.” The API call was working all along — the cart was
updated — but the UI gave **no visible confirmation**:

- the toast lived for **900 ms** and sat behind the buy controls on a tall PDP;
- the bottom navigation had **no cart count**, so nothing changed on screen.

`cart_feedback_test` even pinned the 900 ms window.

### Fix

| Change | Detail |
|---|---|
| Toast | 900 ms → **1800 ms**, unchanged position above the nav |
| Add button | flips to **“Added”** with a check for **1.6 s**, then returns to “Add to Cart” |
| Cart badge | the bottom-nav **Cart** item now shows the live item count (`BottomNavItem.badgeCount`) |

Verified live: label flips at ~1.3 s, toast “Added 1 to cart”, badge `1`, cart line quantity 2 after
using the stepper.

## 2. Benchmark items shipped in the same batch

| Item | What it does |
|---|---|
| **Quantity stepper** | `Qty [− n +]` above the buy controls; Add/Buy carry that quantity (verified: qty 2 → cart line 2, FLAT5 −₹43.20) |
| **Breadcrumb** | “Catalogue / {category}” above the brand |
| **Share** | App-bar share copies the product link and confirms with a toast |
| **Buy emphasis** | Buy Now stays the filled primary, Add to Cart the outline |

## 3. Benchmark roadmap (not shipped — needs data/API)

| Priority | Item | Blocker |
|---|---|---|
| P0 | Pincode serviceability block (deliverable / fee / ETA) | needs a PDP-level serviceability read (cart endpoint is per-address) |
| P0 | Real product images (`images[]`) | API/model + real photos; demo Pexels stays staging-only |
| P0 | Swatches + size chart | composed product payload exposes no option values (U-014 has the data in Medusa) |
| P0 | Real specifications | catalogue content |
| P1 | Unit price + GST line | needs a unit-of-measure field on the composed product |
| P1 | Reviews/Q&A | no data source |
| P2 | EMI calculator, desktop 60/40 layout | product decision + layout work |

## 4. Verification

```text
flutter analyze      No issues found
flutter test         312/312 passed (product_detail golden refreshed)
deployed bundle      3,942,376 bytes · sha256 95e9ef95…dca7211 · live == local
live QC              add → "Added" + toast + badge 1; qty 2 → cart 2; checkout fee ₹99, total present
console/page errors  0
```

Screenshots: `client-projects/client101/evidence/qc/screenshots/pdp_added.png`,
`pdp_added_qty2.png`, `cart_qty2.png`, `checkout_after_fix.png`.

## 5. Rollback

Redeploy `3e28237` (previous bundle) or `firebase hosting:rollback --project buildkart-staging`.
No data change in this batch.

---

## 6. Follow-up — iPhone14 gallery and rebuilt APK (`3daaaff`)

- **iPhone14** (`prod_01M5WHD7PM31ZN6GNAEKQTRZ76`) joined the demo gallery: 4 slides, first = its own
  catalogue thumbnail, slides 2–4 = Pexels smartphone references labelled “Representative image”.
  Verified URLs (200): 1092644, 404280, 699122.
- **Live web:** `3daaaff` · 3,942,634 bytes · SHA-256 `9426546dc53fa79829e12f3b9892c8ab918ca87e50f0066eaa7a62199aa07c9a`.
- **APK rebuilt:** `app-release-3daaaff.apk` · 62,975,115 bytes · SHA-256
  `a31778665ca5460c08087256cfb3a27a862fe7ebece85ce1778d8cd6fa332f0c` · `CN=BuildKart Staging`.
- 313/313 app tests; `iPhone14 is allowlisted with four slides` added.
- Note: iPhone14's catalogue thumbnail is a placeholder gradient, so slide 1 shows that placeholder.

Screenshots: `evidence/qc/screenshots/iphone14_slide1.png`, `iphone14_slide3.png`.
