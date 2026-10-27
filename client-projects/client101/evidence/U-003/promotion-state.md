# U-003 — promotion state, before and after

The governed script prints the live read for `FLAT5`, `ORDER10`, `PLY5` and `ORDER5` on both sides
of the apply:

```text
U-003 PROMO_STATE before {...}
U-003 PROMO_STATE after  {...}
```

Command (staging, after the deploy gate):

```sh
docker exec <medusa-api-container> bun run src/scripts/configure-staging-merchandising.ts
```

Capture the two `U-003 PROMO_STATE` lines verbatim into `qc-output.txt`. The script is
idempotent: a second run must produce an identical `after` state and create no duplicate
promotion or campaign.

## Before (read-only U-003 QC, 2026-10-27T12:52Z, release 33c6add)

| Code | Status | Automatic | Mechanic | Notes |
|---|---|---|---|---|
| `FLAT5` | absent | — | — | did not exist |
| `ORDER10` | absent | — | — | did not exist; `BK-STG-OFFER-ORDER10` is an inactive 5% legacy record and is not touched |
| `PLY5` | active | yes | 5% items, Plywood & Boards | the only automatic offer; removal did not stick |
| `ORDER5` | active | no | 5% order | stays active (D4) |

## After (declared by this bundle; runtime line pending)

| Code | Status | Automatic | Mechanic | Campaign | Usage limit |
|---|---|---|---|---|---|
| `FLAT5` | active | no (store-applied) | 5% order-level, no rule | `BK-STG-CAMP-PILOT-FLAT` | 10,000 |
| `ORDER10` | active | no | 10% order-level, no rule | `BK-STG-CAMP-PILOT-FLAT` | 5,000 |
| `PLY5` | **inactive** | no | unchanged target/value | `BK-STG-CAMP-SITE-READY` | unchanged |
| `ORDER5` | active | no | unchanged | `BK-STG-CAMP-OFFER-LAB` | unchanged |

Campaign added: `BK-STG-CAMP-PILOT-FLAT` — "Pilot Flat Offers", spend budget INR 500,000,
2026-10-01 → 2026-12-31.

## Forbidden writes (verified by the script's scope)

- No other promotion's status, value, rules or campaign.
- No campaign other than creating/updating `Pilot Flat Offers`.
- No customer cart, customer order, price list or product.
- No delete of `PLY5` (status change only).
