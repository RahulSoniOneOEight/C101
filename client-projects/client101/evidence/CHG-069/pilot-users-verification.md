# CHG-069 — Pilot test users verified active

**Date:** 2026-10-20
**Environment:** staging only
**Result:** all 20 configured pilot identities authenticate successfully.
**Configuration changed:** no — all were already active.

## Why no activation change was needed

Pilot login is gated by two deployment settings:

- `PILOT_USERS_JSON` — the allowlisted identities.
- `PILOT_ROLE_ASSIGNMENTS_JSON` — one role assignment per identity.

There is no separate `active` flag or customer database state that must be switched on. All 20
entries already had both an allowlist record and a valid role assignment; the `unassigned` check
returned none.

## Verification

Each identity completed a real staging OTP exchange:

1. `POST /v1/auth/otp/challenges` with its login identifier.
2. `POST /v1/auth/otp/verify` with the fixed staging OTP `123456`.
3. A non-empty session token was returned.

Result: **20 of 20 passed**. The API also reports `pilot_user_count: 20`.

### Role coverage

| Role | Users |
|---|---:|
| customer | 6 |
| b2b_buyer | 2 |
| b2b_account_admin | 1 |
| b2b_approver | 1 |
| seller_admin | 2 |
| seller_catalog_manager | 1 |
| seller_order_manager | 2 |
| support_operator | 1 |
| marketplace_operator | 1 |
| erp_operator | 1 |
| finance_operator | 1 |
| super_admin | 1 |

The customer group includes the primary tester plus five additional B2C testers. The B2B group
covers buyer, account-admin and approver journeys. Seller-role identities are Experience API RBAC
fixtures; actual vendor-portal access is the separate Medusa seller-member configuration in CHG-068.

## Operator reference

The complete identity list, login IDs, roles, business-account or seller context, and the staging OTP
are in the restricted local file:

`C:\Users\LENOVO\Desktop\buildkart-staging-accounts.txt`

Tester emails are not copied into this repository. The authoritative source remains the staging
deployment environment.

## Limits

- The hosted allowlist supports up to 20 identities and is currently full. Adding a 21st tester
  requires replacing/expanding the configured list and restarting the Experience API.
- The pilot OTP is a fixed staging code, not a production authentication mechanism.
- Production identity remains out of scope and unauthorized.
