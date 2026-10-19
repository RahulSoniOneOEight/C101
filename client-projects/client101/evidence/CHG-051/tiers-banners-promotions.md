# CHG-051 — trade tiers, 5s banners and promotion P0

## Outcome

| Ask | Result |
|---|---|
| 5% trade tiers | Live B2B products carry 1+ list, 10+ 5% off, 25+ 10% off |
| 5-second banners | Both channels resolve `hero_rotation_ms = 5000` |
| Promotions | P0 customer path is live: code entry, engine discount, rejection reason |

Staging only. Production release remains unauthorized.

## Important finding: the engine had no promotions

The note states that ten promotions are configured and verified. The staging
database had **zero** rows in `promotion`, so no code could succeed. The governed,
idempotent preset script (`configure:staging-merchandising`, CHG-029/030) was run
inside `medusa-api`. It created:

- 2 campaigns + the offer-lab campaign;
- `BK-STG-PROMO-TOOLS10`, `BK-STG-PROMO-PLY-BULK`, `BK-STG-PROMO-FREESHIP`,
  `BK-STG-PROMO-SAFETY-B2B`;
- `BK-STG-OFFER-ORDER10`, `-CART8`, `-TOOLS-FIXED`, `-QTY3`, `-BOGO`, `-VIPSHIP`.

All are `status=active`, marketplace-funded, with no seller link.

## What changed

### Trade tiers

`tradeProductFromCatalogue` now applies a three-level ladder to the selected
SKU price:

| Quantity | Discount | Socket set (₹4750) |
|---:|---:|---:|
| 1+ | 0% | ₹4750 |
| 10+ | 5% | ₹4512.50 |
| 25+ | 10% | ₹4275 |

Each step adds five points and the deepest step stops at the governed 10%
promotion ceiling. These are quotation/trade terms, not a Medusa promotion:
quantity slabs cannot be expressed as a standard promotion.

### Banner rotation

- `b2c-home` seed: `hero_rotation_ms: 5000`.
- Added a `b2b-home` seed layout with `hero_rotation_ms: 5000` and no sections.
  The trade home previously had **no layout at all**, so its hero could never
  rotate and its layout sections were always empty.

Both channels now return 5000 from `/v1/content/app-shell`.

#### Follow-up check: CMS, console and the 250 ms discrepancy

The published CMS layouts carried `hero_rotation_ms = 250`, while the API was
returning the seed's 5000. Root cause: after an earlier container recreation the
API was started from the older server compose file, which does **not** pass
`CMS_BASE_URL`. The CMS adapter therefore reported `governed-seed-fallback` and
ignored every layout.

Corrected:

- Recreated the API from the release compose that carries
  `CMS_BASE_URL: http://cms:1337`; `/health` now reports `cms_adapter: configured`.
- Set both CMS layout documents (draft + published) to `hero_rotation_ms = 5000`,
  so the console value and the live intent agree.
- B2C now resolves its 5 modules and 5000 ms from CMS.
- B2B still resolves the seed layout because its CMS layout has **no modules or
  sections**; `mapLayout` correctly refuses an empty layout. The console can edit
  its rotation, but the value only takes effect once at least one section/module
  is added and published.

Admin console: the layout editor has a per-channel **Rotation (ms)** number
field (`min 0`, `step 100`), saved to the draft and published with the layout.
Copy states that `0` keeps the carousel still and that the interval applies to
that layout's channel only.

### Promotion P0

Experience API:

- `POST /v1/carts/:id/promotions` applies a code through the real engine.
- `DELETE /v1/carts/:id/promotions` removes it (Medusa expects codes in the body).
- `GET /v1/carts/:id` returns the canonical cart with the discount breakdown.
- Cart responses expose `discount_total`, `shipping_discount_total`,
  `promotions[]` and a flat `adjustments[]`.
- A code Medusa accepts but does not attach is now reported as
  `not_eligible`, not as applied. This was a real defect found in verification.
