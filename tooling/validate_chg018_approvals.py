"""Validate CHG-018 approval evidence without granting approval."""

from __future__ import annotations

import hashlib
from collections import defaultdict
from pathlib import Path
from typing import Any

import yaml


ROOT = Path(__file__).resolve().parents[1]
CHANGE = ROOT / "client-projects" / "client101" / "changes" / "CHG-018.yaml"
LEDGER = ROOT / "client-projects" / "client101" / "changes" / "CHG-018-approvals.yaml"
PACK = ROOT / "docs" / "architecture" / "hosted-pilot-decision-pack.md"
ALLOWED_OUTCOMES = {"approved", "approved-with-amendment", "rejected", "deferred"}
PASSING_OUTCOMES = {"approved", "approved-with-amendment"}


def load(path: Path) -> dict[str, Any]:
    value = yaml.safe_load(path.read_text(encoding="utf-8"))
    assert isinstance(value, dict), f"{path} must contain a mapping"
    return value


def sha256(path: Path) -> str:
    data = path.read_bytes().replace(b"\r\n", b"\n")
    return hashlib.sha256(data).hexdigest().upper()


def main() -> None:
    change = load(CHANGE)
    ledger = load(LEDGER)

    assert change["change_id"] == ledger["change_id"] == "CHG-018"
    assert change["revision"] == ledger["decision_pack_revision"] == 1
    assert change["approval_required"] is True
    assert change["decision_approval"]["production_release_authorized"] is False
    assert ledger["production_release_authorized"] is False

    hashes = ledger["revision_hashes"]
    assert hashes["decision_pack_sha256"] == sha256(PACK), "decision-pack hash is stale"
    assert hashes["change_contract_sha256"] == sha256(CHANGE), "Change Contract hash is stale"

    required_by_decision = {
        item["id"]: set(item["required_roles"]) for item in ledger["decisions"]
    }
    contract_roles = {
        decision: set(roles)
        for decision, roles in change["decision_approval_roles"].items()
    }
    assert required_by_decision == contract_roles, "ledger and Change Contract roles differ"
    assert set(change["decisions"]) == set(required_by_decision)

    outcomes: dict[str, set[str]] = defaultdict(set)
    blocking: list[str] = []
    seen: set[tuple[str, str]] = set()
    for record in ledger["approval_records"]:
        decision = record["decision_id"]
        role = record["approver"]["role"]
        assert decision in required_by_decision, f"unknown decision: {decision}"
        assert role in required_by_decision[decision], f"{role} cannot approve {decision}"
        assert (decision, role) not in seen, f"duplicate approval: {decision}/{role}"
        seen.add((decision, role))
        assert record["outcome"] in ALLOWED_OUTCOMES
        assert record["revision"] == 1
        assert record["document_sha256"] == hashes["decision_pack_sha256"]
        assert record["change_contract_sha256"] == hashes["change_contract_sha256"]
        assert record["approver"]["name"].strip()
        assert record["evidence"].strip()
        assert record["timestamp_utc"].endswith("Z")
        if record["outcome"] == "approved-with-amendment":
            assert record["amendments"], f"{decision} amendment text is required"
            assert record["amendment_status"] == "incorporated-in-revision-1"
        if record["outcome"] in PASSING_OUTCOMES:
            outcomes[decision].add(role)
        else:
            blocking.append(f"{decision}/{role}={record['outcome']}")

    for batch in ledger.get("batch_approval_records", []):
        assert batch["revision"] == 1
        assert batch["document_sha256"] == hashes["decision_pack_sha256"]
        assert batch["change_contract_sha256"] == hashes["change_contract_sha256"]
        assert batch["approver"].strip()
        assert batch["authorization_evidence"].strip()
        assert batch["evidence"].strip()
        assert batch["timestamp_utc"].endswith("Z")
        authorized_roles = set(batch["authorized_roles"])
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
            for role in roles:
                assert (decision, role) not in seen, f"duplicate approval: {decision}/{role}"
                seen.add((decision, role))
                if record["outcome"] in PASSING_OUTCOMES:
                    outcomes[decision].add(role)
                else:
                    blocking.append(f"{decision}/{role}={record['outcome']}")
        assert batch_decisions == set(required_by_decision), "batch decision scope is incomplete"

    outstanding = {
        decision: sorted(roles - outcomes[decision])
        for decision, roles in required_by_decision.items()
        if roles - outcomes[decision]
    }
    g0_pass = not outstanding and not blocking
    expected_gate = "approved" if g0_pass else "blocked"
    assert ledger["gate_status"]["G0-governance"] == expected_gate

    expected_status = "approved-for-bounded-hosted-staging" if g0_pass else "awaiting-human-review"
    assert ledger["status"] == expected_status
    assert change["decision_approval"]["runtime_implementation_authorized"] is g0_pass
    expected_change_status = "bounded-hosted-staging-authorized" if g0_pass else "proposed-awaiting-human-approval"
    assert change["status"] == expected_change_status

    print(f"CHG-018 Revision 1 ledger valid: {len(seen)} role outcomes recorded.")
    print(f"Outstanding decision/role approvals: {sum(len(roles) for roles in outstanding.values())}")
    for decision, roles in outstanding.items():
        print(f"- {decision}: {', '.join(roles)}")
    print(f"G0 governance: {'PASS' if g0_pass else 'BLOCKED'}")


if __name__ == "__main__":
    main()
