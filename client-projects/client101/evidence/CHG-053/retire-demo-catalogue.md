# CHG-053 — retire the pre-import demo catalogue

## Outcome

The staging store now serves **only the updated catalogue**: 233 product cards
with 500 SKUs. The 52 pre-import demonstration products are archived.

Archiving, not deleting: each product is `status = draft`, so the rows, offers,
images and metadata remain for rollback. No imported product, offer, price, tag
or image was changed.

## Change

```sql
UPDATE product
   SET status = 'draft', updated_at = now()
 WHERE deleted_at IS NULL
   AND status = 'published'
   AND (metadata->>'catalogue_import') IS DISTINCT FROM 'CHG-049';
```

Applied to the staging `buildkart` database. Medusa API and worker were
restarted to clear product/pricing caches; the proxy was restarted to
re-resolve the new container IPs.

## Verification

| Check | Before | After |
|---|---|---|
| Published, non-imported products | 52 | 0 |
| Published imported products | 233 | 233 |
| Store API total (unfiltered) | 285 | **233** |
| Imported products / unique SKUs | 233 / 500 | **233 / 500** |
| Demo product `prod_01M4EC9DSV09PT4B3PM2BB44GV` | returned | **not returned** |
| "BuildPro Screwdriver Set" in store results | present | **absent** |

The experience API is unchanged; both storefronts already request
`catalogue_import=CHG-049`.

## Rollback

```sql
UPDATE product SET status = 'published', updated_at = now()
 WHERE deleted_at IS NULL
   AND status = 'draft'
   AND (metadata->>'catalogue_import') IS DISTINCT FROM 'CHG-049';
```

## Observations

- The 25 imported SKUs with placeholder source prices remain, because they are
  part of the approved 500-SKU selection (CHG-052 notes this).
- Any home module or collection configured with a demo product id will now be
  empty; those references are content, not catalogue, and were not rewritten.
- Staging only; production authorization remains **false**.
