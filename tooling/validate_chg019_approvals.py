"""Validate CHG-019 RBAC approval evidence without granting approval."""

from __future__ import annotations

import hashlib
from collections import defaultdict
from pathlib import Path
from typing import Any

import yaml


ROOT = Path(__file__).resolve().parents[1]
CHANGE = ROOT / "client-projects" / "client101" / "changes" / "CHG-019.yaml"
LEDGER = ROOT / "client-projects" / "client101" / "changes" / "CHG-019-approvals.yaml"
PACK = ROOT / "docs" / "architecture" / "hosted-pilot-rbac-decision-pack.md"
ALLOWED = {"approved", "approved-with-amendment", "rejected", "deferred"}
PASSING = {"approved", "approved-with-amendment"}


def load(path: Path) -> dict[str, Any]:
    value = yaml.safe_load(path.read_text(encoding="utf-8"))
    assert isinstance(value, dict), f"{path} must contain a mapping"
    return value


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes().replace(b"\r\n", b"\n")).hexdigest().upper()


def main() -> None:
    change = load(CHANGE)
    ledger = load(LEDGER)
    assert change["change_id"] == ledger["change_id"] == "CHG-019"
    assert change["revision"] == ledger["decision_pack_revision"] == 1
    assert change["approval_required"] is True
    assert ledger["production_release_authorized"] is False
    assert change["decision_approval"]["production_release_authorized"] is False

    hashes = ledger["revision_hashes"]
    assert hashes["decision_pack_sha256"] == sha256(PACK), "decision-pack hash is stale"
    assert hashes["change_contract_sha256"] == sha256(CHANGE), "Change Contract hash is stale"

    required = {item["id"]: set(item["required_roles"]) for item in ledger["decisions"]}
    contract_roles = {decision: set(roles) for decision, roles in change["decision_approval_roles"].items()}
    assert required == contract_roles, "ledger and Change Contract roles differ"
    assert set(change["decisions"]) == set(required)

    outcomes: dict[str, set[str]] = defaultdict(set)
    blocking: list[str] = []
    seen: set[tuple[str, str]] = set()

    def record_outcome(decision: str, role: str, outcome: str) -> None:
        assert decision in required, f"unknown decision: {decision}"
        assert role in required[decision], f"{role} cannot approve {decision}"
        assert (decision, role) not in seen, f"duplicate approval: {decision}/{role}"
        assert outcome in ALLOWED
        seen.add((decision, role))
        if outcome in PASSING:
            outcomes[decision].add(role)
        else:
            blocking.append(f"{decision}/{role}={outcome}")

    for approval in ledger["approval_records"]:
        assert approval["revision"] == 1
        assert approval["document_sha256"] == hashes["decision_pack_sha256"]
        assert approval["change_contract_sha256"] == hashes["change_contract_sha256"]
        assert approval["approver"]["name"].strip()
        assert approval["evidence"].strip()
        assert approval["timestamp_utc"].endswith("Z")
        record_outcome(approval["decision_id"], approval["approver"]["role"], approval["outcome"])

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
        for item in batch["decision_records"]:
            decision = item["decision_id"]
            assert decision not in batch_decisions, f"duplicate batch decision: {decision}"
            batch_decisions.add(decision)
            roles = set(item["roles"])
            assert roles == required[decision], f"incomplete role set for {decision}"
            assert roles <= authorized_roles, f"approver lacks a recorded role for {decision}"
            for role in roles:
                record_outcome(decision, role, item["outcome"])
        assert batch_decisions == set(required), "batch decision scope is incomplete"

    outstanding = {
        decision: sorted(roles - outcomes[decision])
        for decision, roles in required.items()
        if roles - outcomes[decision]
    }
    passed = not outstanding and not blocking
    assert ledger["gate_status"]["G0-governance"] == ("approved" if passed else "blocked")
    assert ledger["status"] == ("approved-for-bounded-hosted-staging-rbac" if passed else "awaiting-human-review")
    assert change["decision_approval"]["runtime_implementation_authorized"] is passed
    assert change["status"] == ("bounded-hosted-staging-rbac-authorized" if passed else "proposed-awaiting-human-approval")

    print(f"CHG-019 Revision 1 ledger valid: {len(seen)} role outcomes recorded.")
    print(f"Outstanding decision/role approvals: {sum(len(roles) for roles in outstanding.values())}")
    for decision, roles in outstanding.items():
        print(f"- {decision}: {', '.join(roles)}")
    print(f"G0 governance: {'PASS' if passed else 'BLOCKED'}")


if __name__ == "__main__":
    main()
