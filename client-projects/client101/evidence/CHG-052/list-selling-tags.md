# CHG-052 — list/selling price and merchandising tags

## Outcome

Every imported SKU now has a **list price** and a distinct **selling price**,
and the tiles show the saving. 20% of imported products carry a merchandising
tag that renders on the tile.

This is a staging fixture. The source master carries one price; the selling
price is derived, not offered by a supplier.

## Price fixture

- List price = the imported source amount (unchanged).
- Selling price = list minus a deterministic **5–18%** per SKU:
  `5 + abs(hashtext(sku)) % 14`, rounded to the nearest rupee.
- Deterministic by SKU, so refreshes and re-runs never change a price the
  shopper already saw.
- The offer price is updated to the selling price, so the **cart charges the
  selling price**.
- The offer stores `list_price_minor`, `selling_price_minor`,
  `discount_percent` and `staging_price_fixture: true`.
- The Experience API uses `list_price_minor` as the compare-at amount and
  derives the discount from the same pair.

Example: `BAUM-237S1-SET-HEX` — list ₹4750, 16% off, selling ₹3990.

## Merchandising tags

The staging schema has **no product-to-collection link table**, so collection
membership cannot be written safely. Product tags are the supported mechanism
and are rendered by the storefront as tile badges.

- Tags created: **Best Deal**, **Seasonal**, **Flash Deal**.
- 46 of 233 products are tagged (≈ 20%), split 15 / 15 / 16.
- Selection and tag are deterministic (`row_number % 5 = 0`, then `% 3`).
- The Experience API returns `badges` from the product tags.
- B2C cards already render the first badge; the B2B compact tile now has an
  optional `badgeLabel` pill beside the discount pill.

## Verification

DB (staging):

| Check | Result |
|---|---|
| Imported offers carrying the fixture | 500 / 500 |
| Discount range | 5% – 18% |
| Example SKU | ₹475000 list → ₹399000 selling, 16% |
| Tagged products | 46 (Best Deal 15, Seasonal 15, Flash Deal 16) |

Live API (staging):

| Check | Result |
|---|---|
| Socket set list / selling / discount | ₹4750 / ₹3990 / 16% |
| Variant `best_price` | same pair, `price_source: price_list` |
| Tagged products in the composed list | 46 |
| B2C tile (`RANGER A/T`) | "Flash Deal" + 12% off, ₹879.12 vs ₹999 |
| B2B tile (`RANGER A/T`) | "Flash Deal" + 12% off, ₹879.12 vs ₹999 (after reload) |
| B2B tier chips | 1 / 10 / 25 present |
| Cart add socket offer | subtotal and total ₹3990, unit ₹3990 |

The first B2B screenshot showed 6% because the tile was using the first
sellable SKU rather than the cheapest, and the headless browser was still on a
cached build. The mapper now selects the lowest sellable variant and a hard
reload confirms the B2B card matches the B2C best price. `RANGER A/T` has three
SKUs at 6% / 6% / 12%; both channels now show the 12% SKU.

Browser evidence: B2C `#/browse` and B2B `#/b2b/catalogue` screenshots show
the discount pill, struck-through list price, selling price and the tag.

## Deployment

- Fixture applied directly to the staging Mercur database with
  `price-fixture.sql` (retained in this folder, idempotent).
- API and web images rebuilt from the commit that reads
  `offer.metadata.list_price_minor` and product tags.
- Medusa API/worker restarted to clear pricing caches.

## Risks and constraints

- The selling price is **not** supplier-funded. It must not be described as a
  seller discount or carried to production.
- The nominal 5–18% range is a fixture, not a pricing policy.
- Collection rails remain empty where their configured collection has no
  products; tags do not populate collections.
- Production authorization remains **false**.
