# Session note — 2026-10-04 (k) — B2C product page: multi-seller with best-price default

## Request

On the B2C product detail page, a product can be offered by **multiple sellers**;
the **best-price seller is the default** selection.

## Changes (Flutter)

- `domain/models.dart` — new `ProductSeller` (id, name, price, mrp, rating,
  deliveryNote, verified, isBestPrice, `discountPercent`).
- `providers/catalog_providers.dart` — `productSellersProvider(productId)` returns
  a deterministic set of seller offers, **best-price first**; the best offer equals
  the product's own price. **Development fixture** until the marketplace
  seller/offer contract (Mercur) is wired — the Medusa storefront API used here
  exposes a single default variant price, not seller offers.
- `screens/product_detail_screen.dart` — `_ProductDetail` is now stateful; it shows
  a **“Sold by (N sellers)”** selector with the best-price seller selected by
  default (checked radio + accent border + “Best price” pill). Selecting a seller
  updates the price row (price / MRP / discount) and the Add-to-Cart / Buy-Now
  price; the add-to-cart snackbar names the seller.
- `providers/cart_providers.dart` — `addItem` accepts an optional `unitPrice`, and
  the offline/local cart stores the selected seller's price (the remote Medusa path
  keeps the backend price — noted as a fixture limitation).

## Verification

- `flutter analyze`: clean.
- App tests: **99 passed** — incl. `b2c_product_sellers_test.dart`: the offer list
  has >1 seller with the cheapest first, and the product page renders the seller
  selector with exactly one checked radio (best-price default).
- Android emulator: “Sold by (3 sellers)” — BuildPro (Best price, ₹6499) selected by
  default; selecting BuildMart Supplies updates the page price to ₹6758.96.

## Assumptions / open items

- Seller offers are **development fixtures** derived from the product price; real
  per-seller pricing/availability must come from the marketplace seller/offer
  service (Mercur).
- Cart lines record a single price; which seller actually fulfilled a line is not
  yet modelled end-to-end (needs the seller/offer + allocation contract).
- Penpot left unchanged (Flutter-only request).
