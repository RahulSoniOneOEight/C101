# Session Note — BuildKart (client101) Design & Flutter Implementation

> Date: 2026-09-28 · Branch: `feat/consolidated-admin` · Direction: A+B hybrid · Palette: indigo

This note records everything done in this working session, including the commit log,
Penpot checkpoints, test results, and key decisions. Companion to
`buildkart-design-journeys-note.md` (the detailed spec).

---

## 1. Session summary

This session completed the end-to-end experience pipeline for BuildKart:

1. **Direction selection** — human chose the **A+B hybrid** (discovery-first + search-first).
2. **Penpot design system** — tokens, components, and 5 screens, rebuilt to match the reference.
3. **Flutter implementation** — semantic tokens, reusable components, and a module-driven home feed.

### Tracks completed

| Track | Output |
|---|---|
| Governance / docs | `AGENTS.md` rules 25–26, flow checklist, A/B/C report, session note |
| Penpot (design) | indigo palette, 24 component families, 5 screens (two-mode login, long-scroll home, PDP, cart cross-sell, checkout) |
| Flutter (code) | `AgencyColors` tokens, `ProductCard` variants, merchandising widgets + module feed |

---

## 2. Penpot design — what was built

**File:** `Client101` (`40e06342-8830-80d6-8008-9a92fdfb6804`) · 2 pages: `Components`, `Screens`.

### Tokens (3 sets)
- `primitives` (43) · `semantic` (26) · `modes/light` (17 color roles)
- Indigo brand: `action.primary #5B6EE1`, `content.primary #1F2A44`
- Merchandising accents: `promotion #FF6B35` (orange) + `promotionInverse`, `trust #0D9488` (teal)
- Typography: Inter (provisional)

### Components (24 families, ~138 cells)
ProductCard (35) · Search (10) · CartLine (12) · CheckoutSummary (8) · OrderCard (16) ·
CategoryNavigation (2) · RFQForm (2) · ReorderAction (2) · CreditLimit (3) ·
ApprovalStatus (3) · WorkflowAction (3) · ShipmentStatus (5) · ReturnStatus (5) ·
Form/Filters/DataTable/Chart/Carousel/ProductGrid/MasonryGrid/Toast/Tabs/Dialog/DateTime

### Screens
- **Login** — two-mode segmented selector (Consumer D2C / B2B Trade), indigo active pill, "Get OTP" CTA, `IN +91` phone field, trust message.
- **Home** — long scroll: header → location → search → trust row → hero carousel (3 banners) → category icons → Flash Deals → Best Sellers → Clearance banner → "Recommended for You" 5+1 (split "Recently viewed" tile) → 5-tab bottom nav.
- **Product Detail** — 5-thumbnail carousel → price + MRP + discount → Add to Cart / Buy Now → benchmark (Flipkart/Amazon/Market Price) → seller + specs → related swimlane.
- **Cart** — per-item "Frequently bought together" horizontal carousel cross-sell.
- **Checkout** — address + payment methods + summary + place order.

### Penpot version checkpoints saved
- Before Client101 governed component replacement
- Client101 design system + Login/Home screens
- Client101 indigo palette/theme applied
- Client101 clean layout — components and screens organized (+ ample gaps)
- Client101 browse-to-buy funnel screens (PDP, Cart, Checkout)
- Client101 ProductCard price hierarchy + home reference
- Client101 hero carousel 3 banners
- Client101 5+1 merchandising layout
- Client101 remove rating + green recently-viewed
- Client101 two-mode login (+ indigo theme)
- Client101 PDP rebuild (+ add to cart / buy now)
- Client101 cart cross-sell (+ expandable carousel)
- Client101 fix 5+1 tile + overlap

---

## 3. Flutter implementation — what was built

### `agency_flutter_ui` package (Flutter UI)
- `AgencyColors` (ThemeExtension) — semantic tokens + `promotion` + `trust`, bound via `context.colors`.
- `AgencyTheme.light()` reworked to the indigo seed.
- `Category` + `CategoryIconItem` + `CategoryIconRail` (icon-led categories).
- `ProductCard` reworked into `compact`/`large` variants (image, brand, price + MRP strikethrough, discount badge, rating, badges, delivery note, add-to-cart).
- `SectionHeader`, `MerchandisingBanner`, `ProductCarousel`, `SplitMerchandisingTile`, `ProductGrid`, `ProductCompositionSection` (5+1), `CompactProductItem`.

