# Session note — seller pricing and quantity tiers (first admin/seller slice)

Date: 2026-10-22  
Lane: B — UI + API, no schema change  
Release: `1711ede`  
Environment: staging only

## Delivered

### Canonical pricing routes

Added one shared pricing service around Mercur's existing
`updateOffersWorkflow`:

- `GET|POST /admin/buildkart/offers/:id/pricing`
- `GET|POST /vendor/buildkart/offers/:id/pricing`

The routes:

- read the offer price ladder from the canonical offer/price-set relation;
- validate INR base price and quantity tiers before mutation;
- use the existing Mercur price-set replacement workflow;
- re-read the canonical ladder after save;
- return 422 with field-level copy on validation failure;
- enforce seller ownership on the vendor route (another seller's offer returns 404);
- do not create a second price engine or copy pricing rules into browser state.

### Validation enforced

- one base price per currency;
- positive integer minor-unit amounts;
- at most 10 quantity tiers;
- tier minimum quantity 2 or more;
- maximum quantity must be at least the minimum;
- no overlapping tiers;
- tier unit price cannot exceed the base price;
- a higher quantity tier cannot cost more than a lower quantity tier;
- currency codes are three letters;
- duplicate price ids are rejected.

### Seller Portal

New widget `Seller pricing` on the native offer detail page
(`offers.detail.main.after`):

- lists every offer/variant under the product with its current INR base price;
- opens a focused editor for the selected offer;
- edits base selling price and quantity tiers;
- preserves non-INR price rows;
- validates client-side and server-side;
- reports the server's 422 message without pretending the save succeeded;
- verified save path through the real seller session.

### Admin Console

Same `Seller pricing` widget on the native admin offer detail page.

- Admin has the same price/tier editor for a selected offer.
- Admin route uses the same workflow and validation as the seller route.
- No global seller-scope switcher was added in this slice; the selected offer
  already identifies its seller.
- Admin acting-for audit context is **not yet implemented** — see gap below.

## Verification

- API GET for an existing offer returned its canonical base price.
- Admin POST added a `5–9 @ ₹780` tier; GET confirmed the new price row; the
  tier was removed again and the original `₹791` base price restored.
- Invalid POST with a tier above the base price returned **422**:
  `INR tier 1 cannot cost more than the base price.`
- Admin UI: widget renders on the native offer page, modal opens, tier can be
  added, save returns `Pricing updated`, reopen shows the persisted tier.
- Seller UI: BuildMaster Supplies login, offer detail widget renders, save
  returns `Pricing updated`.
- Seller isolation: BuildMaster session requesting an AquaFlow offer pricing
  route returned **404**.
- Admin and vendor panel builds pass.
- No console errors in either panel.
- Temporary pricing verification admin account removed after the check.

## Follow-up completed in the same pricing bundle

### Price-change audit

Every successful price update now appends an immutable
`seller.offer.price_changed` event to the existing `domain_event` store through
a private Experience API endpoint. No new table or schema migration was needed.

The event contains:

- seller, offer and product IDs;
- actor user and actor role;
- source (`admin_console` or `seller_portal`);
- reason (optional);
- before and after price ladders;
- correlation ID;
- staging/test marker.

The pricing API response includes `audit.recorded` and the event ID. The UI
does not claim success if the price mutation fails.

### Seller Activity page

Added `/dashboard/seller-activity` with:

- immutable event feed;
- seller, offer, before/after price summary;
- actor and role;
- source and reason;
- deep link to the native offer page.

This is a read model over domain events, not a second source of truth.

### Native edit-price guard

The native `POST /vendor/offers/:id` path now rejects requests containing
`prices` with **422 pricing-facade-required**. Sellers must use the validated,
audited Seller pricing editor. Verified with a real seller session.

### Pricing authorization

- Seller pricing writes require `role_seller_administration`.
- A seller support/order-management member receives **403**.
- Admin writes remain available only through the authenticated Medusa admin
  surface, which is the BuildKart administrator superset.
- Platform-wide Mercur RBAC remains off; this is a pricing-specific authorization
  gate, not the full role-template rollout.

## Remaining gaps

- Full Mercur RBAC feature flag, role templates and route-policy enforcement.
- B2C list price vs selling price and discount display.
- B2B pricing and MOQ.
- Effective dates, policy floors and GST validation.
- Activity assignment, acknowledgement and notification routing.
- Price history timeline and admin override reason enforcement.

These require the pricing-model/RBAC decisions recorded in the Admin/Seller
brief assessment.

## Release

- Functional release: `3b2e853` (Experience API) with Medusa image from `cae9372`
- Active staging release: `/opt/buildkart-releases/release-3b2e853`
- No schema migration.
- Production remains unauthorized.
