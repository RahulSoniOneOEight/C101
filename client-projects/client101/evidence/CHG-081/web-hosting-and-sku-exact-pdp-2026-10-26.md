# Evidence - Web storefront hosting, SKU-exact PDP and Bought Together (CHG-081)

- **Change:** CHG-081
- **Date:** 2026-10-26
- **Lane / mechanism:** C / `image-rebuild` (new compose service + proxy route + edge router)
- **Design override approved:** Bought Together design Slice 5 opted the Next.js surface out in v1.
  That decision was explicitly reversed by the requester before this deployment (DEC-081-01).

---

## 1. What shipped

| Area | Change |
|---|---|
| Web app | Next.js `output: "standalone"`; new `Dockerfile` + `.dockerignore` |
| Hosting | New `web` compose service (private network, healthcheck), `PUBLIC_APP_HOSTNAME` |
| Routing | `nginx.conf.template`: `upstream web_app`, `location /` serves the app host only |
| Edge | Traefik routers `buildkart-app` / `buildkart-app-http` with the letsencrypt resolver |
| PDP | `?sku=` variant selection, SKU-exact price, variant picker |
| Checkout | Resolves the same variant the PDP quoted; label carries title, SKU and price |
| Storefront | Bought Together section on the web PDP, SKU-scoped, fail-soft |

## 2. Release

- **Release SHA:** `0e64bd3`
- **Commit range:** `ef3dac4..0e64bd3` (5 commits: `19e2c37` web feature, `426dcd3` contract,
  `0e64bd3` hosting)
- **Previous release:** `release-ef3dac4`
- **Release worktree:** `/opt/buildkart-releases/release-0e64bd3`
- **Web image:** `buildkart-hosted-pilot-web:latest` -> `45f08c8faec8` (323 MB)
- **New env key:** `PUBLIC_APP_HOSTNAME=app-staging.pinakaplay.cloud` in `services/hosted/.env` (0600)
- **Recreated:** `proxy` (labels + template). New: `web`. `medusa-api` untouched by this release.
- **Schema:** none.

## 3. Deployment order (deliberately non-atomic)

1. Build `web` image only - running stack unaffected.
2. `up -d --no-deps web`; wait for healthy; confirm it serves from inside the private network.
3. Validate the new nginx config in a throwaway container (`nginx -t`) **before** touching the live
   proxy, because a bad template or an unresolvable upstream would take api and ops down.
4. Switch the `current` symlink.
5. `--force-recreate proxy` only.

## 4. Verification (hosted, verified TLS)

| Check | Result |
|---|---|
| `web` build | PASS (85 s, 323 MB) |
| `nginx -t` on the new template | PASS (and it resolved `web:3000`) |
| Certificate | Let's Encrypt, `CN=app-staging.pinakaplay.cloud`, valid to 2027-01-24 |
| `https://app-staging.../` | **200** (previously TLS failure then **503**) |
| Home renders catalogue | PASS |
| `A` default (paired SKU) | pair section present, price 3990, variant picker present |
| `A?sku=...BI-HEX` (unpaired SKU) | pair **absent**, price 4275 - SKU exactness holds |
| `B?sku=DPN-ABS-SLSF9001S1` (paired SKU) | pair **present**, reciprocal Socket Set |
| `B` default | pair **absent** (priced variant is the unpaired one) |
| `/checkout?productId=A&sku=...BI-HEX` | 200, label carries SKU and 4275 |
| Unpaired product page | 200, no section |
| `api-staging/health` | 200 |
| `ops-staging/health`, `/dashboard/`, `/seller/` | 200 / 200 / 200 |
| `api-staging/` and `ops-staging/` root | 404 - unchanged; the storefront is app-host only |
| Containers | 12 buildkart containers, `web` and `proxy` healthy |

## 5. Requirements

| ID | Requirement | Status |
|---|---|---|
| R1 | SKU-exact product page | **PASS** |
| R2 | Checkout consistency | **PASS** |
| R3 | Bought Together on the web PDP | **PASS** |
| R4 | No silent variant choice | **PASS** |
| R5 | Hosting (service, route, certificate) | **PASS** |
| R6 | QC breadth | **PASS-WITH-GAPS** - build and runtime verified; 360 px layout and a console-error sweep were not run |

## 6. Deferred / not covered

| Item | Reason |
|---|---|
| 360 px and desktop visual QC | no browser automation in this session |
| Console-error sweep on the hosted surface | same |
| B2B channel on web | the web surface is B2C-only (CHG-081 Q4); B2B pairs will not display |
| P0-1 admin nav permission gating | separate scope (CHG-080 follow-ups) |
| P0-2 `Paired` -> open existing pair | separate scope |
| P0-3 audit before/after diff | separate scope |

## 7. Rollback

```bash
ln -sfn /opt/buildkart-releases/release-ef3dac4 /opt/buildkart-releases/current
cd /opt/buildkart-releases/release-ef3dac4/services/hosted
docker compose -f docker-compose.hosted.yml up -d --no-deps --force-recreate proxy
docker compose -f docker-compose.hosted.yml stop web
```

`release-ef3dac4` is retained and still contains the previous template, so the proxy returns to its
old behaviour. Stopping `web` is safe once the proxy no longer references the upstream. The
`buildkart-hosted-pilot-medusa:rollback-d365eba` image from the earlier release is unaffected.

## 8. Residual risks

- The app host now serves a public storefront against **staging** data with simulated payments. It is
  reachable from the internet, not only the pilot. This is a wider exposure than the previous state,
  where the host returned 503.
- The storefront has no authentication; every visitor sees the catalogue and can drive the simulated
  checkout. Orders created this way are `test_data=true` but they are real rows in staging.
- `PUBLIC_APP_HOSTNAME` is now a required compose variable. A release copied from an older `.env`
  will fail to start the proxy (`:?set` guard), which fails loudly rather than silently.
- Production remains unauthorised and untouched.
