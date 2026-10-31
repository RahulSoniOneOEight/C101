# Update note — 2026-10-31 (U-007 tile restore + U-009 delivery)

**Release line:** `293d75d` (merge of `feat/u007-product-tile-v2` into `feat/u009-pincode-delivery`)
**Live web:** https://buildkart-staging.web.app — banner `STAGING · 293d75d`
**API/DB:** unchanged from the U-009 release (`e12f6f7` images); no migration, no data change.
**Production:** untouched.

## 1. What happened

The U-009 web deploy at 15:09 IST was built from `feat/u009-pincode-delivery` at `f6a86ab`. That
branch contained the B2B commit `8482e94` but **not** the U-007 product-tile commits (`0afc77c`,
`4d2d176`), and it was built without `BUILD_ID`. Publishing it silently reverted the storefront
card to the pre-U-007 layout and changed the banner to `STAGING · dev`.

Source was never lost — only the deployed surface. `d43af6d` is an evidence-only commit from the
pre-rebase U-007 line; the code that was missing is `0afc77c` + `4d2d176`.

## 2. What was done

- `feat/u007-product-tile-v2` was already rebased onto `f6a86ab`, so the restore is a single merge:
  **`293d75d`**. No U-009 commit was reverted.
- Rebuilt the web bundle **with** `--dart-define=BUILD_ID=293d75d` and deployed to
  `buildkart-staging`.
- Re-verified the live surface after deploy.

## 3. Live web verification

| Item | Value |
|---|---|
| Banner | `STAGING · 293d75d` |
| `main.dart.js` | 3,926,843 bytes |
| SHA-256 | `ca026798bae99e34fbff8a05f2589404ca1918951e8b7577e0083691054a1156` |
| Local vs live | byte-identical |
| Tile | brand-only line, one-line title, price + `% off` on line 1, struck `MRP` line 2, wishlist 44×44 top-right, cart-plus 44×44 overlay on the image |
| Tests | `flutter analyze` clean; `flutter test` 293/293 (stale `b2b checkout` golden refreshed by U-007 `760f081`) |
| Evidence | `evidence/U-007/screenshots/live-recovered-browse.png`, `live-recovered-recommended.png` |

Note: U-007 deliberately **removes** the SKU count from the card ("Removed: seller, SKU count,
stock line, descriptor"). `homerun · 1 SKU` is the pre-U-007 `brandLine`, still used on the cart
rail's "You may also like" cards, not on the home/browse tile.

## 4. APK

### 4.1 Debug smoke APK (built, verified — not for distribution)

| Item | Value |
|---|---|
| Path | `D:\C101-control-room\artifacts\U-007-U-009\app-debug-293d75d.apk` |
| Size | 175,873,937 bytes (167.7 MB) |
| SHA-256 | `990a60ff1091eacd03b90536e24752708a6abe74b35270927ee1183e7a73a0cb` |
| Signer | `CN=Android Debug` (debug key) |
| Build id | `293d75d` (string present in `kernel_blob.bin`) |
| Endpoints | `api-staging.pinakaplay.cloud` (verified in the bundle) |
| U-007 tile | `MRP ` string present in the kernel snapshot |

This proves the merged code builds for Android with the staging defines. It is **not** a release
artifact and must not be handed to pilot testers (policy D-018-06 forbids debug distribution).

### 4.2 Release APK — blocked on signing material

`python tooling/build_staging_apk.py` exits **2** because
`apps/prototype_app/android/key.properties` (and the protected keystore it points at) is not on
this machine. That file is intentionally gitignored.

To finish the release build, the release authority supplies the keystore and then runs:

```sh
cp apps/prototype_app/android/key.properties.example \
   apps/prototype_app/android/key.properties
# fill storeFile / storePassword / keyAlias / keyPassword (keystore stays outside Git)

python tooling/check_staging_release_line.py --require-clean
python tooling/build_staging_apk.py --require-clean

# verify the signer, then distribute (staging only)
apksigner verify --print-certs build/app/outputs/flutter-apk/app-release.apk
firebase appdistribution:distribute build/app/outputs/flutter-apk/app-release.apk \
  --app 1:564417431699:android:f41fd37a7307760c5fa566 \
  --project buildkart-staging --groups pilot
```

`android/app/google-services.json` was fetched from the staging Firebase project with
`firebase apps:sdkconfig android … --project buildkart-staging`; it is gitignored and stays local.

## 5. Guardrails added so this cannot repeat

| File | Purpose |
|---|---|
| `tooling/staging_release_manifest.json` | Lists the commits that must be present before publishing (U-007 ×2, U-009 B2B). Add an entry in the same PR that introduces a must-survive change. |
| `tooling/check_staging_release_line.py` | `git merge-base --is-ancestor` for every manifest entry; `--require-clean` also blocks a dirty tree. Exit 1 on a missing change. |
| `tooling/build_staging_web.py` | Runs the check, requires/derives `BUILD_ID`, builds with the staging defines, prints bundle size + SHA-256. |
| `tooling/build_staging_apk.py` | Runs the check, refuses without `key.properties` + `google-services.json`, builds the release APK, prints size + SHA-256. |
| `docs/implementation/staging-release-line.md` | The rule, the commands, and the 2026-10-31 post-mortem. |
| `docs/architecture/backend-staging-runbook.md` | "Release line (web + APK)" section pointing at the above. |

Rule: **merge into the release line, run the checker, build through the scripts, verify the live
hash and banner after deploy.** A bundle reading `STAGING dev` was built by hand — do not publish.

## 6. Rollback

- Web: redeploy the previous bundle (`firebase hosting:rollback --project buildkart-staging`) or
  rebuild `293d75d^`. The U-007-only artifact (`04422ed`, 3,925,894 bytes) does **not** contain the
  U-009 delivery work — do not roll back to it.
- API: unchanged; the U-009 rollback (`release-186a50f` + `db:rollback --modules delivery_rates`)
  still applies if the whole delivery feature is reverted.

## 7. Open items

1. Release APK signing material (owner: release authority).
2. Bug bundle 1–5 from the U-009 review is still open (provisioning retire scope, rate-list
   pagination, bulk `rows[]` de-dupe, checkout shipping-discount line, search row + cart line
   MRP/off%). Item 5 must use U-007's `mrpIsReal` / `b2cBadges` gating.

## 8. Translucent tile controls (`dacc4f9`)

- Wishlist disc: 92% white → **55%** with a hairline border so the 44×44 target still reads on
  white packshots.
- Cart disc: 100% → **72%** through a new `CartPlusIconButton.backgroundOpacity` parameter
  (default 1.0, so B2B tiles keep the solid button).
- Glyphs stay fully opaque; hit targets and positions unchanged.
- Goldens refreshed (`home.png`, `browse.png`, ~0.9% pixel delta); `flutter test` 293/293.
- Live bundle: 3,926,936 bytes, SHA-256
  `a0989a9df942ec27b10c547cdc4beccc0395432ed231001a28083a5aa400df42`, banner `STAGING · dacc4f9`.
- Screenshots: `screenshots/live-translucent-desktop.png`, `live-translucent-mobile.png`.
