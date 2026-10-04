# BuildKart (client101) — Design, Components & Journeys Note

> Consolidated reference note from the Penpot design + Flutter implementation work.
> Client: BuildKart — D2C / B2C / B2B / multi-seller marketplace for India.
> Direction: A+B hybrid (discovery-first + search-first). Palette: indigo.

---

## 1. Theme / design tokens

### Indigo palette (primary brand)
| Role | Token | Hex |
|---|---|---|
| Page background | `color.surface.page` | `#F7F8FF` |
| Raised surface | `color.surface.raised` | `#FFFFFF` |
| Interactive surface | `color.surface.interactive` | `#E9ECFF` |
| Primary text | `color.content.primary` | `#1F2A44` |
| Secondary text | `color.content.secondary` | `#66708A` |
| Inverse (on indigo) | `color.content.inverse` | `#FFFFFF` |
| Primary action | `color.action.primary` | `#5B6EE1` |
| Secondary action | `color.action.secondary` | `#DCE2FF` |
| Destructive | `color.action.destructive` | `#B54747` |
| Border | `color.border.default` / `strong` | `#DDE2F2` / `#AAB4D6` |
| Feedback | `success/warning/error/info` | `#3D7A57/#B9792D/#B54747/#5570B8` |

### Merchandising accents
| Role | Token | Hex | Use |
|---|---|---|---|
| Promotion | `color.promotion` | `#FF6B35` | discount badges, promo CTA, % off |
| Promotion inverse | `color.promotionInverse` | `#FFFFFF` | text on promotion |
| Trust | `color.trust` | `#0D9488` | trust row, Bestseller tag, Verified Seller |

- Typography: **Inter** (provisional; brief specifies no font).
- Spacing: 4px grid. Radius: control 6 / card 8 / panel 12 / pill.
- Dark mode: deferred (no governed dark values yet).

---

## 2. Component library (Penpot — 24 families, ~138 cells)

### Commerce
| Component | Variants / states | Cells |
|---|---|---|
| `ProductCard` | 5 layouts × 7 states (Default/Discounted/LowStock/OutOfStock/Loading/Empty/Failure) | 35 |
| `Search` | MobileOverlay / DesktopCommand × states | 10 |
| `CartLine` | Mobile / Web / B2BDense × states | 12 |
| `CheckoutSummary` | Mobile / Web × states | 8 |
| `OrderCard` | Customer / B2B / Seller / Admin × states | 16 |
| `CategoryNavigation` | IconGrid / HorizontalScroll | 2 |

### B2B / workflow / status
| Component | Variants | Cells |
|---|---|---|
| `RFQForm` | Buyer / SellerReview | 2 |
| `ReorderAction` | Compact / Detailed | 2 |
| `CreditLimit` | Available / Warning / Blocked | 3 |
| `ApprovalStatus` | Pending / Approved / Rejected | 3 |
| `WorkflowAction` | Primary / Secondary / Destructive | 3 |
| `ShipmentStatus` | Processing / Shipped / OutForDelivery / Delivered / Exception | 5 |
| `ReturnStatus` | Request / Reviewing / Accepted / Refunded / Rejected | 5 |

### Primitives (layout / data / overlay)
`Form` (2), `Filters` (4), `DataTable` (3), `Chart` (4), `Carousel` (3), `ProductGrid` (4), `MasonryGrid` (2), `Toast` (4), `Tabs` (2), `Dialog` (2), `DateTime` (2).

> Note: ProductCard base now includes brand, MRP strikethrough, discount badge, and (removed from home tiles) rating.

---

## 3. Screens (Penpot)

### Login Screen — two-mode
- Segmented selector: **Consumer D2C** (inactive) / **B2B Trade** (active, indigo pill).
- B2B flow: "B2B Trade Portal Sign-In" → "Enter your phone to access wholesale pricing & credit." → phone field `IN +91` → **Get OTP** (indigo CTA) → trust message.
- Consumer flow = phone + password + Google (represented by inactive segment).

### Home Screen — long scroll (11+ sections)
1. Header (BuildKart logo + bell + cart)
2. Location ("Deliver to 560038")
3. Search bar
4. Trust row (GST Invoice · Easy Returns · Verified Sellers)
5. **Hero carousel** — 3 banners (Big Home Sale / Trade & Bulk Deals / New Arrivals) + dots
6. Category icons (6 circular pastel: Bathroom, Tiles, Electrical, Agriculture, Pumps, Construction)
7. **Flash Deals** swimlane ("Up to 60% OFF" badge)
8. **Best Sellers** swimlane ("Most Loved" tag)
9. **Secondary banner** (Clearance Sale)
10. **"Recommended for You" 5+1** — 5 large tiles + 1 split tile
11. Bottom nav (Home / Browse / Orders / Cart / Account)

