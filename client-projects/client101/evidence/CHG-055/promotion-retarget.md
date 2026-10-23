# CHG-055 — promotions retargeted to the live catalogue

## Short code set

| Code | Offer | Target | Verified |
|---|---|---|---|
| `ORDER5` | 5% off the order | any cart | ✅ ₹199.50 on ₹3,990 |
| `FREESHIP` | free shipping at ≥ ₹10,000 | shipping method | ✅ ₹99 → ₹0 |
| `TOOLS10` | 10% off | Sockets & Drive Tools | ✅ ₹399 |
| `TOOLS200` | ₹200 off | Pliers & Cutters | ✅ ₹200 |
| `PIPES5` | 5% off above ₹15,000 | Pipes & Tanks | ✅ ₹1,113.75 |
| `QTY3` | 5% off lines of 3+ | General Building Materials | ✅ ₹169.52 |
| `BOGO` | buy 2 get 1 free | Adhesives | ✅ one unit free (₹432) |
| `PLY5` | 5% off, automatic | Plywood & Boards | ✅ ₹170.52, no code |
| `TRADE7` | 7% off | Basin Mixers & Taps, B2B Trade Customers | ⚠ not eligible |
| `TRADEVIP` | free shipping | B2B Trade Customers | ⚠ not eligible |

All promotions are `active`, marketplace-funded, and within the 10% ceiling.

## Why the two trade codes do not apply

The rule targets `customer.groups.id`. A cart created by the BFF is not
associated with a Medusa customer, so the group rule cannot resolve and the
engine rejects the code as `not_eligible`. This is an integration gap (cart →
customer association), not a category or group-membership problem: the
`B2B Trade Customers` group has four members and is now the target group.

## Old codes

The ten previous long codes (`BK-STG-*`) were set to **inactive**, not deleted,
so their redemption history is retained. A cart attempting one now receives
`not_found`.

## Implementation

- Presets updated in `presets.ts` and `offer-patterns.ts`.
- The governed idempotent script `configure:staging-merchandising` was run in
  `medusa-api` after copying the two updated files into the running container.
- Campaign membership updated to the new codes.
- No seller link created.

## Checkout follow-up

The same deployment makes checkout identity-based:

- Contact is a read-only card showing the signed-in name, email and phone.
- Email and phone are no longer asked for at checkout.
- The saved default address is preselected with **Change**.
- Untouched demo address names are aligned to the signed-in profile once.

## Staging only

Production remains unauthorized.
