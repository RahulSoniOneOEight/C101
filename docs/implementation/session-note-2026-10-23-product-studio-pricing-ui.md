# Product Studio pricing UI — B2C/B2B split layout

Date: 2026-10-23
Lane: A — UI only, plus host-owned navigation config
Release: `950f454`
Environment: staging only

## Outcome

Product Studio now presents each seller offer as one pricing context with two clearly separated
channels:

- **B2C pricing** — offer price ladder
- **B2B pricing** — dedicated per-offer B2B customer-group price list

Both channels remain separate saves with separate validation and audit. No pricing API, scheme,
permission or price-store behaviour changed.

## Delivered

### Pricing section

- A summary strip per offer: B2C selling, B2C list, B2B selling and B2B MOQ.
- B2C and B2B panels side by side on desktop; stacked on mobile.
- Independent **Save B2C price** and **Save B2B price** actions.
- B2C: list price, selling price, GST-inclusive, quantity tiers, discount, reason.
- B2B: selling price, list price, MOQ, effective dates, GST-inclusive, tiers, reason.
- Admin-only link to the underlying B2B price list when it exists; otherwise the panel states that
  the per-offer list is created on first save.
- B2B panel identifies the `B2B Trade Customers` scope.
- Corrected stale copy that still described B2B/MOQ as pending.

### Navigation

- `Products` relabelled to **Catalogue** in Admin and Seller.
- Admin `Price lists` relabelled **Price lists (advanced)** and moved to the bottom of the nav.
- Seller `Price lists` hidden from the sidebar.
- `Product Studio` remains the edit surface.

## Files

- `services/backend/apps/admin/src/routes/product-studio/studio-form.tsx`
- `services/backend/apps/vendor/src/routes/product-studio/studio-form.tsx`
- `services/backend/apps/admin/src/_navigation.ts`
- `services/backend/apps/vendor/src/_navigation.ts`

## Verification

Builds:

- Admin production build: pass.
- Seller production build: pass.
- Targeted ESLint: the modified Product Studio file still reports the pre-existing
  `react-hooks/set-state-in-effect` findings; no new pricing-layout lint error was introduced.
- Navigation ids validate through `extension-targets.d.ts` at build time.

Hosted staging (`950f454`):

- Admin nav shows `Catalogue` and `Price lists (advanced)`.
- Seller nav shows `Catalogue`; `Price lists` is hidden.
- Admin Product Studio shows B2C and B2B panels side by side at 1440.
- Admin mobile at 390 stacks the panels with no horizontal overflow.
- Separate save buttons and summary values are present.
- Admin B2B panel shows either the underlying list link or the first-save notice.
- Seller published product remains read-only, as before.
- Admin console errors: 0.
- Seller console reports the expected `404` for the read-only product-studio request; the page
  renders the read-only state and did not change in this bundle.

Screenshots:

- `client-projects/client101/evidence/CHG-074/product-studio-admin-pricing-b2c-b2b.png`
- `client-projects/client101/evidence/CHG-074/product-studio-admin-pricing-mobile.png`
- `client-projects/client101/evidence/CHG-074/product-studio-seller-nav.png`

## Residual gaps

- The native offer-detail **Seller pricing** B2C editor still exists. The target is a read-only
  summary with a deep link to Product Studio; that consolidation is not in this bundle.
- Seller Product Studio remains read-only for published products, so seller B2B pricing is still an
  Admin task for published listings.
- Hiding `Price lists` from the Seller sidebar is navigation-only; the route remains reachable by
  direct URL unless a route guard/RBAC rule is added.
- Admin can still open the advanced Price Lists page and edit directly. It is demoted, not locked.
- The B2B tier input remains a textarea (`min:max:price` per line), not structured tier rows.
- B2B customer-group/MOQ policy alignment with CHG-074 DEC-074-03 remains a product decision.
- Price history is not shown in the panel yet; existing audit events remain the source of truth.
- Production remains unauthorized.

## Staging

- Release: `/opt/buildkart-releases/release-950f454`
- Admin: `https://ops-staging.pinakaplay.cloud/dashboard/`
- Seller: `https://ops-staging.pinakaplay.cloud/seller/`
