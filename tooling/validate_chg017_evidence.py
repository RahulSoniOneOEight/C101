"""Validate the CHG-017 evidence work package without treating templates as proof."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml


ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "client-projects" / "client101" / "evidence" / "CHG-017"


def load(name: str) -> dict[str, Any]:
    value = yaml.safe_load((EVIDENCE / name).read_text(encoding="utf-8"))
    assert isinstance(value, dict), f"{name} must contain a mapping"
    assert value["change_id"] == "CHG-017"
    assert value["revision"] == 5
    return value


def main() -> None:
    register = load("evidence-register.yaml")
    providers = load("provider-capability-matrix.yaml")
    environments = load("environment-operations-plan.yaml")
    load_recovery = load("load-recovery-profile.yaml")

    allowed = set(register["allowed_statuses"])
    items = register["items"]
    assert len(items) == 21, "CHG-017 Revision 5 requires 21 evidence-register items"
    item_ids = {item["id"] for item in items}
    assert len(item_ids) == len(items), "evidence item IDs must be unique"

    accepted = 0
    for item in items:
        assert item["status"] in allowed, f"invalid status for {item['id']}"
        assert item["decisions"], f"decision mapping required for {item['id']}"
        assert item["required_roles"], f"required roles missing for {item['id']}"
        assert item["acceptance_criteria"], f"acceptance criteria missing for {item['id']}"
        if item["status"] in {"evidenced", "accepted", "not-applicable"}:
            assert item["owner"], f"owner required for {item['id']}"
            assert item["evidence_refs"], f"evidence required for {item['id']}"
        if item["status"] in {"accepted", "not-applicable"}:
            accepted += 1

    for condition, mapped_items in register["condition_mappings"].items():
        assert condition.strip()
        assert mapped_items, f"condition {condition} has no evidence mapping"
        assert set(mapped_items) <= item_ids, f"condition {condition} maps to an unknown item"

    scopes = register["scope_requirements"]
    assert set(scopes) == {
        "staging-g0", "staging-simulation-acceptance", "staging-contracts-and-access",
        "staging-checkout-integrity", "staging-order-allocation",
        "staging-accounting-reconciliation", "provider-payment-g3",
        "production-prepaid-checkout", "optional-editorial-content",
    }
    for scope, mapped_items in scopes.items():
        assert mapped_items, f"scope {scope} has no evidence requirements"
        assert set(mapped_items) <= item_ids, f"scope {scope} maps to an unknown item"
    assert "E-017-003" not in scopes["staging-g0"]
    assert scopes["provider-payment-g3"] == ["E-017-003"]
    by_id = {item["id"]: item for item in items}
    assert by_id["E-017-003"]["status"] == "planned"
    assert by_id["E-017-003"]["disposition"] == "deferred-for-staging-increment"
    assert by_id["E-017-014"]["status"] == "in-progress"
    assert by_id["E-017-015"]["status"] == "evidenced"
    assert by_id["E-017-016"]["status"] == "evidenced"

    provider_rows = providers["providers"]
    components = {row["component"] for row in provider_rows}
    required_components = {
        "medusa", "mercur", "tryton", "postgresql", "meilisearch", "identity-otp",
        "payment", "logistics", "queue-or-broker", "object-storage", "notifications",
        "editorial-cms",
    }
    assert components == required_components
    for row in provider_rows:
        assert row["status"] in allowed
        assert row["required_capabilities"]
        if row["status"] in {"evidenced", "accepted"}:
            assert row["selection"] and row["exact_version"] and row["owner"]
            assert row["evidence_refs"]
        if row["status"] == "not-applicable":
            assert not row["required"], f"required component {row['component']} cannot be excluded"
            assert (row.get("owner") or row.get("exclusion_authorized_by")), f"exclusion owner required for {row['component']}"
            assert row["evidence_refs"]

    payment = next(row for row in provider_rows if row["component"] == "payment")
    assert payment["selection"] == "Razorpay candidate"
    assert payment["status"] == "planned"
    assert payment["disposition"] == "deferred-for-staging-increment"

    environment_names = {item["name"] for item in environments["environments"]}
    assert environment_names == {"development", "ci", "integration", "staging", "production-readiness"}
    assert environments["routing_controls"]["payment_adapter_mode"] == "simulated"

    accepted_ids = {
        item["id"] for item in items if item["status"] in {"accepted", "not-applicable"}
    }
    staging_g0_evidence_complete = set(scopes["staging-g0"]) <= accepted_ids
    # G0 records governance/verification-plan approval; implementation evidence can mature later.
    assert isinstance(register["g0_ready"], bool)
    assert load_recovery["g0_ready"] is False or staging_g0_evidence_complete

    print(f"CHG-017 evidence package valid: {accepted}/{len(items)} items accepted.")
    print(f"Provider selections completed: {sum(row['status'] in {'accepted', 'not-applicable'} for row in provider_rows)}/{len(provider_rows)}")
    print(f"Staging G0 governance recorded: {'YES' if register['g0_ready'] else 'NO'}")
    print(f"Staging G0 evidence complete: {'YES' if staging_g0_evidence_complete else 'NO'}")
    print("Provider-payment G3: DEFERRED" if "E-017-003" not in accepted_ids else "Provider-payment G3 evidence: ACCEPTED")


if __name__ == "__main__":
    main()