- `GET`/`POST`/`DELETE` are owner-authorized through the existing correlation
  record; a cart cannot be read or modified by another pilot user.

Flutter B2C:

- Cart shows an "Offers & promo codes" panel, applied code chips, a discount
  row, a shipping-offer row and the discounted total.
- Rejections render the reason: not found, expired, usage limit, not eligible,
  unavailable.
- Checkout shows the offer discount line.
- Removing a chip restores the total.

## Verification

### API (live, 2026-10-19)

| Check | Result |
|---|---|
| `app-shell` b2c / b2b rotation | 5000 / 5000 |
| `app-shell` b2c layout source | `cms-strapi`, 5 modules |
| `/health` CMS adapter | `configured` |
| Hero frames sampled every 1 s for 14 s (b2c) | 4 changes, ~5 s cadence |
| Hero frames sampled every 1 s for 14 s (b2b) | 3 changes, ~5 s cadence |
| Cart: 1 × socket set (₹4750) + `BK-STG-OFFER-ORDER10` | 200; discount ₹237.50; total ₹4512.50; code attached |
| `GET /v1/carts/:id` | subtotal ₹4750, discount ₹237.50, total ₹4512.50, 1 adjustment |
| Unknown code | 422, reason `not_found` |
| `BK-STG-PROMO-TOOLS10` on an ineligible cart | 422, reason `not_eligible` (previously a silent 200) |
| Remove `BK-STG-OFFER-ORDER10` | 200; discount back to 0; total ₹4750; promotions empty |
| Promotions seeded | 10 active, 0 seller links |

### Browser (headless Chrome, live)

| Check | Result |
|---|---|
| Login (pilot OTP) → add imported SKU → cart | works |
| Apply `BK-STG-OFFER-ORDER10` | code chip shown, discount `-₹237.50`, total `₹4512.50` |
| Invalid code (first attempt) | "That code does not apply to the items in your cart." |
| B2B PDP tier section | 1+ / 10+ / 25+ with ₹4750 / ₹4512.50 / ₹4275 |
| Cart panel semantics | 398 px rows inside a 430 px viewport, no overflow |

### Local

| Check | Result |
|---|---|
| `bun run typecheck` | pass |
| `flutter analyze` | pass |
| `flutter test --exclude-tags golden` | 187 tests pass |
| `flutter build web --release` | pass |

New tests cover cart discount parsing, apply/remove through a fake engine,
rejection reasons, and the tier ladder. The existing grouped-catalogue tests were
updated for the ladder.

## Deployment performed

- Experience API image built from `e9de1d9`, recreated with the server's compose
  + FCM override; proxy restarted.
- Governed promotion presets applied in `medusa-api`.
- Firebase Hosting released to `buildkart-staging`.

## Scope not included (note P1–P3)

The note is a proposal spanning four phases. This increment implements **P0
only**, plus the two concrete UI asks. Still open:

- **P1 discovery:** home offer strip, PLP badges, PDP offer block, B2B offers
  from real promotions, `GET /v1/me/promotions`.
- **P2 admin:** guarded create/edit, approval queue, redemption reporting,
  kill switch, audit trail.
- **P3 trade pricing:** price lists per customer group, trade price vs MRP on
  PLP/PDP/cart, quantity-slab pricing through Medusa.
- **Plywood quantity gate:** `BK-STG-PROMO-PLY-BULK` still records
  `min_quantity: 10` as a deferred condition. No UI advertises the 10+ claim
  today; fix it before the offer is surfaced.
- **Dummy-price guard:** 25 of the 500 imported variants carry
  `price_source = dummy (999)` or `dummy (brand median)`. An order-wide code can
  currently discount a cart containing them. The cart line does not expose
  variant metadata, so the guard needs a line-metadata field before offers are
  advertised broadly.
- **B2B RFQ cart:** it is a quotation, not a Medusa cart, so promo codes are not
  applied there.

## Release status

- Staging implementation: deployed.
- Human staging review: pending.
- Production authorization: **false**.
