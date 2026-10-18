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

## Gaps closed (follow-up)

**1. The join now tolerates both vocabularies.** Banner overrides are resolved during composition,
where the commerce category list is available, so a banner keyed by `pcat_…` matches an editorial keyed
by name, handle, or id. `resolveCategoryBanners` returns the banners as stored; the adapter no longer
decides the join alone. Verified by a test that pairs a name-keyed editorial with an id-keyed banner and
expects the banner image to win.

Consequence: the CMS seed may keep writing names. A fresh database is now safe, because the seed image
still applies where no banner exists and an id-keyed banner still applies where one does.

**2. Writing a category name is rejected.** The CMS operator API validates any field marked
`commerce-category-id`:

```
POST /admin/buildkart/content  { categoryId: "Agriculture & Seeds" }
400 {"type":"invalid_data","message":"Field 'categoryId' must be a Medusa category id (for example pcat_01H...), not a name."}
```

A valid id is accepted (200). The rule covers both the banner `categoryId` and the category-editorial
`categoryId`, so the drift cannot be reintroduced from the console.

Released in `9f1f1d0` (CMS + Experience API rebuilt and recreated, proxy restarted, release pointer moved).
