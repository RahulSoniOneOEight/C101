# Product studio — production readiness checklist

Date: 2026-10-23  
Status: preparation only; production release not authorized

This checklist records the work needed to move the staging-verified product
studio toward production. It is not production authorization.

## Already verified in staging

- Product details, tags, specifications and draft save.
- Variant options, combinations, SKU uniqueness and bulk SKU assignment.
- B2C offer pricing and quantity tiers through the audited pricing facade.
- Tryton stock read and inventory adjustment requests with no stock effect.
- Review submission, approval, rejection, change request and reopen.
- Seller offer and inventory-item provisioning for new studio variants.
- STATUS_CHANGE, price-change and inventory-request audits.

## Blocking decisions

1. **Shipping profile assignment**
   - Current fallback uses the seller's existing offer profile, then the first
     staging profile.
   - Production needs an explicit seller/store shipping-profile policy.

2. **Inventory item and stock authority**
   - Offers create inventory items with no stock.
   - Tryton remains the stock authority.
   - Opening stock, direct adjustment posting, low-stock thresholds and
     non-stock policy need approval.

3. **Pricing extensions**
   - list vs selling price
   - B2B price lists and MOQ
   - effective dates
   - GST-inclusive display/flag
   - >20% change hold
   - floor-price override authority
   - bulk pricing scope

4. **Publish governance**
   - published-product edit review
   - pause, archive and unpublish
   - seller resubmission after change request
   - admin acting-for reason and audit
   - full RBAC role templates

5. **Production environment**
   - production secrets and rotation
   - Cloudflare Access or equivalent operator protection
   - backup and restore proof
   - observability, alerting and runbooks
   - migration/rollback plan
   - production acceptance and regression suite
   - human production authorization

## Required evidence before release

- [ ] Approved decision records for the blockers above.
- [ ] Regression suite green in staging.
- [ ] End-to-end seller create → price → inventory → submit → approve → storefront.
- [ ] Seller isolation tests for offers, pricing and inventory.
- [ ] Audit-event completeness check.
- [ ] Backup restore proof.
- [ ] Security review and operator access proof.
- [ ] Migration and rollback rehearsal.
- [ ] Production release note and human sign-off.

## Explicit non-authorization

The product studio remains staging-only until every blocking decision and
evidence item is closed and a human authorizes production release.
