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

## Captured gap

Price-change **audit** (actor, acting-for seller, before/after, reason,
correlation) is not yet recorded. The existing privileged audit store lives in
the Experience API and the native Medusa offer workflow does not carry actor
context. A follow-up needs one of:

1. a small governed `seller_activity` audit sink in the Experience API plus an
   internal append endpoint; or
2. an audit table in the Medusa database with an explicit Change Contract.

Until then, the price update is canonical and tenant-checked, but it does not
yet satisfy the brief's full activity-centre acceptance criterion.

## Deferred by design

- B2C list price vs selling price and discount display.
- B2B pricing and MOQ.
- Effective dates, policy floors and GST validation.
- Seller Activity Centre, assignment, acknowledgement and notifications.
- Price history timeline.

These need approved pricing-model and audit-contract decisions.

## Release

- Functional release: `1711ede`
- Active staging release: `/opt/buildkart-releases/release-1711ede`
- No schema migration.
- Production remains unauthorized.