### Product Detail Screen
1. Big image + **5-thumbnail carousel**
2. Brand + title
3. Price + MRP strikethrough + discount
4. **Add to Cart** (secondary) + **Buy Now** (primary)
5. **Benchmark comparison** — Flipkart ₹7,299 / Amazon ₹7,499 / Market Price ₹7,999 + "You save ₹1,500"
6. Seller information (Sold by BuildPro + Verified Seller)
7. Product specifications
8. Related products swimlane

### Cart Screen
- 3 line items, each with **"Frequently bought together" horizontal carousel** (3 compact cross-sell cards each).
- Summary (subtotal / delivery / total) + Proceed to checkout.

### Checkout Screen
- Deliver to address + payment methods (UPI / Card / COD) + order summary + Place order.

---

## 4. Journeys

### Primary (browse-to-buy)
`Home → Product Detail → Cart → Checkout`

### Full benchmark journey set (13)
`browse-to-buy`, `search-to-buy`, `order-tracking`, `return-refund`, `quote-to-order`, `repeat-order`, `credit-order`, `seller-onboarding`, `seller-catalogue`, `marketplace-order`, `seller-fulfilment`, `seller-return`, `seller-settlement`

### Client-brief journeys (4)
`REQ-cart-merchandising`, `REQ-external-price-comparison`, `REQ-project-site-purchasing`, `REQ-project-site-reorder`

---

## 5. Merchandising architecture

### Module types
`hero_banner`, `secondary_banner`, `category_row`, `product_carousel`, `product_grid`, `large_product_feed`, `split_tile`, `personalized_products`, `brand_spotlight`

### 5+1 product composition
- **5** standard `LargeProductCard`s + **1** `SplitMerchandisingTile` (one grid cell, internally split into **2** `CompactProductItem`s).
- The 6th slot is a **merchandising slot, not a product slot**.
- Result: 5 regular + 2 split = 7 product opportunities.

### SplitMerchandisingTile
- One reusable component with `merchandisingType`: `recentlyViewed`, `frequentlyBought`, `buyAgain`, `becauseYouViewed`, `relatedProducts`, `recommended`.
- Compact item (vs large tile): compact image, short title, price + discount, quick-add; rating/delivery usually omitted.

### Cross-sell (cart)
- Per line item: "Frequently bought together" horizontal carousel (compact cards with quick-add).

---

## 6. Data model (Flutter — planned)

### Product (extend existing)
`id, title, description, thumbnail, variantId, price` + **`brand`, `mrp/compareAtPrice`, `discountPercent`, `rating`, `reviewCount`, `badges`, `deliveryNote`**

### New models
- `Category` (id, name, slug, icon, accent)
- `MerchandisingBanner` (image, title, subtitle, ctaLabel, ctaAction, backgroundStyle)
- `MerchandisingProductFeed` (title, subtitle, products, layoutStyle, seeAll)
- `SplitMerchandisingTile` + `SplitTileItem`
- `HomeMerchandisingModule` (type, title, subtitle, items, layout, action) with `productComposition` special case: `regularProducts[5]` + `specialSlot{type,title,products[2]}`
- Personalization: `recentlyViewed`, `frequentlyBought`, `recommended`

---

## 7. Flutter implementation status

### Done (step 1)
- `AgencyColors` semantic tokens (indigo + promotion + trust) + `AgencyTheme.light()` rework.
- `Category` model + `CategoryIconItem` / `CategoryIconRail` (icon-led categories).
- `categoriesProvider` (6 brief categories, Material icons).

### Planned order
1. ✅ Semantic tokens + category icons.
2. Extend `Product` model + Medusa mapping.
3. Rework `ProductCard` into compact/large variants.
4. `HomeMerchandisingModule` model + dispatcher.
5. `MerchandisingBanner` (secondary banner).
6. `MerchandisingProductFeed` (grid/feed).
7. `SplitMerchandisingTile` + `CompactProductItem` + `ProductCompositionSection` (5+1).
8. `HomeScrollFeed` (module-driven slivers).
9. Personalization providers (recentlyViewed / frequentlyBought / recommended).
10. Wire into `ProductListScreen`; update tests.

### Preserve
- `cartProvider`, `MedusaStoreClient`, `productsProvider`/`productProvider`, go_router routes, `Money` formatting, offline cache, B2B quote flow.

---

## 8. Key decisions / limitations
- **Standalone-cell fallback** for Penpot components (avoids Penpot variant-grouping corruption risk).
- **Dark mode deferred**.
- **Inter** provisional typography.
- **Icons**: Penpot = Phosphor SVGs; Flutter = Material (Phosphor package not yet added).
- **Rating/review counts removed** from home product tiles (and PDP thumbnails kept simple).
- Merchandising accents (promotion orange, trust teal) are tunable — not pixel-verified against a screenshot (model has no vision this session).
