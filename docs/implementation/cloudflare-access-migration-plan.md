# Cloudflare Access Migration Plan (Deferred)

**Status:** Deferred hardening item. Not implemented in the current pilot.
**Owner decision:** Deferred to a planned maintenance window to keep the working staging pilot stable
through tester wave 1 (recorded 2026-10-08).
**Related:** CHG-019 `D-019-06`, CHG-021 `D-021-02`, CHG-020 `D-020-10`.

## Objective

Put the operator surface (`ops-staging.pinakaplay.cloud`) behind Cloudflare Access with named
operator identities and MFA, in addition to application RBAC.

## Why it is deferred

- `pinakaplay.cloud` uses **Hostinger nameservers** (`dns-parking.com`) with direct `A` records.
  Cloudflare Access only protects hostnames served through Cloudflare's edge, so the zone must be
  moved to Cloudflare first.
- The move is zone-level and affects `coolify.`, `deploy.`, `api-staging.`, `ops-staging.`,
  `app-staging.` and `content-staging.`, plus the existing Coolify/Traefik Let's Encrypt setup.
- A Traefik basic-auth substitute is **not** viable: Traefik basic auth and the operator API both use
  the `Authorization` header, so it would break bearer-authenticated operator calls.

## Current control (unchanged)

- Application RBAC (CHG-019): privileged routes require operator roles; unauthorized → `401`/`404`.
- The customer hostname returns `404` for all privileged paths.
- TLS via Let's Encrypt on the Traefik edge.

## Migration steps (planned window)

1. Add `pinakaplay.cloud` as a zone in Cloudflare; let Cloudflare import existing records.
2. Verify all six records are present. Keep `coolify.` and `deploy.` **DNS-only** (grey cloud) so
   Coolify's Traefik keeps terminating TLS and issuing Let's Encrypt certificates.
3. Set SSL/TLS mode to **Full (strict)**. Do not use Flexible.
4. Proxy (orange cloud) `api-staging.` and `ops-staging.` only.
5. Create a Cloudflare Access application for `ops-staging.pinakaplay.cloud` with an allow policy of
   named operator emails and an MFA/One-time-PIN requirement. Access uses a cookie, so it does not
   conflict with the API bearer token.
6. Switch nameservers at the registrar to the Cloudflare pair.
7. Verify: `coolify.`/`deploy.` still resolve and serve; `api-staging` customer paths unchanged;
   `ops-staging` requires Access login before reaching the API; privileged routes still enforce RBAC.

## Rollback

Revert nameservers to Hostinger and restore the six A records. Cloudflare-side objects can be left
disabled. Target rollback time under 30 minutes.

## Risks

- Brief DNS propagation outage during the nameserver switch.
- Let's Encrypt HTTP-01 validation can break if Cloudflare's "Always Use HTTPS" interferes; keep the
  challenge path reachable over HTTP or move Coolify hosts to DNS-only.
- Coolify may rewrite Traefik configuration; re-verify after the zone move.

## After the move

- Optionally enable the Cloudflare Tunnel overlay (`docker-compose.cloudflared.yml`) and Cloudflare
  WAF/rate limiting for the customer hostname.
- Update CHG-021 `open_requirements` and record the completed Access policy as evidence.
