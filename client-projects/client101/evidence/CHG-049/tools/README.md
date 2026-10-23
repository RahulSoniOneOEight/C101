# CHG-049 import tooling

These are the exact staging-only tools retained from the 500-SKU import:

- `build-manifest.py` selects complete `brand + name` groups totalling exactly 500 unique SKUs,
  sanitises variant labels, copies selected images and writes the deterministic manifest.
- `import-staging.py` creates or recovers products, validates returned variants, maintains an atomic
  progress ledger, links both sales channels, detects existing offers and creates missing offers in
  seller-scoped batches.
- `verify-import.py` reconciles every imported product, variant, offer, traceability field, category,
  seller, channel and image against the manifest.
- `verify-storefront.mjs` checks both Medusa Store API channel contexts for all 233 products and all
  500 priced/in-stock offers.

The scripts intentionally contain client101 staging IDs and staging paths. They are evidence and a
resumption aid, **not** production automation. `STAGING_STOCK_FIXTURE = 50` is test data. Do not run
against another environment or authorize a production release from these files.

Secrets are not embedded. The Python staging tools read the root-managed admin credential file on
the staging host; the storefront verifier reads the Experience API container's managed environment.
