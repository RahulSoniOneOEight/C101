# Admin Products workspace slice — 2026-10-25

Scope: Admin-only UI slice on staging.
Lane: A — UI only, no schema or API change.
Release: `f59a5f9`
Production: untouched.

## Outcome

- Admin navigation label is **Products** (was Catalogue).
- Product Studio sidebar entry is **New product**.
- Native product detail remains available for advanced fields and SEO.
- Native product detail now shows a **Product workspace** card that opens
  `/product-studio/:id`.
- The workspace has section navigation:
  **Details | Tags & specs | Variants | Offers & pricing | Inventory | Review**
- Section links update `?section=...`, support refresh/deep-link, use a named
  navigation landmark and `aria-current="location"`.
- Catalogue search is hidden while editing an existing product.
- Published or offered products lock option axes, variant removal, SKU edits and
  bulk SKU generation. Name, details and image remain editable.
- Review and lifecycle actions are disabled while the form is dirty.
- Customer preview is relabelled **Content preview** because it is not a live
  storefront projection.
- Seller is unchanged in this slice.

## Verification

- `npm run build --workspace @acme/admin`: pass.
- Targeted lint: only the pre-existing `react-hooks/set-state-in-effect` findings
  and pre-existing page-config fast-refresh finding.
- Staging health: API `200`, ops `200`, Admin `200`.
- Admin sidebar shows Products, Collections, Categories, New product; no
  Catalogue.
- Native product detail loads with the workspace CTA.
- Workspace CTA is a single link, not nested interactive markup.
- All six section links render; clicking Variants, Offers & pricing and Review
  sets `aria-current="location"` and `?section=`.
- Published/offered product: structural lock note present and SKU fields
  disabled.
- Pricing shows B2C and B2B.
- Review shows Content preview.
- Dirty draft: unsaved-changes notice present and Submit for review disabled.
- Console errors: `0`.
- Mobile `390x844`: section navigation wraps, document width `390`, no
  horizontal overflow, console errors `0`.
- GPT‑5.6 Sol first QC: **APPROVE WITH CHANGES**.
- All medium/low findings applied.
- GPT‑5.6 Sol final confirmation: **APPROVE**, no new blocker/high/medium
  findings, no residual low findings.

## Screenshots

- `client-projects/client101/evidence/CHG-076/admin-products-workspace-2026-10-25/admin-products-nav.png`
- `client-projects/client101/evidence/CHG-076/admin-products-workspace-2026-10-25/admin-native-product-workspace-widget.png`
- `client-projects/client101/evidence/CHG-076/admin-products-workspace-2026-10-25/admin-workspace-tabs.png`
- `client-projects/client101/evidence/CHG-076/admin-products-workspace-2026-10-25/admin-workspace-variants.png`
- `client-projects/client101/evidence/CHG-076/admin-products-workspace-2026-10-25/admin-workspace-pricing.png`
- `client-projects/client101/evidence/CHG-076/admin-products-workspace-2026-10-25/admin-workspace-review.png`
- `client-projects/client101/evidence/CHG-076/admin-products-workspace-2026-10-25/admin-workspace-dirty-guard.png`
- `client-projects/client101/evidence/CHG-076/admin-products-workspace-2026-10-25/admin-workspace-mobile.png`

## Residual limitations

- Native product detail remains the advanced/SEO fallback; the Products list
  still uses the native list and native Create.
- This slice does not include server-owned readiness, offer ownership,
  permissions, published read-only mode or server-side structural lock.
- Tab/deep-link, dirty lifecycle actions and structural locks still need
  automated browser tests.
- Production remains unauthorized.
