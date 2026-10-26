# Evidence — studio product visibility (Option A)

- **Date:** 2026-10-26
- **Environment:** staging only
- **Product:** `prod_01M5WE3CZVR1975QKR14332R9D` ("x1"), SKU `ccc`
- **Type:** data fix, no code or deployment

## 1. Why it was invisible

The storefront and app request
`/v1/products?channel=b2c&catalogue_import=CHG-049`, so a product must satisfy three conditions to
appear:

1. `metadata.catalogue_import = "CHG-049"` — the governed-catalogue marker;
2. a row in `product_sales_channel` for the B2C channel;
3. a sellable offer with stock (a price alone is not enough).

The product was published, priced (₹150) and categorised, but failed 1, 2 and 3:

| Gate | Before | After |
|---|---|---|
| `metadata.catalogue_import` | missing | `CHG-049` |
| B2C sales-channel link | none | `sc_01M4EC8S2EBB6ZEAMGPGX7MP13` |
| Inventory level for `iitem_01M5WE3D8V7HSKYE1DG4H1BP74` | none (`in_stock: false`) | 1,000,000 at BuildMaster warehouse |

Measured: `?channel=b2c` returned 242 products including it; `?channel=b2c&catalogue_import=CHG-049`
returned 233 without it. Nine published products are hidden by the marker and eleven published
products have no channel link — a systemic gap in the Product Studio create flow.

## 2. Change applied

```sql
update product set metadata = metadata || '{"catalogue_import":"CHG-049"}'
 where id = 'prod_01M5WE3CZVR1975QKR14332R9D';

insert into product_sales_channel (id, product_id, sales_channel_id)
 values ('psc_qc_…', 'prod_01M5WE3CZVR1975QKR14332R9D', 'sc_01M4EC8S2EBB6ZEAMGPGX7MP13');

insert into inventory_level (…) values (…, stocked_quantity = 1000000, …);
```

No code, image or deployment change. Existing metadata keys and timestamps were preserved; the
channel insert is guarded by a `not exists` check.

## 3. Verification

| Check | Result |
|---|---|
| API list with marker | 234 products, `x1` present, `best_price` 15000 minor (₹150), `in_stock: true` |
| Storefront PDP (`/#/product/prod_…`) | renders `x1`, ₹150 |
| Android app (0.4.0) search `x1` | 13 matches, `x1` last with ₹150 |
| Android app search `ccc` (SKU) | 1 match, `x1`, ₹150 |
| Console errors | 0 |

Note: the first app search screenshot appeared to omit the product; it was simply the 13th result,
below the fold. A SKU search confirmed membership immediately.

## 4. Follow-up (not done)

Product Studio still does not attach a sales channel, set the catalogue marker, or provision stock, so
the next admin-created product will be invisible in the same way. Fixing that is a code change in the
studio create path, tracked separately.

Cosmetic: the product has no image URL, so the storefront shows a gradient placeholder.
