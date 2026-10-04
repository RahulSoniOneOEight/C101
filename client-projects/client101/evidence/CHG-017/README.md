# CHG-017 Capability Evidence Work Package

This package collects the evidence required to close CHG-017 Revision 5 conditions. It does not
select a provider, prove a capability, authorise runtime implementation or authorise production.

## Contents

- `evidence-register.yaml` — authoritative evidence-item status and decision mapping.
- `provider-capability-matrix.yaml` — exact provider/version selections and capability references.
- `environment-operations-plan.yaml` — environment, secrets, observability and on-call ownership.
- `load-recovery-profile.yaml` — load, concurrency, RPO, RTO and restore-proof inputs.
- `capability-test-plan.md` — provider-neutral tests for reservation, payment, identity and logistics.

## Evidence lifecycle

`missing → planned → in-progress → evidenced → accepted`

Use `not-applicable` only with a named approver, rationale and evidence that the dependency is outside
the bounded slice. Selection names, versions and owners must not be inferred. Secrets, credentials,
customer data and production payloads must never be stored here.

An item may move to `evidenced` only when its evidence references are durable and reviewable. It may
move to `accepted` only after the listed accountable roles record acceptance. Close approval-ledger
conditions through append-only closure records; do not edit historical approvals.

## Validation

```sh
python tooling/validate_chg017_evidence.py
```

Revision 5 uses scope-specific readiness. E-017-003 remains required for provider-payment G3 and
production but is non-blocking only for the proposed staging-simulator G0 scope. E-017-014 proves
simulation behavior and never substitutes for financial-provider evidence.