### `prototype_app` (Flutter app)
- `Product` model extended: `brand`, `mrp`, `rating`, `reviewCount`, `badges`, `deliveryNote` + `discountPercent` getter; Medusa `original_amount` → MRP mapping.
- `MerchandisingModule` + `MerchandisingModuleType` + `MerchandisingBannerData` + `SplitSlot` (`domain/merchandising.dart`).
- `MerchandisingModuleView` (dispatcher) + `HomeScrollFeed` (`widgets/merchandising_sections.dart`).
- Providers: `categoriesProvider`, `recentlyViewedProvider` (persisted via `SharedPreferences`), `homeModulesProvider`.
- `ProductListScreen` wired to `HomeScrollFeed` (category rail header + Flash Deals → Best Sellers → Clearance banner → 5+1 composition).
- `ProductDetailScreen` records recently-viewed via `ref.listen`.

---

## 4. Test results

| Suite | Result |
|---|---|
| `agency_flutter_ui` — `flutter analyze` | No issues |
| `agency_flutter_ui` — `flutter test` | **10 passed** (product card, merchandising) |
| `prototype_app` — `flutter analyze` | No issues |
| `prototype_app` — `flutter test` | **1 passed** (empty catalog smoke) |
| `tooling` — `tests/test_experience_generator.py` | 4 passed |

---

## 5. Commit log (this session)

```
b7ad1af 2026-09-28 docs: design journeys note, flow checklist, and A/B/C governance rules
1101505 2026-09-28 design(client101): indigo palette, two-mode login, and 5+1 merchandising screens
db9c4cf 2026-09-28 feat(app): merchandising module feed, 5+1 composition, and recently-viewed personalization
50356be 2026-09-28 feat(ui): indigo tokens, ProductCard variants, and merchandising section widgets
d520d13 2026-09-28 chore(client101): regenerate journey-capability-map and implementation-gap
3344af0 2026-09-28 feat(client101): journey surfaces, icons and motions (steps 22-23)
d70e0da 2026-09-28 feat(client101): complete journey graph and data contract (steps 12-13)
529e992 2026-09-28 feat(client101): reference intelligence and journey/component consolidation
1544184 2026-09-28 feat(design): palettes, A/B/C journey comparison, reordered experience flow
03c5a9b 2026-09-28 feat(client101): build Penpot design system + generate runtime plan
d88ae51 2026-09-28 feat(client101): generate journey intelligence and experience directions
b459aa4 2026-09-28 feat(client101): generate experience design intelligence
bca3601 2026-09-28 feat(client101): prepare source-based client inputs and onboarding blueprint
283b7e5 2026-09-28 feat(assets): record Pexels photo source and fix live API integration
5061f00 2026-09-28 chore(client101): empty client workspace
```

---

## 6. Key decisions & limitations

- **Direction:** A+B hybrid (discovery-first + search-first); recorded in `selection.yaml`.
- **Palette:** indigo (`P03` in `design-contract/themes/indigo.yaml`), replacing P01 slate; promo orange + trust teal as merchandising accents.
- **Standalone-cell fallback** for Penpot components (avoids Penpot variant-grouping corruption).
- **Dark mode deferred** (no governed dark values).
- **Icons:** Penpot = Phosphor SVGs; Flutter = Material (Phosphor package not added).
- **Rating/review counts removed** from home product tiles; discount shown once (image badge, not price-row text).
- **Reference images not viewable** — the session model had no vision; design was driven by the written spec + verbal clarifications.
- **Not committed (intentional):** `infrastructure/prototype/docker-compose.dependencies.override.yml` (machine-specific port override) and `.env` (API keys).

---

## 7. Follow-ups

1. Re-derive remaining Penpot ProductCard variants (only the base has the full price hierarchy).
2. Add the `phosphor_flutter` package if Phosphor icons are required in Flutter.
3. Add a real merchandising backend to drive `homeModulesProvider` (currently derived from the catalog).
4. Dark mode once governed dark values are defined.
