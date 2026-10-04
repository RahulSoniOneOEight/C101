"""Validate CHG-017 approval evidence and report G0 coverage without granting approval."""

from __future__ import annotations

import hashlib
from collections import defaultdict
from pathlib import Path
from typing import Any

import yaml


ROOT = Path(__file__).resolve().parents[1]
CHANGE = ROOT / "client-projects" / "client101" / "changes" / "CHG-017.yaml"
LEDGER = ROOT / "client-projects" / "client101" / "changes" / "CHG-017-approvals.yaml"
PACK = ROOT / "docs" / "architecture" / "backend-first-slice-decision-pack.md"
ALLOWED_OUTCOMES = {"approved", "approved-with-amendment", "rejected", "deferred"}
PASSING_OUTCOMES = {"approved", "approved-with-amendment"}


def load(path: Path) -> dict[str, Any]:
    value = yaml.safe_load(path.read_text(encoding="utf-8"))
    assert isinstance(value, dict), f"{path} must contain a mapping"
    return value


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest().upper()


def main() -> None:
    change = load(CHANGE)
    ledger = load(LEDGER)

    assert change["change_id"] == ledger["change_id"] == "CHG-017"
    current_revision = change["revision"]
    assert current_revision == ledger["decision_pack_revision"] == 5

    hashes = ledger["revision_hashes"]
    assert hashes["decision_pack_sha256"] == sha256(PACK), "decision-pack hash is stale"
    assert hashes["change_contract_sha256"] == sha256(CHANGE), "Change Contract hash is stale"

    baseline_hashes = {
        item["revision"]: {
            "decision_pack_sha256": item["decision_pack_sha256"],
            "change_contract_sha256": item["change_contract_sha256"],
        }
        for item in ledger.get("revision_history", [])
    }
    baseline_hashes[current_revision] = hashes

    required_by_decision = {
        item["id"]: set(item["required_roles"]) for item in ledger["decisions"]
    }
    contract_roles = {
        decision: set(roles)
        for decision, roles in change["decision_approval_roles"].items()
    }
    assert required_by_decision == contract_roles, "ledger and Change Contract roles differ"
    assert len(required_by_decision) == 24

    outcomes_by_revision: dict[int, dict[str, list[dict[str, Any]]]] = defaultdict(
        lambda: defaultdict(list)
    )
    seen: set[tuple[int, str, str]] = set()
    for record in ledger["approval_records"]:
        decision = record["decision_id"]
        role = record["approver"]["role"]
        assert decision in required_by_decision, f"unknown decision: {decision}"
        assert role in required_by_decision[decision], f"{role} cannot approve {decision}"
        revision = record["revision"]
        assert revision in baseline_hashes, f"unknown approval revision: {revision}"
        key = (revision, decision, role)
        assert key not in seen, f"duplicate approval for revision {revision} {decision}/{role}"
        seen.add(key)
        assert record["outcome"] in ALLOWED_OUTCOMES
        assert record["document_sha256"] == baseline_hashes[revision]["decision_pack_sha256"]
        assert record["change_contract_sha256"] == baseline_hashes[revision]["change_contract_sha256"]
        assert record["approver"]["name"].strip()
        assert record["evidence"].strip()
        assert record["timestamp_utc"].endswith("Z")
        if record["outcome"] == "approved-with-amendment":
            assert record["amendments"], f"{decision} amendment text is required"
            assert record["amendment_status"] == f"incorporated-in-revision-{revision}"
        outcomes_by_revision[revision][decision].append(
            {
                "role": role,
                "outcome": record["outcome"],
                "unresolved_conditions": record.get("unresolved_conditions", []),
            }
        )

    batch_decision_count = 0
    for batch in ledger.get("batch_approval_records", []):
        revision = batch["revision"]
        assert revision in baseline_hashes, f"unknown batch revision: {revision}"
        assert batch["document_sha256"] == baseline_hashes[revision]["decision_pack_sha256"]
        assert batch["change_contract_sha256"] == baseline_hashes[revision]["change_contract_sha256"]
        assert batch["approver"].strip()
        assert batch["authorization_evidence"].strip()
        assert batch["evidence"].strip()
        assert batch["timestamp_utc"].endswith("Z")
        authorized_roles = set(batch["authorized_roles"])
        transition = batch.get("governance_transition")
        if transition:
            assert transition["decision_id"] == "D-017-22"
            assert transition["from_revision"] == 3
            assert transition["outcome"] == "approved-with-amendment"
            assert set(transition["approving_roles"]) == authorized_roles

        batch_decisions: set[str] = set()
        for record in batch["decision_records"]:
            decision = record["decision_id"]
            assert decision in required_by_decision, f"unknown batch decision: {decision}"
            assert decision not in batch_decisions, f"duplicate batch decision: {decision}"
            batch_decisions.add(decision)
            roles = set(record["roles"])
            assert roles == required_by_decision[decision], f"incomplete role set for {decision}"
            assert roles <= authorized_roles, f"approver lacks a recorded role for {decision}"
            assert record["outcome"] in ALLOWED_OUTCOMES
            if record["outcome"] == "approved-with-amendment":
                assert record["amendments"], f"{decision} amendment text is required"
                assert record["amendment_status"] == f"incorporated-in-revision-{revision}"
            for role in roles:
                key = (revision, decision, role)
                assert key not in seen, f"duplicate approval for revision {revision} {decision}/{role}"
                seen.add(key)
                outcomes_by_revision[revision][decision].append(
                    {
                        "role": role,
                        "outcome": record["outcome"],
                        "unresolved_conditions": record.get("unresolved_conditions", []),
                    }
                )
        scope = ledger["current_revision_approval_scope"]
        expected_decisions = (
            set(required_by_decision)
            if revision == scope["inherited_revision"]
            else set(scope["affected_decisions"])
        )
        assert batch_decisions == expected_decisions, "batch decision scope is incomplete"
        if revision == current_revision:
            batch_decision_count += len(batch_decisions)

    scope = ledger["current_revision_approval_scope"]
    inherited_revision = scope["inherited_revision"]
    inherited_decisions = set(scope["inherited_decisions"])
    affected_decisions = set(scope["affected_decisions"])
    assert inherited_decisions.isdisjoint(affected_decisions)
    assert inherited_decisions | affected_decisions == set(required_by_decision)
    assert change["decision_approval"]["inherited_revision"] == inherited_revision
    assert set(change["decision_approval"]["inherited_decisions"]) == inherited_decisions
    assert set(change["decision_approval"]["affected_decisions"]) == affected_decisions

    current_outcomes: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for decision in inherited_decisions:
        current_outcomes[decision].extend(outcomes_by_revision[inherited_revision][decision])
    for decision in affected_decisions:
        current_outcomes[decision].extend(outcomes_by_revision[current_revision][decision])

    outstanding: dict[str, list[str]] = {}
    blocking_outcomes: list[str] = []
    unresolved_conditions: set[str] = set()
    for decision, required_roles in required_by_decision.items():
        records = current_outcomes[decision]
        approved_roles = {
            record["role"]
            for record in records
            if record["outcome"] in PASSING_OUTCOMES
        }
        missing = sorted(required_roles - approved_roles)
        if missing:
            outstanding[decision] = missing
        for record in records:
            if record["outcome"] in {"rejected", "deferred"}:
                blocking_outcomes.append(
                    f"{decision}/{record['role']}={record['outcome']}"
                )
            for condition in record.get("unresolved_conditions", []):
                unresolved_conditions.add(f"{decision}: {condition}")

    provider_details = change.get("unresolved_provider_and_environment_details", [])
    g0_pass = not (
        outstanding or blocking_outcomes or unresolved_conditions or provider_details
    )
    expected_gate = "passed" if g0_pass else "blocked"
    assert ledger["gate_status"]["G0-governance"] == expected_gate
    assert ledger["production_release_authorized"] is False
    expected_status = (
        "all-required-decision-role-outcomes-recorded"
        if not outstanding
        else "affected-role-approval-pending"
    )
    assert change["decision_approval"]["status"] == expected_status
    assert change["decision_approval"]["g0_status"] == expected_gate
    assert change["decision_approval"]["runtime_implementation_authorized"] is True
    assert change["decision_approval"]["runtime_scope"] == "functional-local-staging-only"
    runtime_authorizations = ledger.get("runtime_authorizations", [])
    assert len(runtime_authorizations) == 1
    assert runtime_authorizations[0]["scope"] == "functional-local-staging-only"
    assert "production-release" in runtime_authorizations[0]["prohibited"]
    assert change["decision_approval"]["production_release_authorized"] is False

    current_role_approvals = sum(len(records) for records in current_outcomes.values())
    inherited_role_approvals = sum(
        len(current_outcomes[decision]) for decision in inherited_decisions
    )
    print(
        f"CHG-017 Revision {current_revision} ledger valid: "
        f"{len(inherited_decisions)} inherited decisions/{inherited_role_approvals} inherited role approvals; "
        f"{batch_decision_count} affected decision outcomes; {current_role_approvals} effective role approvals."
    )
    print(f"Outstanding decision/role approvals: {sum(len(v) for v in outstanding.values())}")
    for decision, roles in outstanding.items():
        print(f"- {decision}: {', '.join(roles)}")
    print(f"Unresolved recorded conditions: {len(unresolved_conditions)}")
    print(f"Missing provider/environment records: {len(provider_details)}")
    for detail in provider_details:
        print(f"- {detail}")
    print(f"G0 governance: {'PASS' if g0_pass else 'BLOCKED'}")


if __name__ == "__main__":
    main()
