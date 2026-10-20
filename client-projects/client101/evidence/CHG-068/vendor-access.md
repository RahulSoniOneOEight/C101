# CHG-068 — Vendor access for all staging sellers

**Date:** 2026-10-20
**Environment:** staging only
**Vendor portal:** https://ops-staging.pinakaplay.cloud/seller/
**Production release authorized:** no.

## Outcome

All five staging sellers now have a working vendor-portal login. BuildKart Direct was the only seller
without a member/auth identity; it now has an owner account and can open its own vendor dashboard.

## Accounts verified

The demo seller password is the `SELLER_PASSWORD` constant in
`services/backend/packages/api/src/scripts/seed.ts`. It is intentionally not repeated in this evidence.

| Seller | Login ID | Role | Vendor access |
|---|---|---|---|
| BuildMaster Supplies | `buildmaster@mercur.dev` | Seller administration / owner | pass |
| PowerMax Depot | `powermax@mercur.dev` | Seller administration / owner | pass |
| AquaFlow Supplies | `aquaflow@mercur.dev` | Seller administration / owner | pass |
| UrbanBuild Supply | `urbanbuild@mercur.dev` | Seller administration / owner | pass |
| BuildKart Direct | `catalogue@buildkart.test` | Seller administration / owner | pass |

BuildKart Direct account records:

- Member: `mem_01M5BSXBJ9EN890ZMTR8G557JE`
- Auth identity: `authid_01M5BSXBGWYNKMANWH97ECEPYP`
- Seller: `sel_01M5897CE4PTBHS4AA7H0G79G7`
- Role: `role_seller_administration`
- Owner: `true`
- Seller status: `open` (the approve endpoint is only for `pending_approval`, so no approval change
  was required)

The account was created through the supported invite flow: admin invite, member auth registration,
invite acceptance. It did not create a second seller or change any catalogue, offer, price, order or
shipping-rate data.

## Verification

### API

For every seller email:

- `POST /auth/member/emailpass` returned `200` with a member token.
- `GET /vendor/sellers` resolved exactly one membership with the expected seller name.
- `GET /vendor/sellers/me` with that seller context returned `200`.

### Vendor portal (Chrome)

- All five logins reached `/seller/store-select` with the correct seller card.
- Selecting BuildKart Direct opened `/seller/orders` with its own dashboard and order list.
- Three staging test orders were visible: `#84`, `#81`, `#80`.
- No post-login HTTP errors were observed.

Screenshots:

- `buildkart-direct-store-select.png`
- `buildkart-direct-vendor-dashboard.png`

## Notes

- BuildKart Direct still has a minimal seller profile (no logo, banner, address or payment details).
  That does not block vendor login or order operations; it is a separate presentation/finance setup.
- The ops host is still not behind Cloudflare Access. Vendor credentials are staging-only and must not
  be treated as production credentials.
- No passwords, session tokens or customer production data are included in this evidence.
