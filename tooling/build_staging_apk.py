#!/usr/bin/env python3
"""Build a release APK pinned to the staging HTTPS endpoints.

Policy D-018-06: distribution requires a **protected release keystore**, a
non-debug APK, and Firebase App Distribution. This script refuses to build
unless the signing material and the Firebase Android config are present, and
unless the release line check passes.

Missing files (both are intentionally outside Git):
  apps/prototype_app/android/key.properties
      storeFile / storePassword / keyAlias / keyPassword for the staging key.
      Copy android/key.properties.example and point storeFile at the protected
      keystore. Never commit either file.
  apps/prototype_app/android/app/google-services.json
      firebase apps:sdkconfig android <app-id> --project buildkart-staging \
        --out apps/prototype_app/android/app/google-services.json

Usage:
    python tooling/build_staging_apk.py
    python tooling/build_staging_apk.py --build-id 293d75d --require-clean
"""

from __future__ import annotations

import argparse
import hashlib
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
APP_DIR = REPO_ROOT / "apps" / "prototype_app"
ANDROID_DIR = APP_DIR / "android"
CHECKER = Path(__file__).resolve().parent / "check_staging_release_line.py"

STAGING_DEFINES = [
    "BUILDKART_ENVIRONMENT=staging",
    "EXPERIENCE_API_BASE_URL=https://api-staging.pinakaplay.cloud",
    "MEDUSA_BASE_URL=https://api-staging.pinakaplay.cloud",
]

REQUIRED_FILES = {
    ANDROID_DIR / "key.properties": (
        "Release signing is not configured. Copy android/key.properties.example "
        "and point it at the protected staging keystore."
    ),
    ANDROID_DIR / "app" / "google-services.json": (
        "Firebase Android config is missing. Fetch it with "
        "`firebase apps:sdkconfig android <app-id> --project buildkart-staging "
        "--out apps/prototype_app/android/app/google-services.json`."
    ),
}


def flutter(*args: str) -> list[str]:
    if sys.platform.startswith("win"):
        return ["cmd", "/c", "flutter", *args]
    return ["flutter", *args]


def git_short_head() -> str:
    completed = subprocess.run(
        ["git", "rev-parse", "--short", "HEAD"],
        cwd=REPO_ROOT,
        text=True,
        capture_output=True,
        check=False,
    )
    if completed.returncode != 0:
        raise SystemExit(f"Cannot resolve HEAD: {completed.stderr.strip()}")
    return completed.stdout.strip()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--build-id",
        default=None,
        help="Value baked into the app. Defaults to the short HEAD commit.",
    )
    parser.add_argument(
        "--require-clean",
        action="store_true",
        help="Refuse to build with uncommitted changes.",
    )
    args = parser.parse_args()

    check = [sys.executable, str(CHECKER)]
    if args.require_clean:
        check.append("--require-clean")
    if subprocess.run(check, cwd=REPO_ROOT, check=False).returncode != 0:
        return 1

    missing = [path for path in REQUIRED_FILES if not path.exists()]
    if missing:
        print("BLOCKED release APK: required release material is missing.\n", file=sys.stderr)
        for path in missing:
            print(f"  - {path.relative_to(REPO_ROOT)}", file=sys.stderr)
            print(f"    {REQUIRED_FILES[path]}\n", file=sys.stderr)
        print(
            "The debug APK (flutter build apk --debug) is a smoke artifact only "
            "and must not be distributed.",
            file=sys.stderr,
        )
        return 2

    build_id = args.build_id or git_short_head()
    command = flutter(
        "build",
        "apk",
        "--release",
        *[f"--dart-define={entry}" for entry in STAGING_DEFINES],
        f"--dart-define=BUILD_ID={build_id}",
    )
    print("$ " + " ".join(command))
    if subprocess.run(command, cwd=APP_DIR, check=False).returncode != 0:
        print("FAIL flutter build apk failed.", file=sys.stderr)
        return 1

    apk = APP_DIR / "build" / "app" / "outputs" / "flutter-apk" / "app-release.apk"
    if not apk.exists():
        print(f"FAIL APK not found: {apk}", file=sys.stderr)
        return 1
    payload = apk.read_bytes()
    print("\nSTAGING RELEASE APK")
    print(f"  build_id : {build_id}")
    print(f"  apk      : {apk}")
    print(f"  bytes    : {len(payload)}")
    print(f"  sha256   : {hashlib.sha256(payload).hexdigest()}")
    print(
        "\nVerify the signer before distribution:\n"
        "  apksigner verify --print-certs <apk>\n"
        "Then distribute through Firebase App Distribution (staging project only)."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
