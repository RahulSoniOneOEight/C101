"""Validate the BuildKart configurable rule registry without treating it as approved truth."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml


ROOT = Path(__file__).resolve().parents[1]
REGISTRY = ROOT / "docs" / "architecture" / "rule-registry.yaml"

ALLOWED_TYPES = {"collection", "commercial", "journey", "operational"}
ALLOWED_STATUSES = {
    "provider-supported",
    "hardcoded-in-flutter",
    "fixture-backed",
    "new-capability",
    "pending-approval",
}
REQUIRED_FIELDS = {
    "rule_key",
    "rule_type",
    "owner",
    "trigger",
    "scope",
    "priority",
    "fallback",
    "status",
}
RULE_CATEGORIES = ["collection_rules", "commercial_rules", "journey_rules", "operational_rules"]


def main() -> None:
    registry = yaml.safe_load(REGISTRY.read_text(encoding="utf-8"))
    assert isinstance(registry, dict), "registry must be a mapping"
    assert registry["schema_version"] == 1
    assert registry["status"] == "proposed"

    seen_keys: set[str] = set()
    total = 0
    for category in RULE_CATEGORIES:
        assert category in registry, f"missing category: {category}"
        rules = registry[category]
        assert isinstance(rules, list), f"{category} must be a list"
        for rule in rules:
            assert isinstance(rule, dict), f"{category} contains a non-mapping rule"
            missing = REQUIRED_FIELDS - set(rule)
            assert not missing, f"rule missing fields {missing}: {rule.get('rule_key')}"
            assert rule["rule_type"] in ALLOWED_TYPES, f"bad rule_type: {rule.get('rule_key')}"
            assert rule["status"] in ALLOWED_STATUSES, f"bad status: {rule.get('rule_key')}"
            assert rule["priority"] > 0, f"priority must be positive: {rule.get('rule_key')}"
            assert isinstance(rule["scope"], list) and rule["scope"], f"scope required: {rule.get('rule_key')}"
            assert rule["rule_key"] not in seen_keys, f"duplicate rule_key: {rule['rule_key']}"
            seen_keys.add(rule["rule_key"])
            total += 1

    status_counts: dict[str, int] = {}
    for category in RULE_CATEGORIES:
        for rule in registry[category]:
            status_counts[rule["status"]] = status_counts.get(rule["status"], 0) + 1

    print(f"Rule registry valid: {total} rules across {len(RULE_CATEGORIES)} categories.")
    for status, count in sorted(status_counts.items()):
        print(f"- {status}: {count}")
    assert registry["status"] == "proposed", "registry must remain proposed until approved"


if __name__ == "__main__":
    main()
