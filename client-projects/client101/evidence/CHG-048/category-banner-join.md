# Category banners were not reaching B2C

**Found:** 2026-10-18 · **Fixed:** data canonicalised to commerce category ids

## Symptom

The Agriculture category banner was edited in the console to the new artwork (`40354071`), but the
**B2C** presentation still served the old governed seed image (`265216`). B2B served the new one.

## Cause

Two records describe one category image, and they were keyed differently:

| Record | Key used | Example |
|---|---|---|
| Category editorial (per channel) | Category **name** | `Agriculture & Seeds` |
| Category banner (per placement) | Commerce **id** | `pcat_01M4EC9BNMNB7AW5Z293YVRWJW` |

`resolveCategoryEditorials` joins them with exact string equality
(`bannersByCategory.get(mapped.category_id)`). A named editorial can never match an id-keyed banner, so
**every B2C category banner override was silently ignored** and the seed image was served instead.

B2B only appeared correct by accident: its banner rows had also been created with category **names**, so
name matched name.

Why the keys drifted: `services/cms/src/presentation-seed.ts` seeds every category editorial with
`categoryId: "<category name>"`, while banners authored in the console pick a real category and therefore
store a `pcat_…` id.

## Fix applied (staging data)

- 12 category editorials re-keyed from names to commerce ids (published).
- 11 category banner records normalised to commerce ids (published).

No code or app deploy was required: the join is exact-match and the keys are now canonical.

## Verified

All six categories now deliver the image held on their banner record, on both channels:

| Category | Image (both B2C and B2B) |
|---|---|
| Agriculture & Seeds | `40354071` |
| Electrical | `257736` |
| Tiles & Plywood | `276724` |
| Bathroom & Plumbing | `2062426` |
| Building & Construction | `1216589` |
| Pumps & Machines | `175709` |

## Still open

- **The seed still writes names** (`presentation-seed.ts`). A fresh database would recreate label-keyed
  editorials, and any id-keyed category banner would silently stop applying. Fixing that properly needs
  the seed to resolve commerce ids at runtime, or the join to accept both vocabularies.
- **No guard prevents a non-id `categoryId`.** A validation rule on the banner and editorial write paths
  would make this class of defect impossible.
