# CHG-044 Phase 3b — Storefront Renders the Layout

**Commit:** `fc346de`
**Status:** Deployed — console on the VPS, app on Firebase Hosting
**Effect:** Section order, titles, badges, limits and visibility now come from the layout.

## What changed

The app had **no layout consumption at all**: it never called `app-shell`, and `homeModulesProvider`
built Flash Deals, Best Sellers and Recommended locally from a fixed script. That is now inverted.

| File | Change |
|---|---|
| `lib/domain/presentation.dart` | `StorefrontSection` model plus `parseLayoutSections`, which returns empty for an absent or malformed layout rather than throwing |
| `lib/data/experience_api.dart` | `getLayoutSections(locale, channel)` and a `collectionId` filter on the existing composed-product call |
| `lib/providers/catalog_providers.dart` | `layoutSectionsProvider`, `sectionProductsProvider`, and a rewritten `homeModulesProvider` |
| `services/experience-api/src/index.ts` | `GET /v1/products` accepts `collection_id`, so a section's product source resolves through the **same composed path** the catalogue rails already use |
| `test/layout_sections_test.dart` | New: parsing, malformed input, title fallback, and the layout deciding order, titles, badges and visibility |

## How the home now resolves

1. `homeModulesProvider` reads the layout sections for B2C.
2. Sections that are **visible** render, in **stored order**, with the layout's title and badge.
3. Each section's products resolve from its commerce collection through `/v1/products?collection_id=`,
   so a rail renders with the same price and offer composition as a catalogue rail.
4. A section whose products are still resolving is **skipped rather than rendered empty**, so no broken
   rail appears while loading.
5. Placements this surface does not render yet (`buy_again`, `schemes`, the `trade_offers` group) are
   ignored deliberately.
6. With **no configured layout**, the previous local defaults are used unchanged — the home never goes
   blank because merchandising has not been set up.

The campaign strip keeps its own banner source, since a banner is not a section.

## Verification

- `flutter analyze`: **no issues**. `flutter test`: **139 tests pass** (4 new).
- The decisive test authors sections in `recommended, flash_deals` order with `best_sellers` hidden and
  asserts the rendered titles are `['Picked for you', 'Tonight only']` with the layout's badge — a local
  default that ignored the layout would fail it.
- App rebuilt and deployed to Firebase Hosting; the served `main.dart.js` contains
  `/v1/content/app-shell`, `flash_deals`, `collection_id`, `see_all_uri`, `best_sellers`, `recommended`
  and `sections`. Site returns `200`.
- `GET /v1/content/app-shell?channel=b2c` still returns three sections whose products resolve from the
  `flash-deals` collection.

## Honest limitations

1. **No visual confirmation.** Nobody has opened `buildkart-staging.web.app` and looked at the home since
   this change. The evidence is analyzer, tests and bundle contents.
2. **B2B is not wired.** `layoutSectionsProvider` requests the `b2c` channel, and the B2B home still
   builds Buy Again and Trade Offers locally. No B2B sections exist in the CMS either.
3. **Per-section banner association is configured but not rendered.** The editor can attach a banner to
   Flash Deals, Seasonal and Best Deals; the storefront does not draw it yet.
4. **See All destination is carried but not wired** to navigation.
5. **The campaign strip moved to the end** of the home when sections exist, because it is appended after
   the layout-driven modules. Previously it sat between the two rails.
6. **Product resolution is capped by the section limit** and does not paginate; a rail shows at most the
   configured number.
7. Buy Again, Schemes and drag-and-drop ordering remain outstanding, as does validation on the raw JSON
   page.
