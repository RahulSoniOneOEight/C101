# U-009 / B004 — Staging release record

**Date:** 2026-10-31
**Status:** RELEASED to staging (not production)
**Release commit:** `e12f6f7`
**Release directory:** `/opt/buildkart-releases/release-e12f6f7`
**Previous release / rollback ref:** `release-186a50f` (`186a50f8f`)
**Production:** untouched; `production_release_authorized: false`

## Images

| Image | ID |
|---|---|
| `buildkart-hosted-pilot-medusa:latest` | `c1021b0b0be1` |
| `buildkart-hosted-pilot-experience-api:latest` | `94818d572a3d` |

The old staging image had no surviving tag/ID in the Docker store, so rollback
requires rebuilding `release-186a50f` rather than re-tagging.

## Database

- Snapshot before the release:
  `/opt/buildkart-releases/backups/buildkart-20261031T082225Z.dump`
  (`sha256 12a68b91bcfb0ba538e00dcde83eb2d8bfa19583a3e8f9a750b0979681b61f74`).
- `medusa db:migrate` applied `Migration20261030120000`; `seller_delivery_rate`
  exists with its unique/index/check constraints.
- Provisioning created 5 calculated `Delivery` options (one per seller) with
  `data.seller_id` and type `delivery`.
- 10 legacy Standard/Express options flipped to `enabled_in_store="false"`;
  order history untouched.
- Test rate seeded: `sdr_u009qcstaging400001` — PowerMax Depot, pincode
  `400001`, ₹49, active, `updated_by=admin`. All other pincodes fall back to
  ₹99.

## Web storefront

- Built with the staging dart-defines and deployed to Firebase Hosting
  `buildkart-staging` (`https://buildkart-staging.web.app`).
- Build id `ecfa6e1ff34f881e617de8557a21fa94`; the hosted `flutter_bootstrap.js`
  hash matches the local build.
- The hosted `main.dart.js` contains `One flat fee per seller`,
  `Read-only at checkout`, and `Set a delivery address`.
- `app-staging.pinakaplay.cloud` is the Next.js web backlog (C-10) and was not
  changed.

## Live staging QC

`python3 evidence/U-009/qc-staging-e2e.py` — 16/16 PASS.

| Check | Result |
|---|---|
| Health + home endpoints | 200 |
| Default pincode `999999` | delivery ₹99, shipping_total 9900 |
| Exact rate `400001` (B2C) | delivery ₹49, shipping_total 4900 |
| Options endpoint | amount 4900, tax-inclusive true |
| B2C order | `BK-261031-0FSTTQ`, #164, shipping ₹49, total ₹147,299 |
| B2B order (Arjun Traders) | `BK-261031-8X293X`, #165, shipping ₹49, total ₹144,449 |
| Order records | `order_shipping_method` amount 49, `is_tax_inclusive = t` |

## Rollback

1. `ln -sfn /opt/buildkart-releases/release-186a50f /opt/buildkart-releases/current`
2. Rebuild `medusa-api`, `medusa-worker`, `experience-api` from `release-186a50f`
   (the old image is not in the local store), then `docker compose up -d`.
3. `medusa db:rollback --modules delivery_rates` (verified on a clone).
4. Re-enable Standard/Express rules if required (`enabled_in_store` back to
   `"true"`), or delete the Delivery options.
5. `firebase hosting:rollback --project buildkart-staging` (or redeploy the
   previous web build).
6. Restart the proxy after recreating services.

## Known residuals

- Admin/vendor dashboard UI was browser-QC’d on preview; staging dashboard was
  not logged into (no staging admin credentials). The page asset is present and
  `/admin/buildkart/delivery-rates` returns 401 on staging.
- `scripts/verify-catalogue-assets.py` reports 236 storefront products vs its
  hard-coded 233 baseline. No product was created on staging today (the QC
  products are preview-only); this is pre-existing baseline drift.
- The preview stack (containers, preview DBs, image tag) remains on the host for
  comparison and can be removed after sign-off.
