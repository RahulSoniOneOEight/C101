# Browse filters: product type, folded facets, B2B parity, one tile control (2026-11-02)

**Live web:** `68f5125` · `main.dart.js` 3,998,004 bytes · SHA-256
`06edf11cb047d4a5a724078fe08b1b1d97b8a00dc4cd3dd12b5a42f9e056b66e` · banner `STAGING · 68f5125`

## 1. What changed

### Retail Browse
- **Category is out of the filter sheet.** The icon rail above the grid already
  owns category; the sheet now filters on **Product type**
  (`metadata.product_type` from Studio) with live counts.
- **Every facet is a collapsible section.** Only Product type and any facet with
  a live selection start open; Price, Brand, Seller, Availability and Key items
  fold to a header with a one-line summary (`Any`, `15`, `2 selected`). The
  sheet opens as a short list instead of a long scroll.
- The sheet's confirm button was using the filter-chip ink (the palette's
  destructive red); it is now the primary action colour.

### Trade catalogue (B2B)
- The same filter pattern: **Product type, Price, Brand, Seller, Availability,
  Trade filters**, each folded with counts computed over the current
  category/search scope.
- The merchandising banner's **Filters** CTA now opens the sheet; it used to
  silently apply Best Deals.

### B2B product card
- **One control on every tile.** Previously a cart-plus icon appeared on cards
  whose SKU was not in the quotation cart, while an added SKU turned into a
  stepper — the grid mixed two controls. Every card now shows the same compact
  stepper starting at `0`; the first step up adds the **MOQ / selected tier
  quantity** (with the “Added N pcs” toast), never a single unit below MOQ.

### Shared fix
- `StorefrontControlChip` expanded to the full bound width (its inner `Center`
  only shrink-wraps inside the unbounded control bar). In the sheet's `Wrap`
  that forced one chip per row; it now hugs its label in both layouts.

## 2. Data reality (not a UI bug)

Only **12 of 244** published products carry `metadata.product_type` in staging,
and the values are inconsistent (`Phone`, `Mobile`, `MOBILE PHONES`). The facet
is honest — it lists only real types and does not classify products by
guesswork — but it is thin until Studio types are backfilled. Recorded in the
release register.

## 3. Verification

| Check | Result |
|---|---|
| B2C sheet shows Product type, no Category | PASS |
| B2C type chips wrap (no one-chip-per-row) | PASS — screenshot |
| B2C folded facets expand in place | PASS — Availability opens with `In stock (244)` / `On discount (243)` |
| B2C filter apply / reset / live count | PASS — widget tests; live: `Pipe (3)` → chip `Pipe ×`, 3 results |
| B2B sheet shows Product type / Price / Brand / Seller / Availability / Trade | PASS |
| B2B type chip filters the grid live | PASS — `Cement (1)` → `Show 1 results` |
| B2B banner Filters CTA opens the sheet | PASS |
| B2B tiles: one stepper on every card | PASS — grid shows `− 0 +` on every tile |
| B2B tile + adds the MOQ | PASS — `− 5 +` and “Added 5 pcs …”, cart line present |
| Console / page errors | 0 (B2C and B2B sessions) |
| Tests | **319** app tests + package suite; new coverage for the type facet, folded sections and the MOQ-first step | PASS |

Screenshots: `b2c_filters_product_type.png`, `b2c_filters_expanded.png`, `b2c_filters_applied_pipe.png`,
`b2b_catalogue_steppers.png`, `b2b_filters.png`, `b2b_filters_applied.png`,
`b2b_tile_added.png`.

## 4. Rollback

Redeploy `dcfd729`. No data change.

## 5. APK

`app-release-68f5125.apk` · 63,515,867 bytes · SHA-256
`bd6404bed149feefa56c597b190274bf16a6551635b994f45c47e6cc0b3c4272` · `CN=BuildKart Staging`,
at `D:\C101-control-room\artifacts\U-007-U-009\`. Build id `68f5125` verified inside the package.