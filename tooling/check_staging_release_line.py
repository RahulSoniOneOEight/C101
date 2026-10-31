#!/usr/bin/env python3
"""Fail a staging build/deploy when a required change is missing from the tree.

The 2026-10-31 incident: the web bundle was built from a branch that carried the
U-009 B2B fix but not the U-007 product tile, so publishing it silently reverted
the tile that was already live. The fix is a release line: every publish must be
built from a commit that contains all the changes listed in
`tooling/staging_release_manifest.json`.

Usage:
    python tooling/check_staging_release_line.py
    python tooling/check_staging_release_line.py --ref origin/feat/u009-pincode-delivery
    python tooling/check_staging_release_line.py --require-clean --json

Exit codes:
    0  every required commit is an ancestor of --ref (and the tree is clean when asked)
    1  a required change is missing, or the tree is dirty
    2  the manifest or git repository could not be read
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

MANIFEST = Path(__file__).resolve().parent / "staging_release_manifest.json"
REPO_ROOT = Path(__file__).resolve().parent.parent


def run_git(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", *args],
        cwd=REPO_ROOT,
        text=True,
        capture_output=True,
        check=False,
    )


def is_ancestor(commit: str, ref: str) -> bool:
    completed = run_git("merge-base", "--is-ancestor", commit, ref)
    if completed.returncode not in (0, 1):
        raise RuntimeError(
            f"git merge-base failed for {commit}..{ref}: "
            f"{completed.stderr.strip() or completed.stdout.strip()}"
        )
    return completed.returncode == 0


def load_manifest() -> list[dict[str, str]]:
    try:
        payload = json.loads(MANIFEST.read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        raise SystemExit(f"Manifest not found: {MANIFEST}") from error
    except json.JSONDecodeError as error:
        raise SystemExit(f"Manifest is not valid JSON: {error}") from error

    required = payload.get("required")
    if not isinstance(required, list) or not required:
        raise SystemExit("Manifest must contain a non-empty 'required' list.")
    for entry in required:
        if not isinstance(entry, dict) or not entry.get("commit"):
            raise SystemExit(f"Invalid manifest entry: {entry!r}")
    return required


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--ref",
        default="HEAD",
        help="Commit or ref to test (default: HEAD).",
    )
    parser.add_argument(
        "--require-clean",
        action="store_true",
        help="Also fail when the working tree has uncommitted changes.",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Emit a machine-readable summary.",
    )
    args = parser.parse_args()

    required = load_manifest()

    head = run_git("rev-parse", "--short", args.ref)
    if head.returncode != 0:
        print(f"FAIL cannot resolve {args.ref}: {head.stderr.strip()}", file=sys.stderr)
        return 2
    head_short = head.stdout.strip()

    results: list[dict[str, object]] = []
    missing: list[dict[str, str]] = []
    for entry in required:
        commit = str(entry["commit"])
        present = is_ancestor(commit, args.ref)
        results.append(
            {
                "label": entry.get("label", commit),
                "commit": commit,
                "present": present,
            }
        )
        if not present:
            missing.append(entry)

    dirty = bool(run_git("status", "--porcelain").stdout.strip())

    if args.json:
        print(
            json.dumps(
                {
                    "ref": args.ref,
                    "head": head_short,
                    "clean": not dirty,
                    "required": results,
                    "ok": not missing and not (args.require_clean and dirty),
                },
                indent=2,
            )
        )
    else:
        print(f"Release line check for {args.ref} ({head_short})")
        for row in results:
            status = "PASS" if row["present"] else "FAIL"
            print(f"  {status}  {row['label']}  ({row['commit']})")
        if args.require_clean:
            print(f"  {'PASS' if not dirty else 'FAIL'}  working tree clean")

    if missing:
        print(
            "\nRefusing to release: the tree is missing required changes. "
            "Merge them before building.",
            file=sys.stderr,
        )
        for entry in missing:
            print(
                f"  - {entry.get('label', entry['commit'])} ({entry['commit']}): "
                f"{entry.get('why', 'required change')}",
                file=sys.stderr,
            )
        return 1

    if args.require_clean and dirty:
        print(
            "\nRefusing to release: the working tree has uncommitted changes.",
            file=sys.stderr,
        )
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
