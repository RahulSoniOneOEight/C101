# Seller activity — human-readable audit feed

Date: 2026-10-24
Lane: B — Admin UI plus read-model enrichment, no schema change
Release: `52b8aaa`
Environment: staging only

## Outcome

Seller activity is now a human-readable audit feed. Seller names, product titles, SKUs and
actor names are primary; stable IDs remain available as secondary text or hover details.

The read model now also distinguishes **B2C** and **B2B** price changes and renders the correct
summary for each snapshot shape.

## Delivered

### UI

- Seller column: seller name primary, seller ID secondary.
- Product/offer column: product title primary, SKU and offer ID secondary.
- Actor/source column: actor name primary, role and source secondary.
- Price change column: B2C/B2B badge plus before/after summary.
- B2C summary: base price and quantity tiers.
- B2B summary: amount, MOQ and quantity tiers.
- `Not set` replaces the ambiguous `No price`.
- Explicit timezone (`IST`) on timestamps.
- Offer link includes the seller scope:
  `/offers/{product_id}?seller_id={seller_id}`
- Unknown actor fallback: `Unknown admin`, `Unknown seller` or `Unknown actor`; raw ID remains
  available on hover.
- Six-column layout at desktop; explicit table minimum width and horizontal scroll on mobile.

### Read-model enrichment

The Admin API enriches the immutable Experience API events at read time:

- seller name from `seller`
- product title/handle from `product`
- offer SKU/product link from `offer`
- actor name/email from `user` or `member`
- channel and archived-record lookups via `withDeleted: true`

The event payload itself is not mutated.

### Write path

- New price events persist `channel: "b2c" | "b2b"`.
- Admin B2B events now include `product_id`.
- Existing events without a channel are inferred from their before/after snapshot shape.

## Files

- `services/backend/apps/admin/src/routes/seller-activity/page.tsx`
- `services/backend/packages/api/src/api/admin/buildkart/seller-activity/route.ts`
- `services/backend/packages/api/src/lib/seller-activity.ts`
- `services/backend/packages/api/src/api/admin/buildkart/offers/[id]/pricing/route.ts`
- `services/backend/packages/api/src/api/admin/buildkart/offers/[id]/b2b-pricing/route.ts`
- `services/backend/packages/api/src/api/vendor/buildkart/offers/[id]/pricing/route.ts`
- `services/backend/packages/api/src/api/vendor/buildkart/offers/[id]/b2b-pricing/route.ts`
- `services/experience-api/src/index.ts`

## Verification

Builds and checks:

- Admin production build: pass.
- Admin targeted ESLint on the page: pass.
- Medusa API build/typecheck: pass.
- Experience API typecheck: pass.
- No schema, dependency or migration change.

Hosted staging (`52b8aaa`):

- Seller activity returns 16 rows.
- Seller names resolve: BuildMaster Supplies, UrbanBuild Supply, AquaFlow Supplies.
- Product titles and SKUs resolve, including archived offers and products.
- Actor names resolve: admin email and `Arjun Mehta`; one deleted actor falls back to
  `Unknown admin`.
- B2B row renders: `Not configured → ₹900 · MOQ 5 · 2 tiers`.
- B2C rows render: `Not set → ₹1,000`, `₹1,000 → ₹1,300`, etc.
- Admin console errors: 0.
- Mobile document width equals viewport; the table scrolls horizontally inside its container.

Screenshots:

- `client-projects/client101/evidence/CHG-074/seller-activity-human-readable.png`
- `client-projects/client101/evidence/CHG-074/seller-activity-mobile.png`

## Residual limitations

- Filters, search and pagination are not in this bundle. The page shows the latest 100 events.
- Mobile uses horizontal table scroll rather than a card layout.
- Raw IDs are available on hover; they are intentionally secondary, not removed.
- Historical actor records that no longer exist fall back to `Unknown admin/seller`.
- Production remains unauthorized.

## Staging

- Release: `/opt/buildkart-releases/release-52b8aaa`
- Admin: `https://ops-staging.pinakaplay.cloud/dashboard/`
