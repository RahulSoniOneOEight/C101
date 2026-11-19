# Product tiles and drag-scroll — 19 Nov 2026

## Why

The category lanes exposed a visible scrollbar, and catalogue tiles had no quick add action. Both
were benchmarked against HomeRun's collection tiles and the high-level L&T-SuFin pattern.

HomeRun's listing tiles use: image, discount/offer badges, title, seller/assortment metadata,
price + MRP, bulk/tier price hints, delivery/stock proof, and a compact **Add** action. L&T-SuFin
follows the same hierarchy with bulk/trade actions. The web store now matches that hierarchy.

## Drag-scroll

`apps/web/app/components/drag-scroll.tsx`:

- Hides the scrollbar (`scrollbar-width: none`, no WebKit scrollbar).
- Mouse drag starts after a 5px horizontal threshold and captures the pointer.
- The click that follows a drag is suppressed, so dragging a category card never opens it.
- A normal click still navigates/filters.
- Touch remains native momentum scrolling.
- Applied to the B2C/B2B category lanes, the category rail, search/trade/quick-order filter bars and
  the recently viewed rail.

Live evidence:

```text
category lane: scrollbarWidth=none, cursor=grab, 2502/1232
drag: scrollLeft 2 -> 316, URL stayed /
click after drag: /search?cat=paints-&-finishes
filter bar drag: 0 -> 220, scrollbarWidth=none
mobile: 390 = 390, scrollbarWidth=none
```

## B2C product tile

`ProductCard` now has:

- Image + discount/low-stock flags and wishlist overlay.
- Category, title, seller/offer count/options, delivery or stock note.
- Price + MRP in a compact footer.
- **Add to cart** for the default offer; it updates the header count without navigating.
- Image/title still open the product detail page.

Live evidence: Tools & Hardware has 4 `Add to cart` buttons; clicking the first changed the cart
count `0 → 1` and kept the URL on `/search?cat=tools-&-hardware`.

## B2B product tile

`AddToQuote` now ships both trade actions:

- **Add to cart** at the selected quantity (default MOQ), using the tier unit price.
- **Add to quote** with the same quantity.

The tile keeps seller, SKU, price/MRP, MOQ badge, quantity-tier table, selected unit price and line
total. The redundant full-width “Buy at trade rate” button was removed; checkout is reached through
the cart, which is the standard tile pattern.

Live evidence:

```text
trade tile: Add to cart | Add to quote
cart count: 0 -> 5 (MOQ)
cart line: ₹3,890 each × 5 = ₹19,450
checkout quote: subtotal ₹19,450, offer −₹972.50, delivery ₹99, total ₹18,576.50
trade home/buy-again tiles: 5 Add to cart buttons
```

The B2B order channel remains server-decided (`channel=b2b`); the previous completed order
`BK-261119-PTPF1G` remains the latest B2B order evidence until a new order is placed.
