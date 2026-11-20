# Identity and access model — 2026-11-21

Status: **decided** · implementation pending · production untouched.

Decision: use the same passwordless email experience everywhere — email code or magic link — but
keep **separate identity realms** for customers, sellers, admin/ops and ERP. A token from one realm
must never be accepted by another.

## 1. Realm model

| Realm | Primary auth | MFA | Session | Provisioning |
|---|---|---|---|---|
| Customer (B2C/B2B) | Experience API email code or magic link | None | 30 days, revocable | Self-service; B2B adds business-account membership |
| Seller | Cloudflare Access one-time PIN or Google Workspace / Entra SSO, then seller session | Step-up for payouts, bank changes, refunds | 12 hours | Invite-only, verified business email + KYC |
| Admin / operator | Cloudflare Access + SSO | Mandatory MFA at Access | 8 hours | Named accounts, no shared logins |
| ERP / Tryton | Cloudflare Access + SSO/OIDC proxy, or LDAP | Mandatory MFA | 8 hours | Named Tryton users, least privilege |

“Same UX” means the user sees an email-code/magic-link screen. It does **not** mean one shared
session, one cookie or one directory.

## 2. Why Cloudflare Access for seller/admin/ERP

- central device/session policy and MFA
- one-time PIN gives the same email-code UX without building a second custom auth stack
- Google Workspace / Entra can enforce company-domain login for staff
- ERP and seller portals can sit behind the same gate
- break-glass can be an Access OTP plus a hardware key, not a shared password

The custom Experience API auth remains the customer realm only. It is not promoted to ops.

## 3. Realm isolation rules

```text
customer  cookie  bazarbee_session           Redis prefix bazarbee:email-auth:v1:customer
seller    cookie  bazarbee_seller_session    Access JWT audience seller
admin     cookie  bazarbee_ops_session       Access JWT audience admin
erp       Access session + Tryton session    Access JWT audience erp
```

- separate signing keys/audiences; no token is accepted across realms
- separate Redis namespaces and rate-limit buckets
- separate session TTLs and revocation lists
- ops realm restricted to approved email domains/groups
- customer tokens cannot call `/v1/admin/*`, `/v1/seller/*` or ERP
- seller tokens are scoped to one seller id and one business account

## 4. Customer flow (existing base)

Already implemented and retained:

- 6-digit code, hashed in Redis, 10-minute TTL
- magic token, 32 random bytes, single-use, 15-minute TTL
- 5 attempts, 60-second resend cooldown
- preview code/link suppressed when an email sender is configured
- production refuses to start without an email sender

Production additions:

- replace `PILOT_USERS_JSON` with a real user directory
- real transactional email sender with SPF, DKIM and DMARC
- per-IP and per-device rate limits; bot protection on the login form
- magic link bound to the requesting browser/device, `Referrer-Policy: no-referrer`
- session device list, revoke-all, idle timeout
- enumeration-safe responses and bounce handling

## 5. Seller flow

1. Seller is invited by marketplace operations; invitation is tied to a verified business email.
2. Access gate presents one-time PIN or SSO.
3. Seller session is issued with `seller_id` and business-account scope.
4. Financial actions require step-up MFA and write an audit event.
5. Bank/payout changes require a second approver.

## 6. Admin and ERP flow

- `ops.bazarbee.com` is behind Cloudflare Access.
- Staff use company Google Workspace or Entra accounts with mandatory MFA.
- Mercur admin and seller sessions remain app-level authorization, but Access is the outer gate.
- Tryton is reachable only under `/erp/` on the ops hostname and only through Access.
- No shared `admin@buildkart.test` password in production.

## 7. Implementation phases

| Phase | Work |
|---|---|
| 1 | Identity directory + realm claim for the customer realm; remove pilot allowlist in production |
| 2 | Production email sender, rate limits, bot protection, session/device controls |
| 3 | Cloudflare Access in front of ops host; admin SSO + MFA; named accounts |
| 4 | Seller invitations, KYC and Access policy; seller session scoping |
| 5 | Tryton under Access with named users; remove shared admin |
| 6 | Step-up MFA for payouts/bank/refunds; audit and alerting |
| 7 | Penetration test, UAT and gate evidence |

## 8. Acceptance criteria

- no production path accepts OTP `123456` or pilot allowlists
- no preview codes/links in production responses
- customer, seller, admin and ERP tokens are mutually rejected
- admin cannot be reached without Access + MFA
- seller cannot read another seller or business account
- ERP cannot be reached without Access
- magic links are single-use and browser-bound
- login, logout, revoke-all and role changes are audited
- production email passes SPF/DKIM/DMARC checks
- UAT signed by Security and Operations

## 9. Current state

- customer directory and realm-scoped sessions are live on staging in `IDENTITY_MODE=directory`
- 21 pilot identities were migrated with their roles; staging uses email codes with preview codes
- web and Flutter sign in with email code; Flutter sends a device id for auth rate limiting
- Cloudflare Access, IdP groups and Turnstile keys are still pending account configuration
- admin/seller use Mercur email/password; ERP uses Tryton username/password
- admin password was temporarily set to `supersecret` during QC — rotate immediately
- production email delivery still needs a verified Resend sender
- production starts with an empty customer directory
