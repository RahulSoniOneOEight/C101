# Portal benchmark — BuildKart Admin and Seller vs Shopify Admin

Date: 2026-10-23
BuildKart runtime: `950f454`
Method: live staging page audit (18 Admin pages, 11 Seller pages, no mutations) plus official Shopify Help Center documentation.
Scope: page coverage, workflow depth and operator UX. Not latency or pixel-level visual comparison.

## Important comparison caveat

Shopify Admin is a **single-store** operator console. Shopify does not provide a native
multi-vendor seller portal. The BuildKart Seller portal is therefore compared with the closest
Shopify experience — a staff-scoped Shopify Admin — not with a like-for-like Shopify seller product.

BuildKart pages with no Shopify equivalent are marked **Differentiator** rather than treated as
missing parity.

## Overall result

| Portal | Judgement score | Summary |
|---|---:|---|
| BuildKart Admin | **2.8 / 5** | Strong marketplace operations; thin core commerce management and analytics |
| BuildKart Seller | **2.3 / 5** | Functional seller console; missing scale tools, analytics and richer listing workflows |
| Shopify Admin baseline | **4.9 / 5** | Mature commerce back office with broad workflow depth |
| Core commerce parity | **~50–55%** | BuildKart covers the basics and adds marketplace-specific pages |

Scores are a judgement from the live page audit and Shopify documentation. They are not a vendor
benchmark or a production-readiness score.

## Page-by-page summary

Scores: 5 = Shopify-level depth; 3 = usable but materially narrower; 1 = missing or placeholder.
`—` means the page is not part of that portal.

| Page / capability | Admin | Seller | Shopify baseline | Verdict |
|---|---:|---:|---:|---|
| Home / Analytics | 1.5 | 1.0 | 5.0 | **P0 gap.** Both BuildKart roots redirect to Orders; `/home` and `/analytics` render blank. Shopify has real-time Home metrics, dashboards, reports and Live View. |
| Orders list | 3.0 | 2.5 | 5.0 | Basic list, filters and pagination. Shopify adds search, saved views, bulk actions, exports and richer status views. |
| Catalogue / Products list | 3.0 | 2.5 | 5.0 | Basic catalogue with filters and create. Shopify adds bulk editor, CSV import/export, collections, SEO, media workflows and product analytics. |
| Product editor / Product Studio | 3.5 | 3.0 | 5.0 | BuildKart has a strong custom multi-section editor and marketplace offers/B2C/B2B. Shopify is stronger on media, SEO, collections, bulk variants and publishing depth. |
| Inventory | 2.5 | 2.0 | 5.0 | Basic inventory list. Shopify has locations, adjustments, stock counts, transfers, purchase orders and audit history. |
| Customers | 2.5 | 2.0 | 5.0 | Basic customer list and create. Shopify has segments, accounts, service tools, import/export and store credit. |
| Promotions / Discounts | 2.5 | 2.0 | 5.0 | Basic promotion list/create. Shopify has code and automatic discounts, BXGY, free shipping, eligibility, combinations, exports and rollouts. |
| Price lists / B2B catalogs | 3.0 | — | 5.0 | BuildKart has per-offer B2B pricing in Product Studio and an advanced Price Lists page. Shopify has company/location catalogs, catalog-level products/prices, quantity rules and volume pricing. |
| Stores / Sellers | 4.5 | — | N/A | **BuildKart differentiator.** Shopify has no native multi-seller store directory. |
| Payouts / Settlements | 2.5 | 1.5 | 5.0 | BuildKart has payout and settlement pages, but the live audit showed empty states with no payout detail/export actions. Shopify has payout timing, fees, activity reports, scheduling and failure handling. |
| Shipments / Fulfillment | 3.0 | 2.5 | 5.0 | BuildKart has shipment tabs and a delivery workbench. Shopify has labels, carriers, tracking, split/merge, holds and proof of delivery. |
| Returns | 3.0 | 2.5 | 5.0 | BuildKart has seller/admin return status workbenches. Shopify has return labels, fees, inspection, restock, exchanges and refund linkage. |
| Order delivery & returns workbench | 3.5 | — | N/A | **BuildKart differentiator.** Shopify spreads fulfillment and returns across order and return pages; BuildKart has a dedicated aggregate workbench. It is useful but rough. |
| Seller activity / audit | 4.0 | — | N/A | **BuildKart differentiator.** Shopify has order timelines and staff activity, but no equivalent marketplace seller-event feed. |
| Inventory requests | 2.0 | — | N/A | BuildKart has a request page but the live audit showed an empty state. Shopify uses purchase orders and transfers instead. |
| Merchandising / Editorial | 3.5 | — | 4.0 | **Mostly differentiator.** BuildKart has banner studio and B2C/B2B editorial. Shopify has themes, pages, blog and marketing content, but not this exact marketplace structure. |
| Reviews | 3.5 | 3.0 | 4.0 | BuildKart has native reviews. Shopify relies on apps for product reviews. |
| Settings / permissions | 2.0 | 2.5 | 5.0 | BuildKart settings are narrow. Shopify has granular staff roles, payments, taxes, shipping, locations, checkout, notifications and account settings. |
| Bulk / import / export | 2.0 | 1.5 | 5.0 | Only targeted bulk actions in Product Studio. Shopify has broad bulk editing, CSV import/export and saved bulk operations. |
| Mobile admin | 1.0 | 1.0 | 5.0 | No dedicated mobile app. Shopify has a mature mobile admin app. |
| Global search | 3.5 | 3.5 | 5.0 | BuildKart has a global search entry. Shopify adds categories, suggestions, history and cross-entity actions. |

