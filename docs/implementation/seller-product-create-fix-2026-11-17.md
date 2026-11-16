# Seller product creation — staging QC and defect fix

**Date:** 2026-11-17  
**Lane:** B (vendor UI + Mercur API, no schema, no migration)  
**Status:** source-verified locally; staging deployment **authorized but blocked** — the documented
`buildkart_deploy` SSH key is absent from this workstation.

## QC result

Live QC used the seller portal (`/seller/products/new`) as **BuildKart Direct** with a clearly
marked test product (`QC Add Flow 20261117-0004`, SKU `QC-ADD-20261117-0004`). The form accepted
title, category (`Hand Tools`), variant name, SKU and variant description, then **Create product**
returned HTTP **422**:

> A reason is required before provisioning seller offers.

No product, offer, inventory item, price or order was created; the validation fails before any
write. The error is visible in the page but was not announced (`role="alert"` was missing).

## Cause

`saveStudioProduct` computed `requestedSellerId` as the acting seller for **both** admin and vendor
mode, then required `seller_provision_reason` whenever it was set. The vendor form only collects a
reason in admin mode, so every seller-owned create and edit failed. The reason exists to justify an
**admin** assigning a product to a seller; a seller saving their own product provisions their own
offer implicitly.

## Fix

- Move the guard into `product-studio-guard.ts` and require the reason only when
  `mode === "admin"` and a seller is selected.
- Vendor variant row: show **“Your seller account”** instead of a false **“⛔ Missing”** seller
  before the first save.
- Add `role="alert"` to the save error notice so a blocked seller is notified.

## Verification

| Check | Result |
|---|---|
| Jest unit test (`product-studio-guard.unit.spec.ts`) | 3 passed |
| `tsc --noEmit` (packages/api) | passed |
| Vendor production build (staging config, `/seller/` base) | passed in 40.8s |
| ESLint on `studio-form.tsx` | pre-existing React-hooks errors only; no new finding from this change |
| Live end-to-end create | **blocked** until this branch is deployed |

## Deployment gate

Requires one API image rebuild that also bundles the vendor dashboard, plus a re-run of the same
live QC (create, verify offer/inventory link, confirm no price and no storefront visibility, then
remove the test product through the reviewed delete path).

Staging deployment was authorized on 2026-11-17. It is blocked on this workstation because
`C:\Users\LENOVO\.ssh\buildkart_deploy` does not exist (only `known_hosts` is present) and no SSH
agent holds the key. The fix branch and exact commit are on origin:

- Branch: `fix/seller-product-create`
- Commit: `840f13628f0071ee5a095153b5c3dd86a6bc5d77`

Documented operator procedure:

```sh
ssh -i ~/.ssh/buildkart_deploy root@89.116.20.164
cd /opt/buildkart
git fetch origin fix/seller-product-create
git worktree add --detach /opt/buildkart-releases/release-840f136 840f13628f0071ee5a095153b5c3dd86a6bc5d77
cp /opt/buildkart-releases/current/services/hosted/.env \
  /opt/buildkart-releases/release-840f136/services/hosted/.env
cd /opt/buildkart-releases/release-840f136/services/hosted
docker compose -f docker-compose.hosted.yml build medusa-api medusa-worker experience-api event-workers
ln -sfn /opt/buildkart-releases/release-840f136 /opt/buildkart-releases/current
docker compose -f docker-compose.hosted.yml up -d medusa-api medusa-worker experience-api event-workers
docker restart buildkart-hosted-pilot-proxy-1
```

No Medusa schema or dependency change is included, so `medusa-migrate` is not required. After the
deploy, rerun the add-flow QC and confirm health/dashboard/seller endpoints.

