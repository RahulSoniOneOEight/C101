# U-003 — promotion state, before and after

- **Run:** 2026-10-27T14:29Z, staging release `1951cea`
- **Command:** `docker exec -e BUILDKART_ENVIRONMENT=staging <medusa-api> sh -lc 'cd /app/packages/api && bun run configure:staging-merchandising'`
- **Result:** exit 0; script is idempotent (a second run re-applies the same state).
- **Verbatim output:** `qc-output.txt` §1.

## Before (live read by the script, 14:29:14Z)

| Code | Status | Automatic | Mechanic | Notes |
|---|---|---|---|---|
| `FLAT5` | absent | — | — | did not exist |
| `ORDER10` | absent | — | — | did not exist; legacy `BK-STG-OFFER-ORDER10` is an inactive 5% record and was not touched |
| `PLY5` | active | **yes** | 5% items, Plywood & Boards | the only automatic offer; removal did not stick |
| `ORDER5` | active | no | 5% order | stays active (D4) |

## After (live read by the script, 14:29:15Z)

| Code | Status | Automatic | Mechanic | Campaign | Usage limit |
|---|---|---|---|---|---|
| `FLAT5` | **active** | no (store-applied) | 5% order-level, no rules | `BK-STG-CAMP-PILOT-FLAT` | 10,000 |
| `ORDER10` | **active** | no | 10% order-level, no rules | `BK-STG-CAMP-PILOT-FLAT` | 5,000 |
| `PLY5` | **inactive** | no | unchanged target/value | `BK-STG-CAMP-SITE-READY` | unchanged (200) |
| `ORDER5` | active | no | unchanged | `BK-STG-CAMP-OFFER-LAB` | unchanged (300) |

Campaign created: `BK-STG-CAMP-PILOT-FLAT` — "Pilot Flat Offers", **spend** budget
**INR 500,000**, 2026-10-01 → 2026-12-31. Live application methods:

```
FLAT5    percentage / order / 5    no rules, limit 10000
ORDER10  percentage / order / 10   no rules, limit 5000
ORDER5   percentage / order / 5    unchanged, limit 300
PLY5     percentage / items / 5    inactive, not automatic, limit 200
```

## Other promotions

The idempotent script re-applied the existing preset values for the other seeded promotions
(`TOOLS10`, `FREESHIP`, `TRADE7`, `ORDER5`, `PIPES5`, `TOOLS200`, `QTY3`, `BOGO`, `TRADEVIP`).
Their status/value/target/campaign match the pre-existing configuration; no records were created
or deleted for them. Legacy `BK-STG-*` records remain inactive.

## Forbidden writes — not performed

- No other promotion's status, value, rules or campaign was changed.
- No campaign other than creating `Pilot Flat Offers`.
- No customer cart, customer order, price list or product was modified.
- No delete of `PLY5` (status change only).
