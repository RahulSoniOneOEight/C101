#!/usr/bin/env python3
"""Build the staging web bundle from a verified release line.

Refuses to build when:
  - a required change from tooling/staging_release_manifest.json is missing;
  - no BUILD_ID is supplied (pass --build-id or commit the tree first).

The BUILD_ID is baked into the staging banner (`STAGING <id>`) so a stale tab or
an older cached bundle is obvious. The 2026-10-31 overwrite shipped without it
and read `STAGING dev`.

Usage:
    python tooling/build_staging_web.py
    python tooling/build_staging_web.py --build-id 293d75d --require-clean
"""

from __future__ import annotations

import argparse
import hashlib
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
APP_DIR = REPO_ROOT / "apps" / "prototype_app"
CHECKER = Path(__file__).resolve().parent / "check_staging_release_line.py"

STAGING_DEFINES = [
    "BUILDKART_ENVIRONMENT=staging",
    "EXPERIENCE_API_BASE_URL=https://api-staging.pinakaplay.cloud",
    "MEDUSA_BASE_URL=https://api-staging.pinakaplay.cloud",
]


def flutter(*args: str) -> list[str]:
    # Windows resolves `flutter` to flutter.bat, which CreateProcess cannot run
    # directly without a shell.
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
        help="Value for the staging banner. Defaults to the short HEAD commit.",
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

    build_id = args.build_id or git_short_head()
    if not build_id.strip():
        print("FAIL a non-empty --build-id is required.", file=sys.stderr)
        return 1

    command = flutter(
        "build",
        "web",
        "--release",
        *[f"--dart-define={entry}" for entry in STAGING_DEFINES],
        f"--dart-define=BUILD_ID={build_id}",
    )
    print("$ " + " ".join(command))
    if subprocess.run(command, cwd=APP_DIR, check=False).returncode != 0:
        print("FAIL flutter build web failed.", file=sys.stderr)
        return 1

    bundle = APP_DIR / "build" / "web" / "main.dart.js"
    if not bundle.exists():
        print(f"FAIL bundle not found: {bundle}", file=sys.stderr)
        return 1
    payload = bundle.read_bytes()
    print("\nSTAGING WEB BUILD")
    print(f"  build_id : {build_id}")
    print(f"  bundle   : {bundle}")
    print(f"  bytes    : {len(payload)}")
    print(f"  sha256   : {hashlib.sha256(payload).hexdigest()}")
    print("\nDeploy with: firebase deploy --only hosting --project buildkart-staging")
    return 0


if __name__ == "__main__":
    sys.exit(main())
