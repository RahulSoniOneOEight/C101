# U-013 / B006 — price units: closeout

- **Lane / release:** B / `image-rebuild` (medusa admin + vendor) + data repair
- **Base:** `3d2bdff` · **Branch:** `fix/u013-price-units` · **Worktree:** `D:\C101-worktrees\bk-u013-price-units`
- **Status:** code fixed, image built (`679ca5cc5a0c`) — **not deployed**; the iPhone data repair is
  **waiting for confirmation** of ₹1,85,000 / ₹1,95,000.
- **Scope:** admin + vendor studio form, one unit spec, allowlisted data repair. No schema, no API
  contract change, no other product touched.

## 1. Root cause (confirmed in code)

`saveB2c` in both `studio-form.tsx` files computed `baseMinor = Math.round(base * 100)` but then sent
`amount: Number(base)` and `amount: Number(tier.amount)` — major units — into an endpoint that
documents **minor units** (`packages/api/src/lib/offer-pricing.ts`, `minorToMajor` at the Medusa
boundary). The bulk list/GST path had the same defect, and the response (minor) was stored straight
back into the editor.

## 2. What changed

| File | Change |
|---|---|
| `apps/admin/src/routes/product-studio/studio-form.tsx` | `saveB2c` sends `baseMinor` and `Math.round(tier.amount * 100)`; non-INR prices converted too; response `amount / 100`; bulk path sends/receives minor; `priceUnitWarning()` + `window.confirm` when selling < 10% of list |
| `apps/vendor/src/routes/product-studio/studio-form.tsx` | byte-identical copy of the same fix (parity) |
| `packages/api/src/lib/__tests__/offer-pricing-units.unit.spec.ts` | round-trip ₹1,85,000 / tier ₹1,70,000 / list ₹2,00,000, the exact 1/100 slip, and a source contract for both forms |

No change was needed in `offer-pricing.ts` — the API boundary was already correct.

## 3. Requirement ledger

| ID | Requirement | Status | Proof |
|---|---|---|---|
| R1 | ₹1,85,000 base → 18,500,000 minor → DB 185000 | **PASS-CODE** | payload `amount: baseMinor`; local contract run; DB check after deploy |
| R2 | Tier ₹1,70,000 → 17,000,000 minor → DB 170000 | **PASS-CODE** | `Math.round(Number(tier.amount) * 100)`; order/limits unchanged |
| R3 | List price stays `list_price_minor` | **PASS** | `list_price_minor: listMinor` untouched |
| R4 | Reload shows the entered values; no unit flip | **PASS-CODE** | pricing response converted `Number(price.amount) / 100` before `onSaved` |
| R5 | <10% guard asks before saving | **PASS-CODE** | `priceUnitWarning()` + `window.confirm`; automated widget test **DEFERRED** (admin/vendor have no test runner) |
| R6 | Regression test for base + tier + 1/100 | **PASS-CODE** | spec added; locally executed as a dependency-free source/arithmetic check (no `node_modules` in the worktree) |
| R7 | Vendor has the same fix and tests | **PASS** | files byte-identical; both covered by the spec |
| R8 | IPHONE 17 repaired | **BLOCKED** | waiting for value confirmation; DB currently 1850 / 1950 major |
| R9 | No schema; other paths audited | **PASS** | bulk path fixed; B2B already used `* 100`; no migration |
| R10 | Typecheck, lint, builds | **PASS** | Docker image build compiled admin + vendor + api (`Frontend build completed successfully`, `serves 2 panel(s)`) |

Local check output: 24/24 assertions PASS (`baseMinor`, tiers, response conversion, guard, bulk, and
the 1/100 arithmetic).

## 4. Data repair — awaiting confirmation

Current staging rows (read-only check, 2026-11-01):

| SKU | Offer | `price.amount` (major) | list_price_minor | Storefront |
|---|---|---|---|---|
| APPLE IPHONE BLACK | `offer_01M699CZV1BC462AZQ4T0THYBT` | **1850** | 20,000,000 | ₹1,850 |
| APPLE IPHONE WHITE | `offer_01M699CZV13PKKMJ3CQZ3F8EBD` | **1950** | 20,000,000 | ₹1,950 |

Proposed repair (exactly ×100, matching the brief's black ₹1,85,000 / white ₹1,95,000):

| SKU | New `price.amount` | Storefront |
|---|---|---|
| BLACK | **185000** | ₹1,85,000 |
| WHITE | **195000** | ₹1,95,000 |

Backup: the two `price` rows and the two `offer.metadata` rows are dumped before the write; no other
record is touched.

## 5. Deploy plan (not executed)

1. `docker compose up -d --no-deps medusa-api medusa-worker` from `release-u013-0be813c47`
   (image `679ca5cc5a0c`), health check, admin/vendor panel load.
2. Apply the two-row price repair, verify DB + public product payload.
3. Spot-check the studio save: enter ₹1,85,000 → reload → storefront ₹1,85,000.

Rollback: previous image `c1021b0b0be1` (`release-9003721`); data rollback = restore the two rows
from the backup.
