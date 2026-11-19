# Host cutover — 19 Nov 2026

## Current hosts

| Host | Service | Origin |
|---|---|---|
| `gobazarbee.com` | Next.js B2C/B2B store | `89.116.20.164` → Traefik → `buildkart-hosted-pilot-proxy-1:8080` |
| `www.gobazarbee.com` | 308 redirect | `https://gobazarbee.com/` |
| `app-staging.pinakaplay.cloud` | Flutter Web app | `89.116.20.164` → Traefik → `buildkart-flutter:80` |
| `api-staging.pinakaplay.cloud` | Experience API | unchanged |
| `ops-staging.pinakaplay.cloud` | Admin/CMS operator | unchanged |

## DNS

At Hostinger (`horizon/orbit.dns-parking.com`):

```text
gobazarbee.com               A   89.116.20.164
www.gobazarbee.com           A   89.116.20.164
app-staging.pinakaplay.cloud A   89.116.20.164
```

TXT/MX/Resend/Google verification records are unchanged.

## Next.js proxy

`/opt/buildkart-releases/current/services/hosted/.env`:

```text
PUBLIC_APP_HOSTNAME=gobazarbee.com
```

The `proxy` service was recreated with `docker compose up -d proxy`.
Traefik labels on `buildkart-hosted-pilot-proxy-1` provide the root router and
certificate; the nginx host gate now accepts `gobazarbee.com`.

## Flutter static app

Build input:

```powershell
flutter build web --release `
  --dart-define=BUILDKART_ENVIRONMENT=staging `
  --dart-define=EXPERIENCE_API_BASE_URL=https://api-staging.pinakaplay.cloud `
  --dart-define=MEDUSA_BASE_URL=https://api-staging.pinakaplay.cloud
```

Copy `apps/web/public/branding` into `build/web/branding` so the CMS image URLs
that still point at `app-staging` remain available, then extract the build to:

```text
/opt/buildkart-flutter/web
/opt/buildkart-flutter/nginx.conf
```

Container:

```sh
docker run -d --name buildkart-flutter --restart unless-stopped \
  --network coolify \
  -v /opt/buildkart-flutter/web:/usr/share/nginx/html:ro \
  -v /opt/buildkart-flutter/nginx.conf:/etc/nginx/conf.d/default.conf:ro \
  nginx:1.27-alpine
```

The Flutter nginx config provides SPA fallback and CORS for `/branding/`.

## Traefik routes

`/data/coolify/proxy/dynamic/buildkart-flutter.yaml` defines:

- `gobazarbee.com` → `buildkart-web` → `buildkart-hosted-pilot-proxy-1:8080`
- `www.gobazarbee.com` → 308 redirect to the root
- `app-staging.pinakaplay.cloud` → `buildkart-flutter:80`

## QC evidence

```text
https://gobazarbee.com        -> 200 Next.js (`Build more. Buy better.`)
https://app-staging...        -> 200 Flutter onboarding
https://www.gobazarbee.com    -> 308 Location: https://gobazarbee.com/
CORS /branding               -> Access-Control-Allow-Origin: *
Order on root domain          -> BK-261119-BSCDR4, ₹3,889.50
```

## Rollback

1. Set `PUBLIC_APP_HOSTNAME=app-staging.pinakaplay.cloud` in the hosted `.env`
   and recreate `proxy`.
2. Restore the DNS `gobazarbee.com` A record to Firebase `199.36.158.100` if
   the Flutter Web root must return to Firebase.
3. Remove `/data/coolify/proxy/dynamic/buildkart-flutter.yaml` and stop
   `buildkart-flutter` if the Flutter host is rolled back.

CMS asset URLs remain on `app-staging.pinakaplay.cloud`; the Flutter static
container serves `/branding` with CORS so the Next.js root can load them.
