"""Validate CHG-020 production-transition approval evidence without granting release authority.

This validator enforces two independent facts:

1. Gate decisions (D-020-01..D-020-11) and the production-release decision (D-020-12) are separate.
   Approving gates authorizes implementation and evidence only.
2. Production release is authorized only when D-020-12 is fully approved by its accountable roles
   AND every gate decision is approved for the same revision. No agent may self-authorize release.
"""

from __future__ import annotations

import hashlib
from collections import defaultdict
from pathlib import Path
from typing import Any

import yaml


ROOT = Path(__file__).resolve().parents[1]
CHANGE = ROOT / "client-projects" / "client101" / "changes" / "CHG-020.yaml"
LEDGER = ROOT / "client-projects" / "client101" / "changes" / "CHG-020-approvals.yaml"
PACK = ROOT / "docs" / "architecture" / "production-transition-decision-pack.md"
ALLOWED = {"approved", "approved-with-amendment", "rejected", "deferred"}
PASSING = {"approved", "approved-with-amendment"}
RELEASE_DECISION = "D-020-12"

# gate_status key -> owning decision
GATE_OWNER = {
    "production-environment": "D-020-01",
    "G1-identity": "D-020-02",
    "G2-cart": "D-020-04",
    "G3-order": "D-020-03",
    "G4-inventory": "D-020-05",
    "G5-logistics": "D-020-06",
    "G6-returns": "D-020-07",
    "G7-seller": "D-020-08",
    "G8-administration": "D-020-09",
    "security-privacy": "D-020-10",
    "reliability-observability": "D-020-11",
    "backup-recovery": "D-020-11",
    "accessibility": "D-020-08",
    "rollback": "D-020-11",
    "uat": RELEASE_DECISION,
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
    assert change["change_id"] == ledger["change_id"] == "CHG-020"
    assert change["revision"] == ledger["decision_pack_revision"] == 1
    assert change["approval_required"] is True

    hashes = ledger["revision_hashes"]
    assert hashes["decision_pack_sha256"] == sha256(PACK), "decision-pack hash is stale"
    assert hashes["change_contract_sha256"] == sha256(CHANGE), "Change Contract hash is stale"

    required = {item["id"]: set(item["required_roles"]) for item in ledger["decisions"]}
    contract_roles = {d: set(r) for d, r in change["decision_approval_roles"].items()}
    assert required == contract_roles, "ledger and Change Contract roles differ"
    assert set(change["decisions"]) == set(required), "decision set mismatch"
    assert set(ledger["gate_status"]) == set(GATE_OWNER) | {"production-release"}

    union_roles = set().union(*required.values())
    assert set(change["required_approvals"]) == union_roles, "required_approvals incomplete"

    release_roles = set(change["release_authorization"]["required_roles"])
    assert release_roles == required[RELEASE_DECISION], "release roles must equal D-020-12 roles"

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
    all_gates_approved = not outstanding and not blocking

    release_blocking = any(item.startswith(f"{RELEASE_DECISION}/") for item in blocking)
    release_approved = required[RELEASE_DECISION] <= outcomes[RELEASE_DECISION]
    production_release_authorized = release_approved and not release_blocking
    if production_release_authorized:
        assert all_gates_approved, "production release cannot be authorized while gates remain open"

    expected_gates: dict[str, str] = {
        key: ("pass" if decision_state(owner) == "approved" else "blocked")
        for key, owner in GATE_OWNER.items()
    }
    expected_gates["production-release"] = "authorized" if production_release_authorized else "blocked"

    for key, expected in expected_gates.items():
        assert ledger["gate_status"][key] == expected, f"gate_status[{key}] should be {expected}"

    if production_release_authorized:
        change_status = ledger_status = "production-release-authorized"
        release_status = "authorized"
    elif all_gates_approved:
        change_status = "production-transition-gates-approved"
        ledger_status = "approved-for-production-transition"
        release_status = "awaiting-release-authorization"
    else:
        change_status = "proposed-awaiting-human-approval"
        ledger_status = "awaiting-human-review"
        release_status = "not-requested"

    assert ledger["status"] == ledger_status, f"ledger status should be {ledger_status}"
    assert change["status"] == change_status, f"Change Contract status should be {change_status}"
    assert ledger["production_release_authorized"] is production_release_authorized
    assert change["production_release_authorized"] is production_release_authorized
    assert change["decision_approval"]["runtime_implementation_authorized"] is all_gates_approved
    assert change["decision_approval"]["production_release_authorized"] is production_release_authorized
    assert change["release_authorization"]["status"] == release_status
    assert ledger["release_authorization"]["status"] == release_status
    if not production_release_authorized:
        assert ledger["release_authorization"]["released_candidate"] is None

    print(f"CHG-020 Revision 1 ledger valid: {len(seen)} role outcomes recorded.")
    print(f"Outstanding decision/role approvals: {sum(len(r) for r in outstanding.values())}")
    for decision, roles in outstanding.items():
        print(f"- {decision}: {', '.join(roles)}")
    print(f"All gate decisions approved: {'YES' if all_gates_approved else 'NO'}")
    print(f"Production release authorized: {'YES' if production_release_authorized else 'NO'}")


if __name__ == "__main__":
    main()
