# Session Handoff — Hosted-Pilot RBAC, Notifications and Production Transition

**Date:** 08 October 2026
**Branch merged:** `feat/hosted-pilot-rbac-notifications` → `main` (PR #9, merge commit `7153349`)
**Status:** Bounded hosted-staging increment implemented and merged. Production remains unauthorized.

## 1. What was delivered

### RBAC (CHG-019, approved)
- Server-owned pilot role assignments; unknown role/identity and incomplete scopes fail closed.
- Route authorization for `/v1/admin/*`, `/v1/ops/*`, `/metrics`, payment-simulate, shipment-advance.
- Customer/B2B/seller scope checks; cross-tenant requests return non-enumerating `404`.
- Super-admin consequential actions blocked (`409`) until an independent second approval exists.
- Immutable `pilot_privileged_audit`; an unavailable audit store blocks the mutation.

### Persistent notifications (CHG-018)
- Inbox, read state, device registration and normalized delivery-attempt tables.
- Authenticated `/v1/me/notifications`, `/{id}/read`, `/read-all`, `/v1/me/devices` (+ DELETE).
- Four versioned templates + durable NATS `pilot-notification-dispatch` worker (dedupe, retry, DLQ).
- Staging-only FCM gateway, disabled unless credentials + approved wording are configured.
- Notification failure cannot alter canonical order success; every record `test_data=true`.

### Flutter pilot client
- Persistent inbox replaces fixtures; badge, mark-read/all, refresh, deep links.
- FCM token register/refresh; foreground/background/terminated handling; logout device cleanup.
- Secure session restore; OTP required for both modes; staging banner; release fails closed without signing.

### Hosted packaging
- Dockerfiles for Mercur backend and Experience API; private Compose; Cloudflare Tunnel config;
  customer-host `404` policy for privileged paths; secret templates; encrypted backup + restore proof.
- Post-deploy acceptance gate: `services/experience-api` `bun run test:acceptance`.

### Governance
- `CHG-020` production transition drafted (`proposed-awaiting-human-approval`), with `D-020-01..12`
  and a separate release decision `D-020-12`.
- `tooling/validate_chg020_approvals.py` + `tooling/test_chg020_validator.py` prove release cannot be
  authorized before gates pass, and cannot be self-authorized.
- `docs/architecture/production-readiness-gap-assessment.md` maps every gate to repository evidence.

## 2. Verification (all green)

| Check | Result |
|---|---|
| `bun run typecheck` (experience-api) | PASS |
| `test:rbac`, `test:rbac-http`, `test:notifications`, `test:consumers` | PASS |
| Flutter `analyze` + `test` (100) | PASS |
| Release APK without signing | Fails closed |
| Docker images (backend, experience-api) | Built |
| `validate_contracts`, CHG-017/018/019 validators | PASS |
| `validate_chg020_approvals` + negative test | PASS |
| `docker compose config` (base + FCM override) | PASS |

## 3. External inputs still required (blockers)

- Hostinger VPS access; staging domain and DNS.
- Cloudflare Tunnel credential + Access policy.
- Firebase Admin service credential (server-side only).
- Approved wording for the four notification templates; tester consent.
- Protected Android release keystore (for the signed APK).
- Hosted secret files under `/etc/buildkart/secrets/`.

## 4. Next steps (in order)

1. Provision the VPS, install host secret files, bring up `services/hosted/docker-compose.hosted.yml`.
2. Point the Tunnel at the stack; verify customer-host `404` for privileged paths.
3. Run `bun run test:acceptance` against the hosted URL; run `scripts/restore-proof.sh`.
4. Enable FCM (approve wording + consent), verify one staging delivery.
5. Build the signed APK; roll out via Firebase App Distribution in waves (2–3 → 5 → 20).
6. Only then open `CHG-020` decisions; `D-020-12` (production release) stays blocked.

## 5. Production posture

Unchanged and explicit: `production_release_authorized: false` across CHG-017/018/019/020. Simulated
payment, the shared test OTP, simulated logistics and staging-only notifications remain mandatory.
No production data, providers, endpoints or release are authorized.
