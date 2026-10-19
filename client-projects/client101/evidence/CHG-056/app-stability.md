# CHG-056 — app link stability review

## Diagnostics

Checked the live link and API on 2026-10-19.

| Check | Result |
|---|---|
| `https://buildkart-staging.web.app/` | 200, `cache-control: no-store` |
| `main.dart.js` | 200, `no-store`, fresh ETag |
| `flutter_service_worker.js` | 200, stub; no service worker registered |
| Three fresh page loads | 3/3 catalogue rendered |
| Console errors across those loads | none |
| Failed requests across those loads | none |
| API `products?catalogue_import=CHG-049` × 5 | 200 each, 233 products, 0.77–1.43 s |
| API `app-shell` × 5 | 200 each, ~60 ms |
| Gateway logs (3 h) | 19 × 502, all at **15:13:36**, during a planned container restart |

Conclusion: the app is not consistently broken. The visible instability coincides
with redeploy/restart windows (brief 502s) and with tabs holding an older bundle.

## Hardening

- **Transient retry**: presentation, product list/detail, cart read and shipping
  options retry up to three times on a network error or 502/503/504, with a
  short backoff. A restart blip no longer turns the catalogue into an error page.
- **Build marker**: the staging strip now shows `STAGING · <short commit>`, so a
  stale tab is identifiable at a glance.

## Verification

| Check | Result |
|---|---|
| `flutter analyze` | pass |
| `flutter test --exclude-tags golden` | 192 tests pass |
| Build id visible | pending deployment check |
| Repeated loads after deploy | pending deployment check |

## Notes

- Deployments still cause a short single-instance gap while containers restart.
  QC should reload after a release; the strip's build id confirms the new build.
- Opening the base URL without a session shows onboarding by design; the signed-in
  landing route is decided after session restore.
