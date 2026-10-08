"""Validate CHG-021 hosted staging edge approval evidence. Production release is never authorized."""

from __future__ import annotations

import hashlib
from collections import defaultdict
from pathlib import Path
from typing import Any

import yaml


ROOT = Path(__file__).resolve().parents[1]
CHANGE = ROOT / "client-projects" / "client101" / "changes" / "CHG-021.yaml"
LEDGER = ROOT / "client-projects" / "client101" / "changes" / "CHG-021-approvals.yaml"
PACK = ROOT / "docs" / "architecture" / "hosted-pilot-edge-topology-decision-pack.md"
ALLOWED = {"approved", "approved-with-amendment", "rejected", "deferred"}
PASSING = {"approved", "approved-with-amendment"}

GATE_OWNER = {
    "edge-routing": "D-021-01",
    "operator-surface-protection": "D-021-02",
    "private-backend-network": "D-021-03",
}


def load(path: Path) -> dict[str, Any]:
    value = yaml.safe_load(path.read_text(encoding="utf-8"))
    assert isinstance(value, dict), f"{path} must contain a mapping"
    return value


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes().replace(b"\r\n", b"\n")).hexdigest().upper()


def main() -> None:
    change = load(CHANGE)
    ledger = load(LEDGER)
    assert change["change_id"] == ledger["change_id"] == "CHG-021"
    assert change["revision"] == ledger["decision_pack_revision"] == 1
    assert change["approval_required"] is True
    assert ledger["production_release_authorized"] is False
    assert change["production_release_authorized"] is False

    hashes = ledger["revision_hashes"]
    assert hashes["decision_pack_sha256"] == sha256(PACK), "decision-pack hash is stale"
    assert hashes["change_contract_sha256"] == sha256(CHANGE), "Change Contract hash is stale"

    required = {item["id"]: set(item["required_roles"]) for item in ledger["decisions"]}
    contract_roles = {d: set(r) for d, r in change["decision_approval_roles"].items()}
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

    def decision_state(decision: str) -> str:
        if any(item.startswith(f"{decision}/") for item in blocking):
            return "blocked"
        if required[decision] <= outcomes[decision]:
            return "approved"
        return "pending"

    outstanding = {
        decision: sorted(required[decision] - outcomes[decision])
        for decision in required
        if required[decision] - outcomes[decision]
    }
    passed = not outstanding and not blocking

    for key, owner in GATE_OWNER.items():
        status = ledger["gate_status"][key]
        assert isinstance(status, str) and status, f"gate_status[{key}] invalid"
        if passed:
            assert status.startswith("approved"), f"gate_status[{key}] should be approved"
        else:
            assert status == "blocked", f"gate_status[{key}] should be blocked"
    assert ledger["gate_status"]["production-release"] == "blocked"

    expected_ledger = "approved-for-bounded-hosted-staging-edge" if passed else "awaiting-human-review"
    expected_change = "bounded-hosted-staging-edge-authorized" if passed else "proposed-awaiting-human-approval"
    assert ledger["status"] == expected_ledger, f"ledger status should be {expected_ledger}"
    assert change["status"] == expected_change, f"Change Contract status should be {expected_change}"
    assert change["decision_approval"]["runtime_implementation_authorized"] is passed
    assert change["decision_approval"]["production_release_authorized"] is False

    print(f"CHG-021 Revision 1 ledger valid: {len(seen)} role outcomes recorded.")
    print(f"Outstanding decision/role approvals: {sum(len(r) for r in outstanding.values())}")
    print(f"Edge implementation authorized: {'YES' if passed else 'NO'}")
    print("Production release authorized: NO")


if __name__ == "__main__":
    main()
