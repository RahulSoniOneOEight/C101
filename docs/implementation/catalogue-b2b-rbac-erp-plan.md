# Catalogue, B2B, RBAC and ERP completion plan

Date: 2026-10-23  
Branch: `feat/catalogue-b2b-rbac-erp-completion`  
Status: staging implementation only; no deploy or production release

## Inspection findings

- Medusa `2.20.1`, Mercur `2.3.4`.
- Existing shared price list `plist_01M4EN8GW68EED8NKW2NB9YW07`
  (`B2B Trade Pricing`) has 52 prices and a region rule. It must not be reused
  or mutated.
- B2B customer group `cusgroup_01M4EN8856WQRCH8XTXTS2GB9E`
  (`B2B Trade Customers`) has four staging customers, including
  `buyer.b2b01@buildkart.test`.
- The only seller role currently enforced in BuildKart code is
  `role_seller_administration`.
- Mercur native RBAC tables exist but no BuildKart role assignment is active.
  Role templates are therefore implemented in the governed BuildKart API layer.
- Inventory requests live in `buildkart_experience.inventory_adjustment_request`.
  Approval already records a decision without a Tryton stock effect.
- Tryton is accessed through the JSON-RPC client in
  `services/experience-api/src/tryton/client.ts`; stock moves are created with
  `stock.move`.
- Catalogue baseline is 233 products.

## Work package boundaries

1. **B2B pricing** — new customer-group-scoped price list; do not touch the
   existing region-ruled list; backend, UI and buyer-context resolution.
2. **Acting-for-seller** — authorised admin only; seller selector, reason,
   reference, optimistic version, audit with both actor and seller.
3. **RBAC templates** — central permission constants, role templates, route
   guards, seller scope, deny-by-default.
4. **ERP posting** — approved adjustment → explicit ERP Operator post command →
   idempotent Tryton movement → canonical reference → reconciliation.

## Data and API changes

- New `inventory_adjustment_posting` table for command state, idempotency key,
  Tryton reference, attempts, last error and reconciliation status.
- New B2B price list created through Medusa core workflows and tagged with
  metadata `buildkart_b2b = true`, environment and test-data markers.
- New B2B pricing routes: seller scoped and admin cross-seller.
- Acting-for fields added to selected admin routes.
- Central RBAC module used at route boundaries.

## Risk controls

- B2B list is customer-group scoped; ordinary B2C customers cannot resolve it.
- Seller routes derive seller identity from `seller_context`, never from the
  request body.
- Admin acting-for requires `acting-for-seller` permission and a non-blank
  reason.
- Consequential writes include a version/optimistic-lock check where the
  underlying workflow supports it.
- ERP posting requires an explicit human operator action and an idempotency key.
- Approval alone never posts to Tryton.
- No existing promotion, banner, collection or campaign engine is changed.

## Rollback

- Deactivate the new B2B price list; do not delete the existing list.
- Remove new B2B pricing routes/UI; B2C prices remain untouched.
- Disable acting-for by removing the permission from admin role templates.
- Revert posting commands to `posting_failed` and reconcile against Tryton; do
  not delete Tryton movements.
- Drop `inventory_adjustment_posting` only after exporting its audit rows.

## Test plan

- Permission matrix unit tests for every role and unknown role.
- Route-level direct API tests for seller isolation.
- B2B buyer/B2C/anonymous resolution tests against staging.
- Acting-for audit and missing-reason tests.
- Inventory approval no-movement test.
- ERP Operator post, duplicate-post and reconciliation tests.
- `tsc --noEmit`, admin/vendor builds, `git diff --check`, catalogue counts.

## Blocked items

Integration evidence requires a staging deployment. The current instruction
forbids deploy, so B2B buyer, acting-for, and Tryton posting integration tests
are marked BLOCKED until deployment is explicitly authorised.
