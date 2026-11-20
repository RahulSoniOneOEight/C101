# Customer identity realm — 2026-11-21

Status: **implemented and tested in directory mode on staging** · staging still runs pilot mode ·
Cloudflare Access not yet configured.

## 1. What changed

- `IDENTITY_MODE=pilot|directory` configuration.
- Production now requires `IDENTITY_MODE=directory` and `RESEND_API_KEY`; `PILOT_USERS_JSON` is
  prohibited.
- New `customer_identity` table (Experience DB) with status, roles, business account and login times.
- New `CustomerIdentityStore`: self-service `findOrCreate`, get, list, mark login, disable.
- New `RealmSessionStore`: opaque Redis sessions with a customer-specific prefix and 30-day TTL.
- Customer email-code/magic-link routes now resolve directory identities when in directory mode.
- `authenticate()` resolves customer sessions from the customer realm and rejects disabled users.
- Email auth Redis prefix is realm-scoped (`bazarbee:customer-email-auth:v1`).
- Login responses report `test_data: false` in production.

Staging remains `IDENTITY_MODE=pilot`; pilot OTP and the 21 tester identities are unchanged.

## 2. Verification

A temporary API instance was started with:

```text
PORT=9120
IDENTITY_MODE=directory
RESEND_API_KEY=
```

and tested against the same Experience database and Redis:

```text
POST /v1/auth/email/code    201  preview code (staging, no sender)
POST /v1/auth/email/verify  200  realm.qc@example.com  roles ["customer"]
GET  /v1/me/contexts        200  user_id cust_…  roles ["customer"]
Same token on port 9020     401  pilot realm rejects it
```

The test identity was deleted afterwards. Store test:

```text
created   cust_…  identity.qc@example.com  ["customer"]  active
found     same id
disable   status disabled
recreate  null (disabled users are not reactivated)
```

## 3. Files

```text
services/experience-api/src/auth/customer-identity.ts
services/experience-api/src/auth/realm-session.ts
services/experience-api/src/auth/email-auth.ts
services/experience-api/src/config.ts
services/experience-api/src/index.ts
```

## 4. Not done

- Cloudflare Access for ops/seller/ERP — see `docs/architecture/cloudflare-access.md`.
- Seller and admin identity realms are still Mercur passwords.
- Flutter still uses `/v1/auth/otp/challenges`; production Flutter must switch to email code/magic
  link or the endpoint must proxy email OTP in directory mode.
- No production user migration yet; production starts with an empty directory.
- No admin UI for disabling customers; the store has `setStatus` for an operator endpoint.
- Rate limiting is still email-based; per-IP/device and bot protection remain.

## 5. Release

- API `release-api-20261120-194119`
- Staging identity mode remains `pilot`
