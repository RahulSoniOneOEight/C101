#!/usr/bin/env bash
#
# Build a signed staging APK and (optionally) distribute it to the pilot group.
#
# Run from apps/prototype_app:
#   tool/release_apk.sh                     # build + verify only
#   tool/release_apk.sh --distribute        # build + verify + App Distribution
#
# Required local inputs (never commit them):
#   android/key.properties                  release signing config
#   <keystore path from key.properties>     protected release keystore
#   android/app/google-services.json        Firebase client config for the Android app
#
# The Gradle build fails closed when release signing is absent, so this script
# only adds the preflight checks, artifact identity and the distribution step.
set -euo pipefail

APP_ID="1:564417431699:android:f41fd37a7307760c5fa566"
TESTER_GROUP="hosted-pilot"
EXPERIENCE_API="${EXPERIENCE_API_BASE_URL:-https://api-staging.pinakaplay.cloud}"
MEDUSA_API="${MEDUSA_BASE_URL:-https://api-staging.pinakaplay.cloud}"
DISTRIBUTE=0
[ "${1:-}" = "--distribute" ] && DISTRIBUTE=1

fail() { echo "error: $*" >&2; exit 1; }

[ -f android/key.properties ] || fail "android/key.properties is missing (release signing is not configured)"
[ -f android/app/google-services.json ] || fail "android/app/google-services.json is missing"
grep -q '^storeFile=' android/key.properties || fail "key.properties has no storeFile"
STORE_FILE="$(sed -n 's/^storeFile=//p' android/key.properties | tr -d '\r')"
[ -f "$STORE_FILE" ] || fail "keystore not found at $STORE_FILE"

VERSION="$(sed -n 's/^version:[[:space:]]*//p' pubspec.yaml | tr -d '\r')"
BUILD_ID="${BUILD_ID:-$(git rev-parse --short HEAD)}"
OUT="build/app/outputs/flutter-apk/app-release.apk"

echo "version : $VERSION"
echo "build id: $BUILD_ID"
echo "api     : $EXPERIENCE_API"

flutter build apk --release \
  --dart-define=BUILDKART_ENVIRONMENT=staging \
  --dart-define=EXPERIENCE_API_BASE_URL="$EXPERIENCE_API" \
  --dart-define=MEDUSA_BASE_URL="$MEDUSA_API" \
  --dart-define=BUILD_ID="$BUILD_ID"

[ -f "$OUT" ] || fail "release APK was not produced"
SIZE="$(wc -c < "$OUT" | tr -d ' ')"
hash_file() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | awk '{print $1}'
  elif command -v openssl >/dev/null 2>&1; then openssl dgst -sha256 "$1" | awk '{print $NF}'
  else echo "unavailable"
  fi
}
SHA="$(hash_file "$OUT")"

echo
echo "apk    : $OUT"
echo "bytes  : $SIZE"
echo "sha256 : $SHA"
echo "install: adb install -r $OUT"

if [ "$DISTRIBUTE" -eq 1 ]; then
  echo
  echo "distributing to $TESTER_GROUP ..."
  firebase appdistribution:distribute "$OUT" \
    --app "$APP_ID" \
    --groups "$TESTER_GROUP" \
    --release-notes "$VERSION · staging · $BUILD_ID · sha256 ${SHA:0:16}"
  echo "distribution complete"
else
  echo
  echo "not distributed (pass --distribute to upload to $TESTER_GROUP)"
fi
