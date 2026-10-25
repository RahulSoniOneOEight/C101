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
5. An offer with no B2B snapshot keeps its existing offer price, and the B2B app
   keeps the existing tier ladder as a fallback rather than inventing values.

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

## Verification

- API TypeScript check: pass.
- Experience API TypeScript check: pass.
- `b2b-pricing-read-test`: pass.
  - B2B snapshot drives selling price, list price, MOQ and tiers.
  - B2C stays isolated.
  - Selection compares B2B prices.
  - Unconfigured and out-of-window snapshots fall back.
  - Out-of-stock offers cannot win.
- Flutter analyze on changed files: pass.

## Staging deployment

Pending.

## Live QC

Pending.

## Residual limitations

- The mirror is written when a B2B price is saved. Price lists created before
  this change need one save through Product Studio before the B2B storefront
  sees them.
- Production remains unauthorized.
