# CHG-079 — staging implementation evidence

- Date: 2026-10-25
- Branch: `feat/staging-updates-02-04`
- Final code commit: `a017e65`
- Staging release: `/opt/buildkart-releases/release-a017e65`
- Current symlink: `/opt/buildkart-releases/current -> /opt/buildkart-releases/release-a017e65`
- Environment: staging only
- Production: unauthorized

## Scope delivered

| ID | Requirement | Status | Evidence |
|---|---|---|---|
| R1 | Direct variant creation in Admin/Seller Product Studio | **PASS** | Product `prod_01M5T3CJBYS738XQ6PXQQQNFFS` created with 6 direct variants and 6 seller offers; submit and approve reached `published`; structural lock returns 409 on add/SKU change; presentation edit returns 200 |
| R2 | Bought Together reciprocal merchandising | **PASS** | Pair `btp_caba4b93855046d1981b88524343095f`; reciprocal B2C and B2B PDP reads; pause hides, resume restores; duplicate create 409; audit 4+ entries; invalid product create 404; candidate search finds products beyond page 1 |
| R3 | Product tile plus → quantity stepper | **PASS-CODE** | Flutter analyze pass; full Flutter tests pass; B2B tier selection now sets initial quantity/price and updates an existing line; B2C single-variant cards bind to canonical cart |
| R4 | Cart-level delivery choice | **PASS** | Cart `cart_01M5T3ATCHQT10GKXR0F7D3A4C`: options expose `tier`; standard returns shipping ₹99 and total ₹4,089; express returns shipping ₹199 and total ₹4,189; checkout test covers one cart-level selection |
| R5 | GPT-5.6 Sol QC | **PASS** | Final closeout QC: **APPROVE** for staging. Residuals registered as non-blocking follow-ups. |

## Verification performed

| Check | Result |
|---|---|
| Experience API typecheck | pass |
| Flutter analyze | pass |
| Flutter full test suite (including refreshed goldens) | 280 pass |
| Flutter web release build | pass |
| Docker image build (Medusa + Experience API) | pass |
| Staging health API/Admin/Seller/Web | 200 |
| Admin proxy pair list/audit with admin session | 200 |
| Direct variant create/reload | 6 variants, 0 options |
| Direct variant offer provisioning | 6 offers |
| Direct variant submit/approve | proposed → published |
| Direct variant structural lock | 409 on add and SKU change |
| Bought Together reciprocal B2C PDP | pass |
| Bought Together B2B PDP with business buyer | pass |
| Bought Together pause/resume | pass |
| Bought Together duplicate create | 409 |
| Bought Together invalid product | 404 |
| Bought Together audit | pass |
| Bought Together metadata redaction | pass (`buildkart_b2b_pricing` not returned) |
| Delivery tier standard | ₹99 shipping, applied=1 |
| Delivery tier express | ₹199 shipping, applied=1 |
| Shipping promise | Options expose `Ship in 2-3 days.` / `Ship in 24 hours.`; checkout renders the selected tier promise |
| Explicit seller provisioning | No reason → 422; with reason → 200, 6 offers |
| Active pair validation | Invalid product → 404; priced-offer readiness enforced through `composeOffers` |

## QC corrections applied

- Split Admin **provisioning seller** from the governed **acting-for-seller** review state.
- Admin update now provisions offers for newly-added/newly-SKU'd variants.
- Blank SKUs can be filled on offered drafts; existing non-empty SKU changes remain locked.
- Imported-product server lock now blocks SKU changes on published/offered products.
- Vendor structural lock now evaluates all offers, not only the seller's offers.
- B2B tier selection drives the initial add quantity and price again.
- Pair activation validates product existence and channel offers.
- Pair endpoint returns only safe product metadata for the paired product.
- Delivery-tier unknown options fall back to Standard instead of producing an un-completable cart.
- Checkout no longer auto-applies Standard on load.
- B2B priority copy softened to a request, not a confirmed service.
- Pair audit actions distinguish activated/paused/archived.
- Feature flag moved from shared compose to the staging env file.
- Admin pair list gained product search; candidate search scans up to 1,000 products.

## Known limitations / residuals

- B2B delivery tier is a device-local RFQ request field, not a priced shipping method.
- Delivery choice is in checkout; the cart screen still shows “Calculated at checkout”.
- Admin Bought Together page is not UI-permission-gated; API enforces `merchandising.read/update`.
- B2C multi-variant tiles keep the plus → variant-sheet path by design.
- B2B related rail hides SKUs already in the cart, so those tiles show no stepper.
- Admin pair health enrichment is still per-product at staging scale; no batch product API.
- No Experience API store-level automated tests yet; runtime and typecheck only.
- No Undo after quantity removal.
- Admin Bought Together page is not UI-permission-gated; API enforces `merchandising.read/update`.
- B2B delivery tier is a device-local RFQ request field, not a priced shipping method.
- Cart screen still shows “Calculated at checkout”.
- No admin visual screenshot; route/API smoke only.
- The delivery promise is a shipping-speed text, not a calculated calendar date.
- Production remains unauthorized.

## Runtime identifiers

- Direct variant product: `prod_01M5T3CJBYS738XQ6PXQQQNFFS`
- Pair: `btp_caba4b93855046d1981b88524343095f`
- Pair product A: `prod_01M59JHKBZ41EJTYW3X6MCXZC6`
- Pair product B: `prod_01M59JHKRP3G009H3P855C0YV3`
- Delivery-tier cart: `cart_01M5T3ATCHQT10GKXR0F7D3A4C`
- Admin candidates search: `ratchet` returned `prod_01M59JT5S57TYZ5K315HK2HQ8X`
