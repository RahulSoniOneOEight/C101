# Customer identity realm — 2026-11-21

Status: **live on staging in directory mode** · customer identities migrated · Flutter uses email
code · Cloudflare Access/IdP and Turnstile keys still pending.

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

Staging now runs `IDENTITY_MODE=directory`. The 21 pilot identities were migrated into
`customer_identity` with their roles and business accounts, so B2B testers keep their channel.
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

### Staging rollout

`IDENTITY_MODE=directory` is now live on staging. The previous secret file is kept as
`experience-api.env.pre-directory`.

The 21 pilot identities were migrated with their role assignments:

```text
rsoni001@gmail.com          customer, b2b_buyer   business_bazarbee_pilot
buyer.b2b01@…               b2b_buyer, customer   business_arjun_traders
buyer.b2b02@…               b2b_buyer, customer   business_shakti_hardware
admin.b2b01@…               b2b_account_admin, customer, b2b_buyer
approver.b2b01@…            b2b_approver, customer, b2b_buyer
```

Web sign-in:

```text
/sign-in → email code → staging preview code → signed in at /orders
header shows Shop / Trade (B2B role preserved)
zero page errors
```

Flutter sign-in:

```text
Email address → Email me a code → “Staging preview code: …” → Verify
lands on home, B2B trade entry present
zero page errors
```

### Rate limiting

Auth endpoints now enforce fixed-window limits in Redis:

```text
code / magic / OTP challenge   10 per 10 min per IP · 5 per 10 min per device
code / magic / OTP verify      30 per 10 min per IP · 15 per 10 min per device
```

A 429 was observed during testing, confirming the limiter. Test buckets were cleared for the QC
rerun. Flutter now sends a persistent `x-device-id`; CORS allows that header.

## 3. Files

```text
services/experience-api/src/auth/customer-identity.ts
services/experience-api/src/auth/realm-session.ts
services/experience-api/src/auth/rate-limit.ts
services/experience-api/src/auth/email-auth.ts
services/experience-api/src/config.ts
services/experience-api/src/index.ts
services/experience-api/src/scripts/migrate-pilot-identities.ts
apps/prototype_app/lib/data/experience_api.dart
apps/prototype_app/lib/screens/b2c_flow_screens.dart
```

## 4. Not done

- Cloudflare Access for ops/seller/ERP — needs the Cloudflare account, zone and IdP; see
  `docs/architecture/cloudflare-access.md`.
- Cloudflare Turnstile keys are not installed; bot protection currently means rate limits only.
- Seller and admin identity realms are still Mercur passwords. Access + MFA would make the password a
  second factor, but a true SSO bridge is not implemented.
- Production email delivery still needs a verified Resend sender with SPF/DKIM/DMARC.
- No admin UI for disabling customers; the store has `setStatus` for an operator endpoint.
- No production user migration; production starts with an empty directory.

## 5. Release

- API `release-api-20261120-195556`
- Flutter `/opt/buildkart-flutter/web` (backup `web.bak-cod-20261120-195509`)
- Staging identity mode: `directory`
