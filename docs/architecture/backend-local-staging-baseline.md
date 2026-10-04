# BuildKart Local Staging Baseline — CHG-017 Revision 5

**Status:** Approved for functional local staging only. Not production, not provider-ready.

## Approved component versions

| Component | Exact version | Scope | Evidence |
|---|---|---|---|
| Mercur | 2.3.4 (git tag commit `bf52fbd93c9a900e8a83a0ed0335353a9239cdf9`) | Marketplace/Commerce layer | Release notes; template manifest |
| Medusa packages | 2.20.1 (`@medusajs/*`) | Commerce core | Mercur 2.3.4 release pin; npm registry |
| Node.js | 22.23.2 (`node:22.23.2-bookworm-slim`) | Medusa/Mercur runtime | npm `engines` `^20.19.0 \|\| >=22.12.0` |
| Bun | 1.3.11 | Mercur package manager | Mercur 2.3.4 template `packageManager` |
| Tryton server | 8.0.11 (`trytond`) | ERP reservation/movement/accounting | PyPI |
| Tryton stock | 8.0.4 (`trytond_stock`) | Inventory | PyPI |
| Tryton sale | 8.0.5 (`trytond_sale`) | Sales order projection | PyPI |
| Tryton stock supply | 8.0.0 (`trytond_stock_supply`) | Supply/movement | PyPI |
| Tryton account | 8.0.3 (`trytond_account`) | Accounting | PyPI |
| Tryton account invoice | 8.0.2 (`trytond_account_invoice`) | Invoice/test-clearing | PyPI |
| Python | 3.12.12 (`python:3.12.12-slim-bookworm`) | Tryton runtime | PyPI `>=3.10` |
| PostgreSQL | 16.15 (`postgres:16.15-alpine`) | Shared datastore | Medusa docs (16 recommended) |
| Redis | 7.4.10 (`redis:7.4.10-alpine`) | Medusa/Mercur queue/cache | Medusa docs (Redis 7) |

## Deferred / excluded

- Razorpay and any live payment provider — `E-017-003` remains `planned`/deferred.
- CMS/DAM provider selection — editorial content via governed seed or optional CMS, non-transactional.
- Meilisearch — excluded for this increment unless explicitly required; derived index only.
- Queue/broker beyond Medusa Redis-based transport — no separate broker selected.
- Production ERP, logistics, notifications and customer data — prohibited by runtime authorization.

## Runtime constraints (CHG-017-R5-STAGING-RUNTIME-001)

- Functional Medusa, Mercur and Tryton local staging services only.
- Payment is simulated; `payment_mode=simulated`, `test_data=true` markers propagate.
- Environment-specific endpoints and credentials; production routing fails closed.
- No production release, provider credentials, or customer production data.

## Owners and reviewers

All owner/reviewer fields remain `null` and pending named assignment before any item can
reach `evidenced`/`accepted`. Version pinning alone does not satisfy capability evidence.

## Source evidence references

- Mercur release notes: https://www.mercurjs.com/updates/mercur-2-3-4-release
- Mercur 2.3.4 git tag: https://github.com/mercurjs/mercur/releases/tag/v2.3.4
- Tryton 8.0 releases: https://docs.tryton.org/8.0/server/releases.html
- Medusa npm: https://www.npmjs.com/package/@medusajs/medusa
- PostgreSQL 16 releases: https://www.postgresql.org/docs/release/16.12/
