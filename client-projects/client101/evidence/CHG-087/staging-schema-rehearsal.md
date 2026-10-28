# CHG-087 — Experience API schema rehearsal

Date: 2026-10-28
Database: encrypted staging backup `buildkart_experience-20261028T174232Z.dump.age` restored into `buildkart_experience_chg087_rehearsal`.

## Result

| Step | Result |
|---|---|
| Encrypted restore | PASS |
| New image `buildkart-hosted-pilot-experience-api` schema + `manual-transition-db-test` | PASS |
| Old image `buildkart-hosted-pilot-experience-api:rollback-a13bcb4` against new schema | PASS |
| Rehearsal database removed | PASS |

## Counts

| Table | Before | After |
|---|---:|---:|
| `pilot_return_case` | 4 | 4 |
| `pilot_return_line` | 4 | 4 |
| `pilot_return_event` | 10 | 10 |
| `pilot_return_refund_simulation` | absent | 0 |

## Additive schema confirmed

- `pilot_return_case.version` present with default `1`.
- `pilot_return_line.received_qty`, `condition`, `disposition`, `inspection_note`, `inspected_at`, `inspected_by` present and nullable.
- `pilot_return_refund_simulation` created with `amount_minor`, `status`, `simulation_reference` and zero rows.
- No column was dropped, renamed or narrowed.
- The old image completed its DB acceptance against the new schema, confirming backward compatibility.

The rehearsal database was dropped after execution. No rehearsal ran against shared staging.
