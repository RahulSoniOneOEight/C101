# Product lifecycle and published-change governance

Date: 2026-10-23  
Lane: B/C (product status + metadata + review actions)  
Release: `7aff5ac`  
Status: staging verified; production unauthorized

## Delivered

- Admin lifecycle actions on a product:
  - unpublish
  - pause
  - archive
  - restore as draft
- Published products can receive a change request. The product returns to
  `draft` with `lifecycle_state = changes_requested`, so the seller can edit and
  resubmit through the existing review flow.
- Lifecycle transitions record `lifecycle_state`, `lifecycle_changed_at` and
  `lifecycle_reason` in product metadata.
- Each transition writes a `STATUS_CHANGE` audit record.
- Storefront visibility is controlled by the Medusa product status: paused,
  archived and unpublished products are returned to `draft` and are not active.
- The studio shows the current lifecycle state and a Restore action.

## Verification evidence

Temporary product `prod_01M5KSXV3J481GEZY2ETTYD1DE`:

| Action | Result |
|---|---|
| Set B2C price and list price | pass |
| Submit | `proposed` |
| Approve | `published` |
| Pause | `draft` |
| Restore | `draft` |
| Submit + approve | `published` |
| Archive | `draft` |
| Restore | `draft` |
| Submit + approve | `published` |
| Unpublish | `draft`, `lifecycle_state=unpublished` |

The temporary product, offer and inventory item were deleted afterwards.

## Boundaries

- Pause/archive/unpublish use the existing Medusa `draft` status plus lifecycle
  metadata. They do not add new status enum values, so no destructive schema
  migration is required.
- A paused/archived product is a draft for editing purposes; admin Restore is
  the documented recovery path.
- Seller edits of published products are still blocked; the admin must request
  changes or unpublish first.
- Admin acting-for and RBAC role templates remain separate.
- B2B price lists, MOQ and effective dates remain separate because the existing
  B2B price list is region-ruled and shared; writing to it could affect B2C
  pricing.

## Open items

1. Customer-group-scoped B2B price lists, MOQ and effective dates.
2. Admin acting-for reason and audit.
3. Full RBAC role templates.
4. ERP posting and reconciliation.
5. Production evidence and human authorization.
