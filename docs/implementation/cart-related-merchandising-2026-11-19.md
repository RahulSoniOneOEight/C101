# Cart related-item merchandising — 19 Nov 2026

Status: **shipped to staging web** · Release `release-web-20261119-174302` · Source `3a691ea`
Hosts: `https://gobazarbee.com/cart` (B2C) · `https://gobazarbee.com/trade/quote` (B2B)
Branch: `feat/bazarbee-branding`

Lane: **B** — client UI plus existing catalogue data; no schema or service changes.

## B2C cart: per-line expandable “Related deals”

Each cart line now has a collapsed **Related deals** toggle, matching the Flutter cart:

- Opens a horizontal rail of up to six products.
- Ranks the same aisle first, then the same brand, then the strongest discount.
- Excludes everything already in the cart and the line itself.
- Cards use the normal `ProductCard`, so quick-add, wishlist and product links all work.
- The toggle is `aria-expanded` / `aria-controls`; it opens and closes independently per line.
- The existing bottom **You may also like** rail is retained.

Adding a related item updates the cart count, re-ranks the rail, and keeps the rest of the line
state intact.

## B2B quotation cart: expandable related trade lines

The quotation cart at `/trade/quote` now has an expandable **You may also like** section beneath the
quote lines:

- Up to six B2B products with active trade terms, excluding lines already in the quote.
- Same aisle/brand first, then discount.
- Each card shows seller, MOQ and unit rate, and adds the line at MOQ to the quotation cart.
- The section collapses/expands independently and disappears when every related line is already in
  the quote.
- The quote page fetches the B2B catalogue server-side; if that fetch fails, the quote still works
  and the rail is simply hidden.

The live B2B catalogue currently exposes only three active trade lines, so after adding two the rail
shows one. The cap is six when the catalogue has enough products.

## Layout fix

The horizontal rails are intended to scroll **inside** the cart card. The first pass let their
min-content width expand the card (1342 px at 390 px). The cart/quote grids, line containers and
rails now all use `min-width: 0` / `max-width: 100%`, and the single-column breakpoints use
`minmax(0, 1fr)`. Long SKUs also wrap with `overflow-wrap: anywhere`.

Measured after the fix:

| View | Cart container | Page overflow |
|---|---:|---:|
| B2C 390 px | 358 px | 0 |
| B2C 1440 px | 824 px (left column) | 0 |
| B2B 390 px | 358 px | 0 |

## Files

- `apps/web/app/cart/cart-view.tsx` — per-line `CartLine`, related selection, rail.
- `apps/web/app/trade/quote/trade-quote-view.tsx` — `RelatedTradeRail` and related card.
- `apps/web/app/trade/quote/page.tsx` — server-side B2B catalogue fetch for the rail.
- `apps/web/app/globals.css` — line-group, toggle, rail and B2B card styles; min-width constraints.

## Verification

| Check | Result |
|---|---|
| B2C cart with two lines | Two independent `Related deals` toggles |
| Default state | Collapsed (`aria-expanded=false`) |
| Expand first line | Six related cards, rail scrolls inside the card |
| Add from related rail | Cart lines 2 → 3; the added product leaves the candidate pool |
| Collapse | Rail removed, toggle remains |
| Bottom “You may also like” | Still present |
| B2C mobile | 358 px card, wrapped SKU, no page overflow |
| B2B quote with two lines | Expandable related section; `Show 1` in the current catalogue |
| Add from B2B related card | Quote lines 2 → 3; rail updates |
| B2B mobile | 358 px section, no page overflow |
| `npm run typecheck` / `npm run build` | Pass |

No order or RFQ was submitted during QC. Payment, reservation and RFQ delivery behaviour is
unchanged.

## Rollback

Revert the web commit and redeploy. The previous web release is
`release-web-20261119-172446` (catalogue filters; no cart related rails).
