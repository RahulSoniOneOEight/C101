# Session note — app feedback fixes and Admin/Seller brief assessment (2026-10-22)

## Customer app fixes

Release: `4af8832`  
Staging web: `https://buildkart-staging.web.app`  
Surface: customer app only; no backend deploy.

### Cart feedback

- Replaced Material snackbars with a short-lived overlay toast above the bottom navigation.
- Success: check icon + “Added to cart”, removed after **900 ms**.
- Failure: error icon + retry copy, removed after **2.2 s**.
- No action button and no snackbar queue, so the black strip cannot persist over the shell.
- Applied to product detail, product list, cart recommendations, D2C quick add and B2C cards.

Verified in a real browser by waiting for the `POST /v1/carts/<id>/lines` response:

- toast visible immediately after success;
- toast gone after 1.2 s;
- no console errors.

### Order navigation

- Added a **Home** action to the My Orders app bar and the order detail app bar.
- This is a direct `context.go('/')` navigation, so it works even though `/orders` is a top-level route without the shell bottom navigation.
- Verified: clicking Home from `/#/orders` lands on `/`.

### Automatic promotion and coupon behaviour

Current staging engine behaviour:

- `PLY5` is automatic and is returned in the cart with `is_automatic: true`.
- Removing `PLY5` through `DELETE /v1/carts/:id/promotions` returns 200 but the automatic promotion remains applied.
- Applying `TOOLS10` while `PLY5` is present works; both appear and the engine calculates the combined discount.
- Therefore the app cannot truthfully “remove” an automatic promotion through the current promotion API.

UI change made:

- Automatic promotions are shown as non-deletable `PLY5 · Auto` chips.
- The panel now explains: “Store-applied offers stay active. You can still add a code and the engine will decide the final discount.”
- Manual codes remain removable.

This avoids a fake removal. A true “opt out of automatic promotions” capability would require a governed promotion-engine/cart change and is **not** implemented.

## Admin/Seller Console brief assessment

Read-only assessment completed against
`BuildKart_Admin_Seller_Backend_UX_Implementation_Brief.txt`.

No Admin/Seller Console code was changed in this increment because the brief spans several
governed areas and the first slice needs a product decision.

### Current state summary

Already present:

- Native Mercur Admin and Seller panels with products, offers, orders, inventory, price lists,
  payouts, returns and shipments.
- Admin/seller shipment and return workbenches from CHG-035.
- Admin order delivery/return widget and B2B/B2C order-channel view.
- Seller offer create/edit, product create request, native order fulfillment and vendor returns.
- Seller-scoped Experience API shipment/return endpoints.

Major gaps:

- No granular action permissions; Mercur RBAC is disabled.
- No admin seller-scope switcher, acting-for audit context or seller activity centre.
- Admin cannot update a seller offer/price at all; only the seller has an offer edit path.
- No B2C/B2B list-vs-selling-price model, MOQ, effective dates, price history or tier UI/validation.
- Seller inventory writes Medusa stock directly; Tryton is not the seller-adjustment boundary.
- Seller allocation accept/reject, prepare/pack and ready-for-pickup are missing.
- Seller return operations are read-only; pickup/receipt/inspection are missing.
- Manual payment/reconciliation and unified order timeline are missing.
- Native returns and pilot return cases remain separate systems.

### Conflicts / decisions required

1. The brief excludes promotion, coupon, campaign, merchandising and Offer Validation changes,
   while the app request includes promotion behaviour. The auto-promotion removal therefore
   cannot be solved through the brief’s Admin/Seller increment.
2. “Seller listings/pricing/inventory/orders” can be added to the main pages with seller scope,
   or duplicated under a Marketplace menu. The brief allows either but prefers one reusable page.
   This needs a navigation decision.
3. Three permission vocabularies exist: brief dot-actions, Medusa `resource:operation`, and
   CHG-019 capability phrases. RBAC is currently off.
4. Return ownership must be decided before seller return actions: native Medusa return vs pilot
   `pilot_return_case`.
5. An admin price update needs a new facade because Mercur has no admin offer update endpoint.
6. Tryton stock adjustment needs a governed boundary; direct `stocked_quantity` writes are not
   acceptable under the brief.

### Recommended first slice

**Seller selling price + quantity tiers, with admin acting-for-seller parity and price-change audit.**

Why:

- Scope item 3.
- No canonical schema change.
- No money, stock or order side effects.
- Closes a concrete admin-superset gap.
- Creates the audit substrate needed by the Seller Activity Centre.

Proposed boundary:

- Seller and admin can edit the B2C/INR selling price and quantity tiers for an existing offer.
- Validate positive INR amounts, monotonic tiers, tier price ≤ base, no overlap and an upper tier
  count.
- Record actor, acting-for seller, before/after, reason, source and correlation ID.
- Defer list-vs-selling price, B2B pricing, MOQ, effective dates, policy floors and GST until the
  pricing model is approved.

Likely surfaces:

- `services/backend/packages/api/src/api/vendor/buildkart/offers/[id]/pricing/route.ts`
- `services/backend/packages/api/src/api/admin/buildkart/offers/[id]/pricing/route.ts`
- shared validator + seller-activity facade
- seller/admin offer detail widgets
- HTTP authorization/isolation tests, tier validation tests, admin acting-for audit tests

### Other slices after that

1. Seller listing lifecycle and product-request review/saved views.
2. Tryton-backed inventory adjustment with reason/evidence and ATP read-only values.
3. Allocation accept/reject, prepare/pack and ready-for-pickup.
4. Seller return response, pickup, receipt and inspection after return ownership decision.
5. Admin manual payment/reconciliation and unified order activity timeline.
6. Admin Seller Activity Centre with severity, filters, assignment and audit detail.

## Verification

- Customer app build and deployment: `4af8832`.
- `flutter analyze` on changed app files: pass.
- `flutter test`: pass (see final test run in the implementation log).
- Browser checks: toast visible then cleared; Home action returns to `/`; no console errors.
- Admin/Seller assessment: read-only; no build/deploy.
- Production remains unauthorized.
