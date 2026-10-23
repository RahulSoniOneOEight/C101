#!/usr/bin/env python3
"""Fail when the console and delivery copies of the layout section registry diverge.

The console (`apps/admin`) and the delivery adapter (`services/experience-api`) build from different
Docker contexts with no shared source root, so the layout section registry is mirrored rather than
imported. This check makes the mirror safe: a placement added, renamed or re-channelled on one side
without the other fails the build, instead of producing a section an operator can configure but the
storefront will never render — or a rendered placement with no way to author it.

Compared per placement: label, channel, source, acceptsBanner and the declared child placements.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

DELIVERY_REGISTRY = Path("services/experience-api/src/content/layout-sections.ts")
CONSOLE_REGISTRY = Path(
    "services/backend/apps/admin/src/routes/content/layout-section-model.ts"
)


def object_blocks(text: str, start_marker: str) -> list[str]:
    try:
        start = text.index(start_marker)
    except ValueError:
        raise SystemExit(f"could not find {start_marker!r}")
    try:
        end = text.index("];", start)
    except ValueError:
        raise SystemExit(f"could not find the end of the array after {start_marker!r}")
    return re.findall(r"\{([^{}]*)\}", text[start:end], re.DOTALL)


def scalar(block: str, name: str) -> str | None:
    match = re.search(rf'\b{name}\s*:\s*"([^"]*)"', block)
    if match:
        return match.group(1)
    match = re.search(rf"\b{name}\s*:\s*(true|false)", block)
    if match:
        return match.group(1)
    return None


def children(block: str) -> tuple[str, ...]:
    match = re.search(r"\bchildren\s*:\s*\[([^\]]*)\]", block)
    if not match:
        return ()
    return tuple(re.findall(r'"([^"]+)"', match.group(1)))


def parse(path: Path, start_marker: str, placement_key: str) -> dict[str, dict[str, object]]:
    text = path.read_text(encoding="utf-8")
    result: dict[str, dict[str, object]] = {}
    for block in object_blocks(text, start_marker):
        placement = scalar(block, placement_key)
        if not placement:
            raise SystemExit(f"{path}: a registry entry has no placement")
        result[placement] = {
            "label": scalar(block, "label"),
            "channel": scalar(block, "channel"),
            "source": scalar(block, "source"),
            "acceptsBanner": scalar(block, "acceptsBanner"),
            "children": children(block),
        }
    return result


def main() -> int:
    delivery = parse(DELIVERY_REGISTRY, "const LAYOUT_SECTION_TYPES", "placement")
    console = parse(CONSOLE_REGISTRY, "const LAYOUT_SECTION_TYPES", "placement")

    problems: list[str] = []

    for placement in sorted(set(delivery) - set(console)):
        problems.append(f"{placement}: rendered by delivery but not offered in the console")
    for placement in sorted(set(console) - set(delivery)):
        problems.append(f"{placement}: offered in the console but unknown to delivery")
    for placement in sorted(set(delivery) & set(console)):
        for attribute in ("label", "channel", "source", "acceptsBanner", "children"):
            if delivery[placement][attribute] != console[placement][attribute]:
                problems.append(
                    f"{placement}: {attribute} differs — "
                    f"delivery={delivery[placement][attribute]!r} console={console[placement][attribute]!r}"
                )

    if problems:
        print("Layout section registry divergence:", file=sys.stderr)
        for problem in problems:
            print(f"  - {problem}", file=sys.stderr)
        print(
            f"\n{len(delivery)} delivery placements, {len(console)} console placements. "
            "Update both files together.",
            file=sys.stderr,
        )
        return 1

    print(f"layout section registry: {len(delivery)} placements aligned between console and delivery")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
