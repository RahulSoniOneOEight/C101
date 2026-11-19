# Web catalogue filters — 19 Nov 2026

Status: **shipped to staging web** · Release `release-web-20261119-172446` · Source `79b23fe`
Host: `https://gobazarbee.com/search` · Branch `feat/bazarbee-branding`

Lane: **B** — UI plus query-string API, no schema or service changes.

## What shipped

The web catalogue now has a filter drawer modelled on the Flutter Browse tab:

- **Brand** — multi-select, counts per brand in the current search/category scope.
- **Price** — Under ₹500, ₹500–₹5,000, ₹5,000–₹25,000, ₹25,000+.
- **Discount** — 10% or more, 15% or more, 20% or more.
- **Availability** — In stock and Flash Deal.

Filters compose with the existing category chips and search query. Active filters appear as removable
chips with a **Clear all** action. The toolbar also gains a **Discount** sort option.

## Deliberate omissions

The Flutter Browse tab also exposes Rating, Clearance, Bestseller, New, Premium, Highly rated and
Free delivery. The web product projection does **not** carry rating or those merchandising badges, so
they are not shown rather than rendered as filters that cannot discriminate. The only deal badge
present in the live catalogue is `Flash Deal` (2 products); Clearance and Bestseller currently match
zero. `In stock` matches all 30 products today but is kept because stock is a real field and will
matter as the catalogue changes.

## URL model

Filters are ordinary query parameters, so a filtered view is shareable and server-rendered:

```
/search?brand=jaquar
/search?price=25000-plus
/search?discount=20-plus
/search?flag=flash-deal
/search?cat=tools-%26-hardware&brand=baum&sort=discount
```

Arrays are repeated keys (`brand=jaquar&brand=baum`). Category chips, sort links and the search form
preserve active filters. Removing one chip preserves the rest.

## Files

- `apps/web/lib/catalogue-filters.ts` — filter model, price/discount bands, brand labels, matching,
  URL builder.
- `apps/web/app/components/catalogue-filters.tsx` — filter trigger, active chips, portaled desktop
  drawer / mobile bottom sheet.
- `apps/web/app/search/page.tsx` — parses query params, computes option counts, filters, and preserves
  state across category/sort links.
- `apps/web/app/globals.css` — filter toolbar, chips and drawer styles.

## Verification

Live catalogue at the time of QC: 30 products.

| Filter | Result |
|---|---:|
| No filters | 30 |
| `brand=jaquar` | 8 |
| `price=25000-plus` | 2 |
| `discount=20-plus` | 1 |
| `flag=flash-deal` | 2 |
| `flag=in-stock` | 30 |
| `brand=jaquar&price=under-500` | 0 (empty state) |
| `sort=discount` first card | 28% off (highest) |
| `sort=price-asc` first price | ₹153 (lowest) |

UI checks:

- Filter drawer opens from `/search`, is portaled to `body`, and shows Brand, Price, Discount and
  Availability groups with counts.
- Applying Jaquar closes the drawer, updates the URL, shows the `Jaquar ×` chip and 8 products.
- Removing the chip returns to 30 products.
- Category links preserve `brand` and `sort`; the search form preserves active filters.
- Mobile drawer is a bottom sheet (`390×760` within the viewport), no horizontal overflow, Flash Deal
  applies and returns 2 products.
- Desktop (1440), tablet (1024/820) and mobile (390) have zero horizontal overflow.
- `npm run typecheck` and `npm run build` pass.

## Rollback

Revert the web commit and redeploy. The previous web release is
`release-web-20261119-170224` (header selector + static app preview, no catalogue filters).

No backend, CMS or database changes are involved.
