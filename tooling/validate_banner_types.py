#!/usr/bin/env python3
"""Fail when the console and delivery copies of the banner type registry diverge.

The console (`apps/admin`) and the delivery adapter (`services/experience-api`) are built from
different Docker contexts with no shared source root, so the banner type list is mirrored rather than
imported. This check is what makes the mirror safe: a placement added, renamed, or re-channelled on
one side without the other fails the build instead of silently producing a banner type that nothing
renders, or a rendered surface with no way to author it.

Compared per placement: channel, surface, requiresCategory and label.
The console-only `rendered` flag is intentionally not compared; it records which consumer is wired up.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

DELIVERY_REGISTRY = Path("services/experience-api/src/content/placement-registry.ts")
CONSOLE_REGISTRY = Path(
    "services/backend/apps/admin/src/routes/content/banner-studio/banner-model.ts"
)


def object_blocks(text: str, start_marker: str) -> list[str]:
    """Return the `{...}` blocks inside the array literal that follows `start_marker`."""
    try:
        start = text.index(start_marker)
    except ValueError:
        raise SystemExit(f"could not find {start_marker!r}")
    try:
        end = text.index("];", start)
    except ValueError:
        raise SystemExit(f"could not find the end of the array after {start_marker!r}")
    return re.findall(r"\{([^{}]*)\}", text[start:end], re.DOTALL)


def field(block: str, name: str, required: bool = True) -> str | None:
    match = re.search(rf'\b{name}\s*:\s*"([^"]*)"', block)
    if match:
        return match.group(1)
    match = re.search(rf"\b{name}\s*:\s*(true|false)", block)
    if match:
        return match.group(1)
    if required:
        raise SystemExit(f"missing {name!r} in block:\n{block.strip()}")
    return None


def delivery_types() -> dict[str, dict[str, str]]:
    text = DELIVERY_REGISTRY.read_text(encoding="utf-8")
    result: dict[str, dict[str, str]] = {}
    for block in object_blocks(text, "const BANNER_TYPES"):
        placement = field(block, "placement")
        result[placement] = {
            "channel": field(block, "channel"),
            "surface": field(block, "surface"),
            "requiresCategory": field(block, "requiresCategory"),
            "label": field(block, "label"),
        }
    return result


def console_types() -> dict[str, dict[str, str]]:
    text = CONSOLE_REGISTRY.read_text(encoding="utf-8")
    result: dict[str, dict[str, str]] = {}
    for block in object_blocks(text, "const SUPPORTED_PLACEMENTS"):
        value = field(block, "value")
        result[value] = {
            "channel": field(block, "channel"),
            "surface": field(block, "surface"),
            "requiresCategory": field(block, "requiresCategory"),
            "label": field(block, "label"),
        }
    return result


def main() -> int:
    delivery = delivery_types()
    console = console_types()

    problems: list[str] = []

    for placement in sorted(set(delivery) - set(console)):
        problems.append(f"{placement}: defined for delivery but not offered in the console")
    for placement in sorted(set(console) - set(delivery)):
        problems.append(f"{placement}: offered in the console but unknown to delivery")
    for placement in sorted(set(delivery) & set(console)):
        for attribute in ("channel", "surface", "requiresCategory", "label"):
            if delivery[placement][attribute] != console[placement][attribute]:
                problems.append(
                    f"{placement}: {attribute} differs — "
                    f"delivery={delivery[placement][attribute]!r} console={console[placement][attribute]!r}"
                )

    if problems:
        print("Banner type registry divergence:", file=sys.stderr)
        for problem in problems:
            print(f"  - {problem}", file=sys.stderr)
        print(
            f"\n{len(delivery)} delivery types, {len(console)} console types. "
            "Update both files together.",
            file=sys.stderr,
        )
        return 1

    print(f"banner type registry: {len(delivery)} types aligned between console and delivery")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
