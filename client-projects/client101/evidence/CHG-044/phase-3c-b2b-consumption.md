# CHG-044 Phase 3c — B2B storefront consumption

**Status:** app consumption wired and deployed; the B2B layout is now authored on staging and delivered.
**Date:** 2026-10-17

## What changed

The B2C storefront became layout-driven in phase 3b, but the B2B surface was left reading local
defaults: `layoutSectionsProvider` hard-coded `channel: 'b2c'`, and B2B Home built its Buy Again and
Trade Offers units itself. The layout therefore owned only half of the storefront.

| File | Change |
|---|---|
| `apps/prototype_app/lib/providers/catalog_providers.dart` | New `b2bLayoutSectionsProvider` requesting `channel: 'b2b'`; empty on failure so the home keeps its defaults. |
| `apps/prototype_app/lib/domain/presentation.dart` | `StorefrontSection.children` parsed from the delivered `children` array (group sections). |
| `apps/prototype_app/lib/providers/trade_offers_providers.dart` | `featuredTradeOffersProvider` takes order, labels and visibility from the published `trade_offers` group; product membership still resolves through the governed offers path. Unmapped placements are skipped rather than rendered as empty tiles. |

The screen needed no change: it already rendered `featuredTradeOffersProvider`, so pointing that
provider at the layout is what makes the configured order and labels reach the UI.

## What was verified

**Delivery (staging, live).** A B2B layout was authored through the operator content route
(`POST /admin/buildkart/content`, the same path the console uses) and published. Delivered payload:

```
GET /v1/content/app-shell?locale=en-IN&channel=b2b
hasLayout: true
  buy_again     "Buy Again"            visible
  trade_offers  "Trade Offers & Deals" visible
    seasonal    "Monsoon Picks"  visible
    best_deals  "Best Deals"     visible
    schemes     "Schemes"        visible
```

Child order is the order the registry declares for the group, not a stored order — the operator
controls title, label and visibility, not the sequence of a group's children yet.

Collections created for the proof: `seasonal-offers` (`pcol_01M53AN7GEGEX35SJRDE20F3BD`) and
`trade-best-deals` (`pcol_01M53AN7M1ZAF0AWVRYM8X7CMB`), each seeded with one product.

**App (offline).** `flutter analyze` clean; **146 tests pass**, including six new ones in
`test/b2b_trade_offers_test.dart`: defaults still drive the rail with no layout, the layout decides
order/labels/visibility, an unrenderable child is skipped, an unrecognised or empty group falls back to
the defaults instead of blanking the home, a hidden group is ignored, and children parse from the
delivered payload.

**Delivery unit.** `normaliseLayoutSections` assertions added to `test:storefront-layout` for the label
defect below; experience-api typecheck clean; `flutter build web --release` rebuilt and deployed to
`https://buildkart-staging.web.app`.

## Defect found and fixed while verifying

The normaliser assigned `label: text(entry.title) ?? type.label`. The **operator's own `label` was
never read**, so a section whose label an operator changed was delivered with the title instead — and a
section with a label but no title fell back to the *registry* label, silently discarding what was
authored. In the staging B2B payload this showed up as the `seasonal` child (authored `label:
"Seasonal"`, `title: "Monsoon Picks"`) arriving with `label: "Monsoon Picks"`.

Fixed to `text(entry.label) ?? text(entry.title) ?? type.label`. Existing B2C content is unaffected: it
stores no `label`, so it still resolves to the title. Two assertions now pin both the authored-label
and the unauthored-fallback cases.

**This fix is in source, not yet released.** It takes effect when the experience-api container is next
released; the staging payload above was produced *before* the fix, which is why it shows the old
behaviour. Redeploying experience-api is a separate reviewed step and was not performed here.

## Limitations — what this does not prove

- **No browser has opened the B2B home.** The evidence is the delivered payload, provider tests and a
  successful build. Whether the tiles render in the configured order on a real screen is unverified.
- **The B2B Buy Again and Trade Offers *screens* still build their own content** beyond the featured
  categories; only the featured trade-offer list is layout-driven.
- **Buy Again itself remains a fixture.** The layout places the section and orders it; the products are
  not real customer history.
- **Group child order is not operator-controlled**, as noted above.
- The `publish` call returns a body without `documentId`/`publishedAt`; the document is nevertheless
  delivered, consistent with the existing B2C layout, which also delivers while `publishedAt` is null.
  The publish response shape is therefore unverified.
