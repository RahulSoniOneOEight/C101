# CHG-049 — 500-SKU staging catalogue import

## Outcome

The approved staging import completed on 2026-10-19. Exactly **500 unique source SKUs** were
created as **233 master products** with **500 Medusa variants** and **500 Mercur seller offers**.
All product groups are complete by `brand + name`; no group was split to hit the SKU target.

This is staging evidence only. The stock quantity is fixture data, and production release remains
unauthorized.

## Variant resolution

The initial five-product request using native `options` failed before creating any product. The
installed Mercur 2.3.4 `mercur-create-products` workflow replaces native create-time product options
with its internal `__default__` option. It then appended the supplied variant option, causing the
Medusa validation error `Product has 1 option values but there were 2 provided option values`.

The supported Mercur model was applied instead:

- each product has one product-scoped inline `multi_select` attribute named `Variant`;
- `is_variant_axis: true` makes that attribute a real Medusa product option;
- every variant maps `{"Variant": "<sanitised source label>"}`;
- blank source labels become `Default`;
- duplicate labels within one product receive deterministic suffixes such as ` (2)`;
- the unmodified source label remains in `variant.metadata.source_variant`.

The second pilot then passed for one multi-variant product per seller: 5 products, 11 variants, 11
offers, five seller allowlists, persistent images, and both sales channels. See
`pilot-verification.json` and the first 21 lines of `run-500.log`.

## Imported distribution

| L1 category | Products | SKUs / variants |
|---|---:|---:|
| Agriculture & Seeds | 13 | 13 |
| Automotive & Tyres | 1 | 3 |
| Bathroom & Plumbing | 23 | 56 |
| Lighting & Electrical | 71 | 155 |
| Miscellaneous | 6 | 6 |
| Paints & Finishes | 11 | 30 |
| Tiles & Building Materials | 37 | 37 |
| Tools & Hardware | 71 | 200 |
| **Total** | **233** | **500** |

The manifest contains 169 products with more than one variant. All 233 products use a real variant
axis, including single-SKU products whose option has one value.

## Seller allocation

| Seller | L1 allocation | Products | Offers / SKUs |
|---|---|---:|---:|
| BuildMaster Supplies | Tools & Hardware | 71 | 200 |
| PowerMax Depot | Lighting & Electrical | 71 | 155 |
| AquaFlow Supplies | Bathroom & Plumbing | 23 | 56 |
| UrbanBuild Supply | Tiles & Building Materials; Paints & Finishes | 48 | 67 |
| BuildKart Direct | Agriculture & Seeds; Automotive & Tyres; Miscellaneous | 20 | 22 |

Every product is allowlisted to exactly its assigned seller. Every offer uses Marketplace Shipping
(`sp_01M4EC9C0C9KNZ5RM7RPYY6H4H`).

## Verification

`verification-500.json` is a complete admin-side reconciliation against the manifest, not a sample.
It verifies:

- 233 published products and exactly 500 unique variant SKUs;
- expected L2 category on every product;
- exact variant SKU and option-value sets;
- 500/500 variant traceability records (`sku_source`, `price_source`, `source_file`, `source_url`);
- exact source INR amount on all 500 offers;
- one offer inventory link per SKU and the expected shipping profile;
- exactly one seller allowlist per product;
- B2C Storefront and B2B Trade Portal links on every product;
- 233/233 persistent image URLs returning HTTP 200.

`import-ledger-500.json` retains the handle-to-product-ID mapping and the successful B2C/B2B link
ledger needed for staging audit or targeted rollback. It contains no credentials or customer data.

`storefront-verification-500.json` verifies the customer-facing Medusa/Mercur Store API independently
for each sales channel:

- B2C: 233 products, 500 variants, 500 calculated prices, 500 in-stock offers;
- B2B: 233 products, 500 variants, 500 calculated prices, 500 in-stock offers;
- every offer resolves the explicit staging quantity of 50 in both channels.

The first storefront check identified that the newly created BuildKart Direct Warehouse had no sales
channel links. Its 20 products therefore had offers but no eligible buy-box price. The location was
linked to both channel IDs, after which all 500 offers passed in both channels.

`experience-verification-500.json` verifies the public Experience API after its offer cache expired:
all 233 imported products have an offer and a composed best price, with `environment=staging` and
`test_data=true`.

## Source and artifact integrity

| Artifact | SHA-256 |
|---|---|
| `D:\catalogue\import_selection_500.csv` | `F95AF630646F8098DA72293DA9FD9D9A0849D2CC6C2FEA6216176B52F7F3A6DC` |
| final `products500.json` | `93200C26ED7A3AEEFA739099B56491D4DB14369DE80C7308A732C78E1ED37F36` |
| `images500.zip` | `A33D7504C5635212EE4C6B2D076151D722141F396D3911E344E31E24CD9848AF` |
| `run-500.log` | `E1DD6B3DDE5A2435E511908F22FF4316F96542A24FA19C060D19BB63587231EC` |
| `verification-500.json` | `E469A82A00F320B873E0B68726A6BF47A365AE556EC0554AE7AED5687CF9DC87` |
| `storefront-verification-500.json` | `A051909ABEC94163ED8768F9AB71A6FF238F4B3042EE1CFE8DD23ECCE1BD8271` |
| `import-ledger-500.json` | `AB86C5347FDFC34275ACCA9B55D2B8DF58F5CEE73A0B1E2F6E5C7EEE464BC1BC` |

The final selection has 500 unique SKUs, no missing prices, no duplicate option labels after
sanitisation, and an image for every selected product.

The exact manifest builder, resumable importer, full reconciler and two-channel Store API verifier
are retained under `tools/`; they contain no credentials and are explicitly staging-only.

## Explicit staging assumption

The source master has no inventory quantity. Each offer therefore has `stocked_quantity: 50` with
`metadata.staging_inventory_fixture: true`. This must not be treated as supplier stock or carried to
production without a governed inventory source and human approval.

## Cleanup

- Removed the transient `/opt/buildkart-import` payload and extraction directories from the VPS.
- Removed the local `D:\catalogue\_import_payload` working directory; retained the governed
  `D:\catalogue\import_selection_500.csv` selection.
- Deleted the temporary decrypted SSH key.
- Rechecked an imported product, composed offer/best price, and its persistent image after cleanup;
  the image still returned HTTP 200.

## Release status

- Staging implementation: complete.
- Human staging review: pending.
- Production authorization: **false**.
