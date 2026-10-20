# CHG-071 — staging regression repair and revalidation

**Date:** 2026-10-20

**Environment:** staging only

**Production:** unauthorized

## Review outcome

The review separated already-fixed items from three live defects:

| Area | Finding |
|---|---|
| Catalogue assets | The catalogue remained exactly 233 products / 500 SKUs, but all 233 thumbnail URLs returned HTTP 404. |
| Trade promotions | `TRADE7` and `TRADEVIP` targeted the correct four-member group, but Experience API carts had no canonical Medusa customer association. |
| B2B delivery region | The countryless B2B pricing region rejected an Indian address, so B2B shipping could not be selected. |
| Cart thumbnails | CHG-061 implementation is present; no second implementation required. |
| B2B quick order / deals | CHG-062 implementation is present; existing tests and staging content require revalidation only. |
| Operator console | CHG-063 source passes lint and build; the documented large entry chunk remains a performance warning. |

Workspace Phase 3, notification projection, operator audited-read access, Cloudflare Access and
production release are outside CHG-071.

## Catalogue image diagnosis and repair

The named volume `buildkart-hosted-pilot_medusa_uploads` still contained 1,065 files. The live
`medusa-api` container had no mounts because its Compose labels pointed at the mutable
`/opt/buildkart/services/hosted/docker-compose.hosted.yml`, whose stale copy omitted
`medusa_uploads`. The governed active release declared the mount correctly.

The `medusa-api` container was recreated from the governed active release with the existing image,
database and named volume. No product, variant, SKU, offer, price, seller or image URL changed. The
proxy was restarted to resolve the recreated container.

Post-repair verification:

| Check | Result |
|---|---|
| Container mount | `medusa_uploads` mounted at `/app/packages/api/static` |
| Public API health | HTTP 200 |
| Grouped products | 233 |
| Source SKUs / variants | 500 |
| Unique governed thumbnails | 233 |
| Thumbnail responses | **233/233 HTTP 200** |

`services/hosted/scripts/verify-catalogue-assets.py` now makes this a release gate. It validates the
mount, product/SKU invariants and every public thumbnail. The hosted runbook now forbids releases
from the mutable `/opt/buildkart` checkout.

## Cart customer association

Medusa's native create-cart workflow resolves an existing customer and their groups when the cart
is created with an email. The Experience API already owns the authenticated pilot identity, so it
now supplies the normalized signed-in email to Medusa when creating the cart. The client request
still cannot supply or override customer identity.

This keeps ownership unchanged:

- Experience authenticates the pilot actor and passes server-owned context.
- Medusa owns and resolves the customer, group membership and canonical cart.
- The Workspace service is not involved.

## B2B delivery-region correction

Medusa stores a country under exactly one operational region (`region_country.iso_2` is the primary
key). India is correctly assigned to the `India` region. The separate `BuildKart B2B` region has no
countries and is therefore valid only as a read-side pricing context; a cart created there cannot
accept an Indian shipping address.

The only price list scoped to the B2B region has 52 prices, all attached to archived draft variants.
It has **zero** prices attached to the governed CHG-049 catalogue. Canonical B2C and B2B carts now
default to the existing operational India region while read-side B2B pricing remains unchanged. No
country assignment, price-list rule, price amount, product or offer was modified.

The hosted promotion acceptance check additionally proves that a governed B2B offer has the same
unit price in the product payload and cart, the Indian address is accepted, and at least one seller
shipping option resolves before `TRADEVIP` is evaluated.

Retained checks:

- `cart-customer-context-test.ts` proves normalization and the exact Medusa create-cart payload.
- `promotion-acceptance.ts` exercises `TRADE7`, `TRADEVIP`, non-trade rejection, `TOOLS200` and
  automatic `PLY5` without completing an order.

## Local verification

| Check | Result |
|---|---|
| Experience API TypeScript typecheck | pass |
| Cart customer-context test | pass |
| Cart totals test | pass |
| Image-quality ordering test | pass |
| Presentation test | pass |
| Collection URL test | pass |
| Flutter analyze | clean |
| Flutter non-golden suite | **241 passed** |
| Admin lint | pass |
| Admin build | pass; existing 6.62 MB entry-chunk warning remains |
| Workspace TypeScript typecheck | pass |

## Staging deployment and live acceptance

Experience API commits `8e88423` and `0101a60` were built and deployed from clean release
worktrees. The active release pointer is `/opt/buildkart-releases/release-0101a60`; the mutable
`/opt/buildkart` checkout was not used. Both Medusa API and worker now run the same existing Medusa
image and mount `buildkart-hosted-pilot_medusa_uploads` at `/app/packages/api/static`.

Live verification completed at `2026-10-20T09:01:44Z`:

| Check | Result |
|---|---|
| Public Experience API health | HTTP 200 |
| Operator dashboard | HTTP 200 |
| Experience API container | healthy |
| Medusa API container | healthy; upload volume mounted |
| Medusa worker | running; same image as API; upload volume mounted |
| Governed catalogue | 233 products / 500 SKUs |
| Governed thumbnails | 233/233 HTTP 200 |
| New B2B cart canonical customer association | pass |
| B2B product-to-cart unit-price parity | pass |
| Indian B2B address and seller shipping option | pass |
| `TRADE7` for trade customer | pass |
| `TRADEVIP` for trade customer | pass |
| `TRADE7` and `TRADEVIP` for non-trade customer | rejected as required |
| `TOOLS200` fixed discount | pass |
| automatic `PLY5` existing behaviour | pass |
| Order completion | **not invoked** |

The deployment changed no commerce entity counts, price lists, price amounts, promotions, sellers,
orders or region-country assignments.

## Remaining governed gaps

- Phase 3 commerce revalidation, difference acknowledgement and cart handoff remain unauthorized.
- Workspace notification projection and audited operator reads remain unimplemented.
- Cloudflare Access/MFA and baseline edge security headers remain open pre-production requirements.
- Human visual acceptance remains pending.
- Production release remains unauthorized.