## What Shopify does better

1. **Home and analytics** — metrics, reports, Live View, custom reports and task reminders.
2. **Scale tools** — saved views, bulk actions, CSV import/export, filters and search.
3. **Inventory operations** — locations, stock counts, transfers, purchase orders and audit.
4. **Customer operations** — segments, accounts, service tools and import/export.
5. **Discount engine** — code/automatic discounts, eligibility, combinations and exports.
6. **B2B catalogs** — company/location catalogs, catalog pricing, quantity rules and volume pricing.
7. **Payouts** — timing, fees, activity reports, scheduling and failed-payout handling.
8. **Permissions** — granular staff roles and store/organization permissions.
9. **Mobile and ecosystem** — mature mobile app, apps, Flow and automation.

## Where BuildKart is better or differentiated

1. **Multi-seller marketplace** — Stores, seller scoping, payouts and settlement statements.
2. **Seller portal** — a real vendor-scoped workspace; Shopify has no native equivalent.
3. **Seller activity audit** — immutable price/stock/event feed.
4. **Delivery and returns workbench** — aggregate operational view across sellers.
5. **Per-offer B2C/B2B pricing** — one offer context with separate B2C and B2B writes.
6. **Inventory request workflow** — explicit request/approval boundary.
7. **Merchandising and editorial** — B2C/B2B banner and content surfaces.
8. **Native reviews** — no app dependency.

## Priority recommendations

### P0 — operator completeness

1. Add **Home + Analytics** for Admin and Seller.
2. Add **saved views, search, bulk actions and CSV export** to Orders, Catalogue and Inventory.
3. Add **inventory locations, stock counts, transfers and purchase orders** or clearly link to Tryton-owned workflows.
4. Add **customer segments** and B2B company/contact context.
5. Add **payout detail, fees and export** to Payouts and Settlement statements.
6. Add **granular staff roles/permissions**; do not rely only on nav hiding.
7. Add **bulk-edit and import/export** to Catalogue and Product Studio.

### P1 — workflow depth

8. Shipment labels, carriers, tracking and proof of delivery.
9. Return labels, inspection, restock and exchange.
10. Product media, SEO, collections and richer variant management.
11. Discount types, eligibility, combinations and rollout.
12. Seller post-publish listing/pricing edits with review/audit.
13. Mobile admin.
14. Consistent empty states and next-action guidance across every page.

### P2 — ecosystem

15. Automation/workflow engine.
16. App/extension surface.
17. Advanced reporting and exports.
18. Multi-currency and multi-region catalog operations.

## Do not copy blindly

- Do not remove marketplace seller scoping to match Shopify’s single-store model.
- Do not replace separate B2C/B2B price writes with one combined save.
- Do not add Shopify’s full app/Flow ecosystem before the core operator workflows are sound.
- Do not treat Price Lists as a primary seller page; Product Studio remains the price editor.

## Sources

- Shopify — Products: https://help.shopify.com/en/manual/products
- Shopify — Inventory and locations: https://help.shopify.com/en/manual/products/inventory
- Shopify — Customers: https://help.shopify.com/en/manual/customers
- Shopify — Discounts: https://help.shopify.com/en/manual/discounts
- Shopify — B2B catalogs and pricing: https://help.shopify.com/en/manual/b2b/catalogs
- Shopify — Analytics: https://help.shopify.com/en/manual/reports-and-analytics/shopify-reports
- Shopify — Payouts: https://help.shopify.com/en/manual/payments/shopify-payments/payouts
- Shopify — Permissions: https://help.shopify.com/en/manual/your-account/users/roles/permissions
- Shopify — Admin overview: https://help.shopify.com/en/manual/shopify-admin/shopify-admin-overview
- BuildKart — live Admin/Seller audit at `950f454`; prior order-page benchmark and QC notes.
