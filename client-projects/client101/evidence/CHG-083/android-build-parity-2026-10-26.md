# Evidence — Android build parity with the web storefront (CHG-083)

- **Date:** 2026-10-26
- **Environment:** staging only; production untouched and unauthorized
- **Lane / mechanism:** A (build/version tooling) + device QC; `image-rebuild` not required
- **Blocked deliverable:** signed release APK distribution (release keystore unavailable)

## 1. Request

Bring the installed Android app up to the same feature set as the current web storefront
(`76e1063` / API `9868236`) and verify it on a device.

## 2. What the previously distributed APK contained

Artifact `buildkart.apk` (Desktop, 62,291,051 bytes, SHA-256
`4c1b5db6f8c9b7b6a84a04ca66851bd757e11a4db59b2aff3eb98bd50dc1bf9a`), which matches the
distributed-build record.

| Property | Value |
|---|---|
| Version | `0.3.0 (15)` (unchanged since the 9 Oct build) |
| Package / label | `com.buildkart.prototype_app` / "BuildKart Staging" |
| Signing | release cert `CN=BuildKart Staging, OU=Hosted Pilot` (v2 scheme) |
| API target | `api-staging.pinakaplay.cloud` |
| Badge | `STAGING · dev` — `BUILD_ID` was never passed |

String audit of `lib/arm64-v8a/libapp.so`:

| String | Old APK | New QC APK |
|---|---|---|
| `Bought together` | **absent** | present |
| `Recommended with this item` | absent | present |
| `Payment confirmed` | present | absent |
| `Simulated payment authorized` | absent | present |
| `Order total` | absent | present |

So the old build had **no Bought Together at all** and pre-dated the order-read-model work.

## 3. Feature parity check

The app has only three platform conditionals, all Firebase Messaging (Android-only), so no web
feature is hidden on Android:

- `lib/main.dart:21` — FCM background handler on Android
- `lib/notifications/push_notification_coordinator.dart:32,64` — push registration/permission

## 4. Implementation

| Change | Detail |
|---|---|
| Version | `pubspec.yaml` `0.3.0+15` → `0.4.0+16` |
| Release tooling | `apps/prototype_app/tool/release_apk.sh` — preflights signing, Google Services config and keystore; builds with staging defines; prints size/SHA-256; optional `--distribute` to `hosted-pilot` |
| Config hygiene | `android/.gitignore` now excludes `google-services.json` |
| Build identity | `--dart-define=BUILD_ID=<commit>` baked into the staging badge |

`google-services.json` is not committed. It was reconstructed from the Firebase client values already
compiled into the distributed APK (`google_app_id`, `google_api_key`, `project_id`,
`gcm_defaultSenderId`, `google_storage_bucket`) and remains local.

## 5. Gates

| Check | Result |
|---|---|
| `flutter analyze` | PASS — no issues |
| `flutter test` | PASS — 283/283 |
| Release build without `key.properties` | **fails closed**: "Release signing is not configured…" |
| `bash -n tool/release_apk.sh` | PASS |
| Script preflight without signing config | PASS — refuses with a clear message |

## 6. Device QC (Android emulator `medium_phone`, 1080×2400, Android 16 image)

QC build: debug APK from commit `43b1c60`, `0.4.0+16`, staging endpoints, `BUILD_ID=9868236`
(175,847,369 bytes, SHA-256 `ebdf9f342669f8c746569709973c7f67247ff22266f130c04713de7df6a906b4`).

| Check | Result |
|---|---|
| Launch + staging badge | PASS — `STAGING · 9868236` |
| Onboarding | PASS |
| Pilot OTP login (`rsoni001@gmail.com` / `123456`) | PASS |
| Home storefront (search, categories, flash deals, nav) | PASS |
| Search → SKU-exact PDP (`SKU BAUM-237S1-SET-HEX`, ₹3990) | PASS |
| **Bought together** on paired SKU, pairing with *1 Light Diamond Cut Pendant* | PASS |
| My Orders list — `BK-261026-DBNYWC`, `BK-261026-RHMF98`, totals ₹4089 | PASS |
| Order detail — Items ₹3990 · Shipping ₹99 · Order total ₹4089, tracking `SIM-C5573B0D4F4F` | PASS |
| Android notification-permission prompt after login | PASS |
| Crashes during QC | none observed (one emulator GPU failure with the software renderer, not an app crash) |

Screenshots: `screenshots/android-*.png`.

## 7. Distribution state

| Item | Value |
|---|---|
| Channel | Firebase App Distribution, project `buildkart-staging` |
| App | `1:564417431699:android:f41fd37a7307760c5fa566` ("BuildKart Android Staging") |
| Group | `hosted-pilot` — 7 testers, 14 releases |
| Last real distribution | `0.3.0 (15)` (recorded build, 25 Oct) |
| Guest hosting channel | `buildkart-apk` preview channel returns 404 for every path — empty leftover, expires 2026-11-01 |

## 8. Blocker

A signed, distributable APK cannot be produced in this environment: neither this machine nor the
staging host holds `android/key.properties` or the release keystore, and the repo deliberately has
none. The guard is correct and was verified to fail closed.

To finish: place `android/key.properties` and the keystore where the build runs, then

```bash
cd apps/prototype_app
BUILD_ID=$(git rev-parse --short HEAD) tool/release_apk.sh --distribute
```

That produces `0.4.0 (16)`, prints its SHA-256, and uploads it to `hosted-pilot`.

Distributing the debug-signed QC APK was deliberately **not** done: it would break the update path
for the seven testers (signature mismatch), forcing an uninstall.

## 9. Residual risks

- Version was not bumped between the 9 Oct and 25 Oct builds, so those releases were indistinguishable
  in App Distribution. `0.4.0+16` restores monotonic versioning; every future release must bump it.
- Testers on `0.3.0 (15)` are missing Bought Together and the order fixes until a signed `0.4.0`
  reaches them.
- The empty `buildkart-apk` hosting channel should be deleted to leave one distribution path.
