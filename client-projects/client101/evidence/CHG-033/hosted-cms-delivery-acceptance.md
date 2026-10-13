# Hosted CMS Delivery Acceptance

**Date:** 13 October 2026  
**Scope:** Bounded hosted staging on `srv2040286`  
**Change Contract:** CHG-033 revision 3  
**Status:** Implemented in staging; awaiting human review; production release unauthorized

## Release

- Hosted release commit: `2cbf60f`.
- Merged delivery PRs: #29, #30, #31, #32, #33, #34, #35, #36, and #37.
- The deployment uses a clean detached worktree under `/opt/buildkart-releases/`; the operator's
  pre-existing modified checkout was not overwritten.
- Strapi, Experience API, PostgreSQL, Medusa, Tryton, Redis, NATS, workers, and nginx were running
  after deployment. Health-dependent services reported healthy.

## Content delivery result

- `GET /health` returned `status=ok` and `cms_adapter=configured`.
- `GET /v1/content/app-shell?locale=en-IN&channel=b2c` returned:
  - `source=cms-strapi+governed-editorial-seed`;
  - `freshness.stale=false`;
  - layout `b2c-home` with five ordered modules;
  - stable module keys `home-hero`, `home-categories`, `home-best-deals`,
    `home-new-arrivals`, and `home-trust`;
  - “Best Deals” membership as the `power-tool-week` curated-collection reference, without price,
    stock, seller, payment, commission, or payout fields.
- The published category editorial contained one repeatable category banner.
- The B2B request returned no layout because no approved B2B layout exists; this was a clean
  omission with `stale=false`.

## Publish and webhook result

- Publishing the reviewed B2C layout made it visible through the Experience API.
- Unpublishing it removed the layout from the public response without restoring the governed seed.
- Republishing restored `b2c-home` with all five modules.
- Four signed storefront-layout webhook receipts were persisted during deployment acceptance.
- One non-revoked `storefront-layout:b2c:en-IN` projection remained active after republish.
- Repository tests cover valid and invalid HMAC signatures, replay-window rejection, duplicate event
  IDs, out-of-order suppression, unpublish revocation, confirmed absence, last-valid fallback, and
  governed-seed fallback.

## Access and secret controls

- Strapi has no Traefik/nginx edge route.
- The public customer host returned `404` for `/v1/internal/cms/webhooks` and `/admin`.
- The operator host's `/admin` path remained behind the existing operator authentication and did not
  route to Strapi.
- CMS administration is bound to VPS loopback only: `127.0.0.1:1337`, health `204`, for an SSH
  tunnel. The CMS is also attached to the private application network; only CMS joins its dedicated
  loopback-publication bridge.
- The first administrator and a read-only Content API token were created. Credential material stays
  in root-owned host files and was not committed or returned by an application endpoint.
- `cms.env`, `experience-api.env`, and the CMS administrator credential file were mode `0600`, owned
  by `root:root`.
- Staging database and CMS secrets were rotated during deployment after a diagnostic command printed
  expanded Compose configuration. All dependent services were recreated with the rotated values;
  the prior values are no longer valid. No production credential was involved.

## Backup and restore result

- The daily encrypted backup set now includes `buildkart_cms` alongside commerce, Experience API,
  and Tryton databases.
- Backup timer status: active; backup service exit status: `0`.
- CMS encrypted dump: `buildkart_cms-20261013T071337Z.dump.age`, 302,479 bytes.
- Restore proof succeeded in a throwaway database with 65 public tables; the proof database was
  dropped by the restore script's cleanup trap.
- The systemd backup service now resolves its script and Compose file through the clean release
  symlink rather than the operator's modified checkout.

## Boundaries and residual review

- All content and transactions remain staging synthetic/test data.
- CMS owns editorial labels, media, schedule, and composition only. Commerce remains authoritative
  for product membership resolution, rank, price, inventory, sellers, orders, payments, credit,
  commissions, and payouts.
- Public CMS administration remains intentionally disabled. Cloudflare Access plus final operator
  RBAC hardening is still required before considering any public admin route.
- A human must review the staged content and explicitly authorize any later production transition.
  `production_release_authorized` remains `false`.
