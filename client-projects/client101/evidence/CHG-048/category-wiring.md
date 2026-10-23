# CHG-048 — B2B home categories come from the backend

**Status:** implemented and released to staging.

## What was wrong

The trade rail, its chips and the catalogue filter used a local six-category fixture with ids
(`plumbing`, `electricals`, …). Category presentation in the admin console could not change them, and
products could not be filtered by a commerce category because they carried fixture ids.

## Mapping applied to the catalogue fixtures

| Fixture group | Commerce category id | Console label |
|---|---|---|
| plumbing, sanitary | `pcat_01M4EC9BNHH212X5V13Z055DDR` | Bathroom & Plumbing |
| electricals | `pcat_01M4EC9BNKHP80XAET6X0BV6MT` | Electrical |
| paints | `pcat_01M4EC9BNG9AVFBH8RAN8MDP0V` | Building & Construction |
| hardware | `pcat_01M4EC9BNM9X603HVQBQ93J969` | Pumps & Machines |
| agri | `pcat_01M4EC9BNMNB7AW5Z293YVRWJW` | Agriculture & Seeds |

`Tiles & Plywood` (`pcat_01M4EC9BNJPR8T0YQCBC8W4XFJ`) has no fixture products yet; it will appear in
the rail with an empty result until products are tagged for it.

Two consequences to review:

- **Bathroom & Plumbing now aggregates** the old `plumbing` and `sanitary` products, because the CMS has
  one category for both. That is the honest commerce model, but the rail shows fewer, larger groups.
- Category labels are shared by channel: a rename done for B2B also changes B2C, since there is no
  per-channel label field.

## How it works now

- `tradeCategoryOptionsProvider` reads `b2bPresentationProvider` categories: id, label, icon and order.
- The rail, the catalogue chips and the procurement-list filter all consume that provider and filter by
  `product.categoryId == category.id`.
- The local fixture list survives only as a fallback when presentation is unavailable (offline, CMS
  down), and its ids were retagged to the commerce ids so filtering stays correct in that state.

## Verification

- New provider tests: CMS label/id reach the rail; fallback still works; catalogue products are tagged
  with ids the rail knows.
- `flutter analyze` clean; full suite **182 tests** pass; goldens regenerated.
- Browser check on staging: the trade rail now shows the console's category names and order.
