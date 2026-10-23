# Product studio Slice 5 — review and publish

Date: 2026-10-23  
Lane: C (shared product editor + canonical Mercur review/publish workflows)  
Release: `b5243db`  
Status: staging verified; production unauthorized

## Delivered

- Review panel in the studio:
  - Draft
  - Review required
  - Active
  - Rejected
- Readiness checks:
  - product title
  - category
  - at least one variant
  - every variant has a SKU
  - every variant has an INR base offer price
- Seller:
  - submit draft for review
  - withdraw a proposed submission
  - submission and withdrawal require `role_seller_administration`
- Admin:
  - submit draft for review
  - approve and publish
  - request changes
  - reject
  - reopen a rejected product as draft
- Approval uses Mercur `confirmProductsWorkflow`, which:
  - validates proposed status
  - records a STATUS_CHANGE audit
  - publishes the product
- Rejection and change requests use the canonical Mercur workflows.
- Customer preview rail remains available before submission.

## Verification evidence

- Ready draft catalogue product: `draft → proposed → rejected → draft`.
- Same product: `draft → proposed → published`, then restored to draft through
  the admin product update route to keep staging catalogue state unchanged.
- STATUS_CHANGE audit rows recorded for status transitions.
- Admin review UI rendered all readiness checks and the Submit for review
  action.
- No schema, pricing, stock or catalogue-count change from the review test.

## Safety boundaries

- `production_release_authorized: false`.
- Publishing is admin-only and requires proposed status plus readiness.
- Sellers cannot approve their own listings.
- New studio variants cannot be submitted until offer/pricing provisioning
  exists.
- Published-product edit review is still native; this slice does not introduce
  a post-publish edit pipeline.
- Pause, archive and unpublish are not implemented in the studio.
- `request changes` records the audit request but leaves the product proposed.
- No admin acting-for reason/audit override in this slice.
- Inventory remains read-only and does not gate publication.

## Open items

1. Offer and inventory provisioning for newly created studio variants.
2. B2B pricing, list-vs-selling guardrails, MOQ, effective dates and GST flag.
3. Direct Tryton adjustment posting and low-stock/non-stock policy.
4. Published-product edit review pipeline.
5. Pause, archive and unpublish.
6. Admin acting-for reason and audit override.
7. Production readiness, evidence and human authorization.
