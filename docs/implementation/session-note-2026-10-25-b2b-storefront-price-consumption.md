# B2B storefront price consumption

Date: 2026-10-25
Change: CHG-078
Lane: C — cross-service pricing read path and cached product composition
Environment: staging only
Production: not authorized

## Outcome

The B2B storefront now reads the B2B price list saved from Product Studio instead
of composing every B2B product from the B2C price plus a hardcoded 5%/10% ladder.

## Read path

1. Product Studio saves the B2B price list for an offer.
2. The API mirrors the saved snapshot onto the product metadata under
   `buildkart_b2b_pricing`, keyed by offer id.
3. The Experience API composes the product for `channel=b2b` from that snapshot:
   - B2B selling price
   - B2B list price
   - MOQ
   - structured quantity tiers
   - effective start/end dates
4. B2C composition is unchanged and never reads the B2B snapshot.
5. When at least one offer has published B2B terms, B2B selection compares only
   those offers. A cheaper B2C-only offer cannot displace an authorised trade
   offer.
6. An offer with no B2B snapshot keeps its existing offer price, and the B2B app
   keeps the existing tier ladder as a fallback rather than inventing values.
7. The B2B app opens the configured trade SKU by default on a grouped product,
   shows that SKU's MOQ and tiers, and prices RFQ lines from those tiers.

## Effective dates

A snapshot is applied only while its effective window is open. A future or
expired B2B price list does not change the storefront price.

## Files

- `services/backend/packages/api/src/lib/b2b-pricing.ts`
- `services/experience-api/src/commerce/offer-composition.ts`
- `services/experience-api/src/index.ts`
- `services/experience-api/src/scripts/b2b-pricing-read-test.ts`
- `apps/prototype_app/lib/domain/models.dart`
- `apps/prototype_app/lib/providers/b2b_trade_providers.dart`
- `apps/prototype_app/lib/screens/b2b_quote_screens.dart`
- `apps/prototype_app/test/b2b_pricing_read_test.dart`

## Verification

- API TypeScript check: pass.
- Experience API TypeScript check: pass.
- `b2b-pricing-read-test`: pass.
  - B2B snapshot drives selling price, list price, MOQ and tiers.
  - B2C stays isolated.
  - Selection compares B2B prices.
  - A configured B2B offer is preferred over a cheaper B2C-only offer.
  - Unconfigured and out-of-window snapshots fall back.
  - Out-of-stock offers cannot win.
- Flutter tests: 5 B2B read-path tests pass.
  - Composed B2B price, list, MOQ and tiers reach the trade model.
  - A configured trade SKU is preferred over a cheaper B2C-only SKU.
  - RFQ lines reprice from the selected B2B tier.
  - Cached catalogue JSON preserves B2B terms.
- Flutter analyze on changed files: pass.

## Staging deployment

- Medusa API and worker: `8ac070f`.
- Experience API: `1030b72`.
- Web app build: `15c31e4`, `BUILD_ID=15c31e4`.
- Runtime symlink: `/opt/buildkart-releases/release-1030b72`.
- Health endpoints: API `200`, ops `200`, Admin `200`, Seller `200`, web `200`.
- Hosted acceptance: `11/11` checks passed.
- Production untouched.

## Live QC

B2B app (`https://buildkart-staging.web.app`), signed in as
`buyer.b2b01@buildkart.test`:

- Catalogue, product `1/2in Drive 24 Pcs Socket Set`:
  - `MOQ 5` is shown on the trade card.
  - Tier chips show `5` and `10`, not the old `1 / 10 / 25`.
  - Selling price is `₹3890/pc` at the MOQ tier.
- Product detail:
  - Price is `₹3890`, MRP `₹4750`.
  - The `Set - Bi Hex` variant is selected by default and shows `MOQ 5`.
  - Tier pricing shows `5+ pcs ₹3890` and `10+ pcs ₹3790`.
  - The footer shows `GST 18% · MOQ 5`.
- RFQ:
  - The RFQ line is `Set - Bi Hex`.
  - Current dealer price is `₹3890/unit`.
  - Default quantity is `5`.
- B2C product detail remains on the B2C offer (`b2b_configured=false`).
- Console errors: `0`.
- Page errors: `0`.
- Mobile `390x844`: catalogue and product detail render without overflow;
  console errors `0`.

Screenshots:

- `client-projects/client101/evidence/CHG-078/b2b-catalogue.png`
- `client-projects/client101/evidence/CHG-078/b2b-pdp.png`
- `client-projects/client101/evidence/CHG-078/b2b-rfq.png`
- `client-projects/client101/evidence/CHG-078/b2b-mobile-catalogue.png`
- `client-projects/client101/evidence/CHG-078/b2b-mobile-pdp.png`

## Residual limitations

- The mirror is written when a B2B price is saved. Price lists created before
  this change need one save through Product Studio before the B2B storefront
  sees them.
- Production remains unauthorized.
