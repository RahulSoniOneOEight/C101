# CHG-035 — delivery capture and returns (Commit 1: contracts)

**Environment:** staging contract baseline only

**Runtime:** not started; Experience API, Medusa, Mercur and Tryton are untouched by this commit.

**Production:** unauthorized

## Scope completed

This is **Commit 1 only**, as required by `BuildKart-Delivery-Returns-Implementation-Note.md`.

| Artefact | Change |
|---|---|
| `CHG-017.yaml` | Revision 7; adds shipment-event, delivery-evidence and Phase 1 return entities/events/tests; inherits prior decision outcomes |
| `CHG-035.yaml` | New contract for delivery capture and returns, with commits 1–8, constraints, open decisions and required tests |
| `CHG-017-approvals.yaml` | Revision 7 hashes; revision 6 marked superseded; effective outcomes remain inherited from revisions 4 and 6 |
| `contracts/data-contract.yaml` | Revision 7; shipment-event, delivery-evidence and return entities added; shipment evidence notes updated |
| `contracts/asyncapi/buildkart-events-v1.yaml` | `return.requested.v1`, `return.decision.v1`, `return.status-changed.v1`; 25 channels total |
| `derived/dependency-map.yaml` | Revision 7 note plus allocation-to-booking, delivery-evidence and return-notification flows |
| `docs/architecture/rule-registry.yaml` | `return_eligibility` promoted to commercial, 7-day window, delivery required |
| `tooling/validate_contracts.py` | Contract revision assertion updated to 7 |
| `tooling/validate_chg017_approvals.py` | Supports the revision-7 inherited-outcome model and historical batch scopes |

## Validator output

```text
Contract validation passed: 38 experience paths, 1 merchandising paths,
1 merchandising offer paths, 25 event channels, 12 fixtures.

Rule registry valid: 59 rules across 4 categories.
- fixture-backed: 2
- hardcoded-in-flutter: 6
- new-capability: 26
- pending-approval: 11
- provider-supported: 14

CHG-017 Revision 7 ledger valid: 19 inherited decisions/51 inherited role approvals;
0 affected decision outcomes; 67 effective role approvals.
Outstanding decision/role approvals: 0
Unresolved recorded conditions: 11
Missing provider/environment records: 18
G0 governance: PASS

CHG-017 evidence package valid: 7/21 items accepted.
Staging G0 evidence complete: NO
Provider-payment G3: DEFERRED
```

The missing provider/environment evidence is unchanged from the existing CHG-017 baseline and does
not authorize runtime or production.

## Corrections applied

- The validator no longer asserts revision 5; it asserts revision 7.
- The approvals ledger has a real revision-7 entry and revision-6 history rather than a silent edit.
- Revision 7 adds no new required decision roles; it inherits the previously recorded outcomes.
  The five affected decisions are sourced from revision 6, while the other nineteen come from
  revision 4.
- `return_eligibility` already existed as a journey rule. It was upgraded in place instead of
  creating a duplicate key.
- Three return event channels were added without changing the existing shipment or order channels.

## Open decisions

From the implementation note and `CHG-035`:

| ID | Decision | Proposed | Blocks |
|---|---|---|---|
| OD-035-01 | Final return window and reason/category matrix | 7 days; damaged, wrong item, not as described | Runtime eligibility |
| OD-035-02 | Evidence upload versus reference-only | Reference-only in Phase 1 | Return evidence UI/storage |
| OD-035-03 | Return approver roles | `support_operator`, `marketplace_operator`; `super_admin` override | Admin decision authorization |
| OD-035-04 | Whether an approved return changes the order stage | No; return status is separate | App/order projection |

## Next gate

Do not start Commit 2 until the validator output is reviewed. The next implementation commit is the
durable shipment store and `LogisticsProvider` interface, with no routes.
