# Evidence — CHG-080 Bought Together SKU-level pairing

- Date: 2026-10-26
- Environment: staging only; production unauthorized
- Base release: `7a27de7`
- Code release: `711f05e` (schema + API + admin + app source)
- UI follow-ups: `355fe5d`, `d365eba` (admin list layout, thumbnails, channel health, actor label)
- Current staging release: `release-d365eba`
- Rollback: `release-7a27de7`

## Requirement results

| ID | Requirement | Status | Evidence |
|---|---|---|---|
| R1 | SKU-level storage | PASS | `variant_a_id`/`variant_b_id` persisted; `member_pair_key` unique index; active members keyed by variant |
| R2 | SKU search and selection | PASS | Admin drawer lists SKUs, marks `already paired`, disables duplicates; screenshot `bt-admin-drawer.png` |
| R3 | Admin list clarity | PASS | Counters 1/0/0/0, two thumbnails, per-channel health, Title Case, `26 Oct 2026`, Preview; screenshot `bt-admin-list.png` |
| R4 | Storefront SKU scope | PASS | paired SKU returns partner; sibling SKU returns null; app passes `sku` |
| R5 | Migration and compatibility | PASS | Additive migration applied on startup; legacy pair archived and remains readable |

## Verification

- `experience-api` `tsc --noEmit` → pass
- admin `tsc -p tsconfig.json --noEmit` → pass
- `flutter analyze` → no issues
- `bought_together_test.dart` → 2/2 pass
- Health: api/ops/dashboard/seller → 200; `medusa-api` and `experience-api` healthy

## Storefront checks (staging, B2C)

| Product | SKU | Result |
|---|---|---|
| Socket Set | `BAUM-237S1-SET-HEX` | pair `btp_710026…`, paired Pendant `variant_01M59JHKXQS9VJM4KHXHD7AWN0` |
| Socket Set | `BAUM-237S1-SET-BI-HEX` | no pair (section hidden) |
| Pendant | `DPN-ABS-SLSF9001S1` | pair `btp_710026…`, paired Socket Set `variant_01M59JHKJY5V256TMSGAWZV633` |
| Pendant | `DPN-ABS-SLS9001S1` | no pair (section hidden) |

## Data migration

- Legacy product-level pair `btp_caba4b93855046d1981b88524343095f` → `archived`
- New SKU pair `btp_710026edf43347c9a92bed32f58a7eba`, channel `b2c`, status `active`, health `ready`
- Reason for B2C only: the Pendant SKU has no B2B trade price (`b2b_configured=false`); the new activation rule refuses B2B
- Backup before migration: `/root/staging-experience-pre-sku-20261026-*.dump`

## Deferred

- **Flutter app release**: source now sends `?sku=` (`711f05e`), but the staging app bundle was not rebuilt in this bundle. Until it is, the app's PDP calls without `sku` and the SKU pair is not shown there. Admin is fully live.
- **B2B trade price**: configure `buildkart_b2b_pricing` for the Pendant SKU if the pair should be B2B.
- **Archived legacy row**: retained for audit; it appears under “All statuses” and is excluded from the Active counter.

## Residual risks

- The Experience API migration is additive but runs at startup; a failed start would fall back to `7a27de7`.
- Staging postgres is recreated by compose during deploy (data persisted on the volume).
- Production remains blocked on human authorization.
