"""Negative tests for the CHG-020 validator's release guards.

Proves two safety properties:

A. Approving only the production-release decision (D-020-12) while the gate decisions remain open
   is rejected — a release cannot be authorized before its gates pass.
B. Explicitly rejecting the production-release decision keeps production unauthorized.

Run: python tooling/test_chg020_validator.py
"""

from __future__ import annotations

import contextlib
import copy
import importlib.util
import io
import tempfile
from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parents[1]
VALIDATOR = ROOT / "tooling" / "validate_chg020_approvals.py"
CHANGE = ROOT / "client-projects" / "client101" / "changes" / "CHG-020.yaml"
LEDGER = ROOT / "client-projects" / "client101" / "changes" / "CHG-020-approvals.yaml"
PACK = ROOT / "docs" / "architecture" / "production-transition-decision-pack.md"


def load_module():
    spec = importlib.util.spec_from_file_location("validate_chg020", VALIDATOR)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def approval(ledger: dict, decision: str, role: str, outcome: str) -> dict:
    hashes = ledger["revision_hashes"]
    return {
        "decision_id": decision,
        "approver": {"name": "Test Reviewer", "role": role},
        "outcome": outcome,
        "evidence": "Negative-test fixture; not a real approval.",
        "timestamp_utc": "2026-10-08T00:00:00Z",
        "revision": 1,
        "document_sha256": hashes["decision_pack_sha256"],
        "change_contract_sha256": hashes["change_contract_sha256"],
    }


def run_validator(module, ledger: dict) -> tuple[bool, str]:
    with tempfile.TemporaryDirectory() as tmp:
        tmp_change = Path(tmp) / "CHG-020.yaml"
        tmp_pack = Path(tmp) / "pack.md"
        tmp_ledger = Path(tmp) / "ledger.yaml"
        tmp_change.write_bytes(CHANGE.read_bytes())
        tmp_pack.write_bytes(PACK.read_bytes())
        tmp_ledger.write_text(yaml.safe_dump(ledger), encoding="utf-8")
        module.CHANGE = tmp_change
        module.LEDGER = tmp_ledger
        module.PACK = tmp_pack
        buffer = io.StringIO()
        try:
            with contextlib.redirect_stdout(buffer):
                module.main()
        except AssertionError as error:
            return False, str(error)
        return True, buffer.getvalue()


def main() -> None:
    module = load_module()
    base = yaml.safe_load(LEDGER.read_text(encoding="utf-8"))

    # Case A: only the release decision approved while gates remain open -> must be rejected.
    case_a = copy.deepcopy(base)
    case_a["approval_records"] = [
        approval(base, "D-020-12", role, "approved")
        for role in ["release-authority", "executive-sponsor", "security"]
    ]
    ok, message = run_validator(module, case_a)
    assert not ok, "validator accepted a release before gates passed"
    assert "gates remain open" in message, f"unexpected failure: {message}"
    print("PASS A: release approved ahead of gates is rejected.")

    # Case B: release decision explicitly rejected -> stays unauthorized, ledger remains valid.
    case_b = copy.deepcopy(base)
    case_b["approval_records"] = [approval(base, "D-020-12", "release-authority", "rejected")]
    ok, output = run_validator(module, case_b)
    assert ok, f"validator rejected an explicit release denial: {output}"
    assert "Production release authorized: NO" in output
    print("PASS B: rejected release decision keeps production unauthorized.")

    print("PASS: CHG-020 release guards hold.")


if __name__ == "__main__":
    main()
