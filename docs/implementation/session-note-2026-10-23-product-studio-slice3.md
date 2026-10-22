# Product studio Slice 3 — pricing delivery note

Date: 2026-10-23  
Lane: C (shared Admin/Seller product editor, reuse of the audited offer-pricing facade)  
Release: `b23e774`  
Status: staging verified; production unauthorized

## Delivered

- Pricing section in the shared studio page, directly under variants.
- Per-offer INR B2C base selling price and quantity tiers.
- Up to 10 quantity tiers with the same server-side ladder validation as the
  native offer pricing editor.
- Add/remove tier controls.
- Optional change reason.
- Admin sees all seller offers for a variant; seller sees only its own offers.
- Pricing writes reuse:
  - `/admin/buildkart/offers/:id/pricing`
  - `/vendor/buildkart/offers/:id/pricing`
- Price changes append `seller.offer.price_changed` with actor, role, source,
  reason and before/after prices.
- Pricing readiness: every variant needs an offer with a positive INR base
  price.
- Safe read-only state when a seller opens a product it does not own.

## Verification evidence

- Admin studio loaded two seller offers for the same catalogue variant, with
  seller names, SKUs and existing INR amounts.
- Admin UI changed a base price to `₹4,180` with a reason.
- Database amount and `seller.offer.price_changed` audit event matched.
- Price restored to `₹4,179` through the audited endpoint.
- Seller non-owned product page showed read-only, with no Save draft action.
- Temporary pricing QC was reverted; no catalogue or stock change.

## Safety boundaries

- `production_release_authorized: false`.
- No new pricing table, product price field or price engine.
- Only B2C INR base price and quantity tiers are exposed.
- B2B price lists, list-vs-selling guardrails, MOQ, effective dates, GST flag
  and policy floors are not invented here; they remain CHG-074 extensions.
- New studio variants have no seller offer yet; the UI states that pricing
  becomes available after offer/inventory provisioning.
- Seller studio editing remains draft-only; published seller pricing continues
  through the native offer editor.
- No stock, payment or publication effect.

## Open items

1. Slice 4: Tryton-backed inventory inside the studio.
2. Slice 5: ProductChange submission, review and publish.
3. Offer provisioning for newly created studio variants, including shipping
   profile and inventory-item policy.
4. B2B/list/MOQ/effective-date/GST pricing extensions.
5. Bulk pricing across selected variants and offers.
6. Decide whether published seller products get a pricing-only studio view.
