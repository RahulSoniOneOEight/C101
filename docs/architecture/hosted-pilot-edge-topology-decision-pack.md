# Hosted Staging Edge Topology Decision Pack

**Change Contract:** `CHG-021`
**Revision:** 1
**Status:** Approved for the bounded hosted staging edge
**Scope:** Hosted staging edge for `pinakaplay.cloud` only

## Decision requested

Approve the hosted staging edge topology below. This authorizes bounded staging edge changes only;
production release remains prohibited.

## Context

`pinakaplay.cloud` is hosted on Hostinger nameservers (`dns-parking.com`) with direct `A` records to
the VPS `89.116.20.164`. A Cloudflare Tunnel requires Cloudflare-authoritative DNS and proxied
CNAMEs, so it cannot serve these hostnames. Traffic reaches the VPS on :80/:443, where the existing
Coolify Traefik already terminates TLS.

## Decisions

| Decision | Baseline | Required roles |
|---|---|---|
| `D-021-01` Edge is Coolify Traefik | The hosted staging edge is the existing Coolify Traefik on :80/:443 with Let's Encrypt, routed by labels to the internal nginx `proxy` | Architecture, Security, Operations |
| `D-021-02` Operator protection and deferred Cloudflare Access | Operator surface is protected by application RBAC (CHG-019) and a host-based privilege policy in nginx; Cloudflare Access is deferred and recorded as a hardening gap | Security, Operations |
| `D-021-03` Private backend unchanged | PostgreSQL, Redis, NATS, Tryton, Medusa and the Experience API publish no host ports and stay on the internal network | Architecture, Security |

## Boundaries

- The Coolify installation and its other applications are not modified.
- The Cloudflare Tunnel remains available as an optional, inactive overlay
  (`docker-compose.cloudflared.yml`) for a future Cloudflare front door.
- The customer hostname can never reach privileged paths; the operator hostname can, subject to RBAC.
- No secret, tunnel credential or tester data is committed to Git.

## Open hardening requirement

Cloudflare Access (or an equivalent SSO+MFA layer) for the operator hostname remains required before
a production transition. It is tracked here and in the production transition contract (CHG-020).
