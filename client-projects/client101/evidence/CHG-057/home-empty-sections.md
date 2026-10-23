# CHG-057 — empty home sections

## Symptom

The signed-in B2C home opened, with header/banner/navigation, but **Flash Deals
and Best Sellers were blank** under their titles.

## Root cause

The CMS home layout defines three sections:

| Section | Collection |
|---|---|
| Flash Deals | Flash Deals (`pcol_01M535…`) |
| Best Sellers | Seasonal Offers (`pcol_01M53AN…`) |
| Recommended | Trade Best Deals (`pcol_01M53AN…`) |

Those Medusa collections currently have **no product membership**. The app
rendered each layout section regardless of its resolved product list, so it drew
a section header over an empty rail. Archiving the demo catalogue exposed it.

Note: this staging schema has no product-to-collection link table, so membership
cannot be populated directly. Tags used by the tiles are a separate mechanism and
do not fill collections.

## Fix

`homeModulesProvider` now:

- skips a layout section whose product resolution is null **or empty**;
- when every section resolves empty, falls through to the governed catalogue
  default modules (Flash Deals / Best Sellers / Recommended) built from the live
  233-product catalogue.

A non-empty section still renders its configured products unchanged.

## Verification

| Check | Result |
|---|---|
| Signed-in home after deploy | Flash Deals + Best Sellers show product cards |
| Console / failed requests | none |
| Product rails | discounts, tags, prices and add-to-cart visible |
| Build marker | `STAGING · 3fa2c1b` |
| `flutter analyze` | pass |
| `flutter test --exclude-tags golden` | 191 tests pass |

## Remaining note

Opening the bare app link without a session still shows **onboarding** by design;
the home is reached after sign-in. A returning session is restored and routed to
the home/B2B landing automatically.

Staging only; production remains unauthorized.
