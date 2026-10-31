# Staging release line — web + APK

**Status:** active rule, added 2026-10-31 after the U-007 tile overwrite.
**Applies to:** every `buildkart-staging` hosting deploy and every APK handed to a pilot tester.

## The rule

The staging web bundle and the APK are built from **one combined release line** — a commit that
contains every change that must stay live. Publishing a feature branch is only allowed when that
branch already contains the others.

`tooling/staging_release_manifest.json` lists those changes. Add an entry whenever a change must
survive future deploys:

```json
{ "label": "U-007 product tile v2", "commit": "0afc77c", "why": "…" }
```

The checker resolves each commit with `git merge-base --is-ancestor` and fails the build when one
is missing.

## Commands

```sh
# 0. The tree must contain every required change (add --require-clean before publishing)
python tooling/check_staging_release_line.py --require-clean

# 1. Web bundle — always pass or derive a BUILD_ID
python tooling/build_staging_web.py --require-clean
#    then: firebase deploy --only hosting --project buildkart-staging

# 2. Release APK — refuses without the protected keystore
python tooling/build_staging_apk.py --require-clean
#    then verify the signer and distribute through Firebase App Distribution
```

`build_staging_web.py` bakes `BUILD_ID` into the `STAGING <id>` banner and prints the bundle size
and SHA-256. A bundle that reads `STAGING dev` was built by hand without the script — do not
publish it.

## Why this exists (2026-10-31)

- The U-007 tile (commits `0afc77c`, `4d2d176`) was live on staging.
- The U-009 session built the web bundle from `feat/u009-pincode-delivery` at `f6a86ab`. That
  branch carried the B2B commit `8482e94` but **not** the U-007 commits, and the build was run
  without `BUILD_ID`.
- Publishing it reverted the storefront card to the pre-U-007 layout and changed the banner to
  `STAGING dev`. Source was never lost; only the deployed surface.
- Recovery: `feat/u007-product-tile-v2` was already rebased onto `f6a86ab`, so merging it
  (`293d75d`) restored the tile without reverting U-009; the rebuild carried
  `BUILD_ID=293d75d`.

## What "not lost" means for future updates

1. Merge the new work into the release line; never publish a branch that does not contain the
   manifest commits.
2. Run the checker before `flutter build` and before `firebase deploy`.
3. Build through the scripts so `BUILD_ID` is always set.
4. After deploying, verify the live bundle hash matches the local build:
   `Invoke-WebRequest …/main.dart.js` → SHA-256, and confirm the banner shows the expected id.
5. Add any new must-survive change to the manifest **in the same PR** that introduces it.

## APK state

- The release APK is **policy-gated** (D-018-06): protected keystore, non-debug build, Firebase
  App Distribution only.
- `apps/prototype_app/android/key.properties` and the staging keystore are not in this repository.
  Until the release authority supplies them, `build_staging_apk.py` exits 2 with the missing
  files instead of producing a silently unsigned/debug artifact.
- `android/app/google-services.json` is fetched from the `buildkart-staging` Firebase project and
  is gitignored:

  ```sh
  firebase apps:sdkconfig android 1:564417431699:android:f41fd37a7307760c5fa566 \
    --project buildkart-staging \
    --out apps/prototype_app/android/app/google-services.json
  ```
