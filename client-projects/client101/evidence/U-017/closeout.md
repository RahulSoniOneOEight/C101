# U-017 — PDP layout + demo gallery: closeout

- **Lane / release:** A / `static-ui` (Flutter web) + APK
- **Base:** `9e89956` (live release line, includes U-011 + chat parity)
- **Branch / worktree:** `feat/u017-pdp-gallery` @ `D:\C101-worktrees\bk-u017-pdp-gallery`
- **Status:** implemented, tested (312/312), web bundle built locally — **not deployed**.
- **Scope:** B2C PDP only. No API, DB, admin or B2B change.

## 1. What changed

| Area | Change |
|---|---|
| Gallery | 4:3 `contain` `PageView` slider, “n / 4” counter, dots, 44 px thumbnails, first slide = real thumbnail |
| Demo gallery | `lib/data/demo_gallery.dart` — Pexels complements for the 3 allowlisted products, app-side only |
| Honesty | Slides 2–4 carry a **“Representative image”** chip and semantics label “Representative image — not the exact product” |
| Identity | Brand → name → short detail (placeholder copy) → SKU · variant |
| Buy box | Price/MRP/% off, “In stock · Free delivery in 3–5 days”, variants, Add to Cart + Buy Now |
| Discuss | Now a small secondary `TextButton` under the buy controls — **not** a third full-width button and **not** in the sticky bar |
| Sticky bar | Appears after ~420 px: price + Add + Buy only |
| Sections | Trust card → Key specifications (demo) → Description (demo) → Full specifications (demo) → Price comparison → sellers → bought together → related |
| Price comparison | Moved below the specifications and clearly labelled staging |

## 2. Requirement ledger (plan §7)

| ID | Requirement | Status | Proof |
|---|---|---|---|
| R1 | 4 slides for the 3 allowlisted products, first = real thumbnail, others labelled; other products get no fake slides | **PASS** | `product_detail_u017_test.dart` (4 / 1 / 3-slide cases) + browser capture |
| R2 | Discuss secondary, not full-width, not in the sticky bar | **PASS** | test asserts `TextButton` and no Discuss inside `pdp-sticky-bar`; screenshot |
| R3 | Section order; variants precede CTA; comparison below specs | **PASS** | test asserts comparison below full specifications; screenshot |
| R4 | Sticky CTA after the buy box scrolls away, Add/Buy only | **PASS** | test scrolls 700 px and asserts the bar contents |
| R5 | Dummy specs/description clearly marked | **PASS** | “Demo content” chips on all three dummy sections |
| R6 | Out-of-stock disables the CTA | **DEFERRED** | the PDP has no stock flag in the product model today (pre-existing); unchanged behaviour |
| R7 | B2B unchanged | **PASS** | only `product_detail.png` golden changed; all B2B goldens byte-identical |
| R8 | No API/admin change; demo URLs never ship to production | **PASS** | app-side map only; URLs documented as staging demo content |

## 3. Verification

```text
flutter analyze            No issues found
flutter test               312/312 passed (B2B goldens unchanged)
flutter build web          build/web/main.dart.js 3,939,898 bytes (BUILD_ID=U017-local)
browser (local bundle)     IPHONE 17: 4 slides, “3 / 4”, Representative chip, Pexels images load
                           Add/Buy + secondary Discuss render in the planned order
```

Screenshots: `screenshots/pdp_iphone_gallery.png`, `pdp_iphone_buybox.png`.

## 4. Known constraints

1. The product’s own thumbnail is a Google-hosted image that fails to load in a browser
   (`encrypted-tbn3.gstatic.com`) — pre-existing data issue; the demo slides still render.
2. Colour/Size swatches stay **U-014** (real option values); the PDP renders the existing variant
   selector until then.
3. Prices still read ₹1,850 / ₹1,950 until U-013 ships with the data repair.
4. These Pexels URLs are staging demo content; phase 2 adds `images[]` to the API + real photos.

## 5. Deploy / rollback

- Deploy: merge onto the live release line, `build_staging_web.py --build-id <sha>`, Firebase hosting.
- Rollback: `firebase hosting:rollback` (previous release `e3cb365`).
