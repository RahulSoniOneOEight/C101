# CHG-086 — Commercial-readiness visibility and the shared Product Studio workspace

- **Change:** `CHG-086` (extends `CHG-074`, `CHG-076`, `CHG-085`)
- **Date:** 2026-10-27
- **Lane:** C — image rebuild + static web + governed data update
- **Environment:** staging only. Production is not authorised.
- **Implementation commit:** `c0d8483` on `feat/bt-sku-pairs`
- **Baseline release:** `/opt/buildkart-releases/release-0e64bd3`
- **Pre-change database backup:** `/var/backups/buildkart/buildkart-20261026T185554Z.dump.age`

## 1. Outcome

Customer catalogue visibility no longer depends on a historical change identifier. A product appears in
a channel only when it is **published**, **assigned to that channel**, and has an **eligible seller
offer with a positive price in that channel and sellable stock**. Provenance remains audit-only.

Admin and Seller share one workspace: Overview, Variants & offers, Inventory, Activity and
Review & visibility. Product content, one offer's pricing, selected bulk operations and inventory
requests each have their own save action and dirty state.

## 2. What changed

### Visibility boundary

| Surface | Before | After |
|---|---|---|
| `GET /v1/products` | `catalogue_import=CHG-049` marker selected the catalogue | Commercial readiness selects the catalogue; a marker is honoured only when an old diagnostic URL explicitly supplies it |
| `GET /v1/products/{id}` | Returned any published record | Returns `404 product-not-commercially-ready` when the product has no eligible priced in-stock offer in the requested channel |
| B2B pricing | Fell back to the B2C Medusa price when no B2B terms were configured | B2B requires its own active saved price; a B2C price never makes a B2B offer visible |
| Offer fetching | No sales-channel scoping; one large `product_id[]` query | Channel-scoped, chunked (20 ids per request) so a 250-product scan stays within practical limits |

The readiness helper is shared by the list, detail and diagnostic endpoints, so the UI and the
storefront cannot disagree about the rule.

### Provenance

- New studio products write `catalogue_source=product_studio`.
- Existing rows are backfilled with `catalogue_source` (`product_studio`, `catalogue_import` or
  `legacy_catalogue`) **without changing `catalogue_import`**.
- `catalogue_source` is never read by a visibility decision.

### Product Studio (Admin and Seller, identical component)

- Sticky five-destination navigation with counts and a blocker badge; a labelled dropdown on mobile.
- Expandable section cards with `aria-expanded`, per-product session state, and a first-blocker summary.
- Variants & offers: a compact offer table (variant/SKU, seller, B2C, B2B) with one focused offer
  editor, Previous/Next/Close, and one **Save pricing** action scoped to that offer.
- Bulk pricing requires selected rows, states the selected scope and the channel, and applies to the
  reviewed selection only. B2B is explicitly per offer.
- Product save is a single dirty-only bar with `Save changes`, dirty-scope wording, `Ctrl/Cmd+S`,
  and a native unload warning. No fixed bar when the product is clean.
- Review & visibility renders server-owned per-channel gates (published, offer, price, stock), the
  exact blocker, and a **Fix** link that opens the owning view and focuses the field.
- `Published · Not live` is shown for auto-published records that are not yet commercially ready.
- Legacy option axes are no longer part of normal variant editing; an Admin-only collapsed technical
  drawer retains the compatibility view.
- Activity renders the audited product-change trail newest-first.
- Sales channels are visible in Overview so a missing assignment is diagnosable.

### Governed staging data (exact allowlist)

| Record | Change |
|---|---|
| `pattr_01M4EC9BX8J18G5Z2JYF9FN6TD` (Color) | `is_variant_axis=false`; stays active and filterable |
| `pattr_01M4EC9BX947JYA00T2YRSQTDB` (Condition) | `is_variant_axis=false`; stays active and filterable |
| `prod_01M4EC9DSW5MSACQWETJ3R38AW` (VoltEdge) | `status=draft`, `lifecycle_state=archived` |
| `prod_01M4EC9DSW6J984KKM619VKZEA` (WoodWise) | `status=draft`, `lifecycle_state=archived` |
| `prod_01M5TC4ZM09R4FJMAFKP3G1H6C` (QC Live) | `status=draft`, `lifecycle_state=archived` |
| `prod_01M5VAK0F4R5G7V2MYS0PPQ4TM` (QC Pexels) | `status=draft`, `lifecycle_state=archived` |

No row is deleted. No product, variant, offer or order identifier changes. `catalogue_import` values
are preserved on every row.

## 3. Pre-change baseline

```
PRODUCT|prod_01M4EC9DSW5MSACQWETJ3R38AW|VoltEdge Modular Switch 1-Way|published|||
PRODUCT|prod_01M4EC9DSW6J984KKM619VKZEA|WoodWise Plywood Sheet 18mm 8x4|published|||
PRODUCT|prod_01M5TC4ZM09R4FJMAFKP3G1H6C|QC Live Variant Product 10260201 - Edited|published|||
PRODUCT|prod_01M5VAK0F4R5G7V2MYS0PPQ4TM|QC Pexels Variant Product 10261053|published|||
ATTRIBUTE|pattr_01M4EC9BX8J18G5Z2JYF9FN6TD|Color|true|true|true
ATTRIBUTE|pattr_01M4EC9BX947JYA00T2YRSQTDB|Condition|true|true|true
COUNTS|244|55|238|12
```

Historical order-line references (all preserved by the script's postcondition):

```
prod_01M4EC9DSW5MSACQWETJ3R38AW -> 3
prod_01M4EC9DSW6J984KKM619VKZEA -> 9
prod_01M5TC4ZM09R4FJMAFKP3G1H6C -> 1
prod_01M5VAK0F4R5G7V2MYS0PPQ4TM -> 0
```

## 4. Verification

| Check | Result |
|---|---|
| Experience API `tsc --noEmit` | PASS |
| Admin dashboard `tsc --noEmit` | PASS |
| Vendor dashboard `tsc --noEmit` | PASS |
| API package `tsc --noEmit` | PASS |
| `flutter analyze` | PASS (no issues) |
| `flutter test` | PASS (283) |
| `test:b2b-pricing-read` | PASS (channels isolated; B2B readiness) |
| `test:image-quality-order` | PASS |
| `test:cart-totals` | PASS |
| Data script dry run (staging) | PASS (transaction rolled back) |
| Data script apply (staging) | PASS (postconditions + order hashes verified) |
| `test:promotion-acceptance` | N/A locally — requires live staging pilot env vars |

Deployment, browser and journey verification results are appended in section 8.

## 5. Rollback

Code:

```bash
docker tag buildkart-hosted-pilot-medusa:rollback-0e64bd3 buildkart-hosted-pilot-medusa:latest
docker tag buildkart-hosted-pilot-experience-api:rollback-0e64bd3 \
  buildkart-hosted-pilot-experience-api:latest
ln -sfn /opt/buildkart-releases/release-0e64bd3 /opt/buildkart-releases/current
cd /opt/buildkart-releases/release-0e64bd3/services/hosted
docker compose -f docker-compose.hosted.yml up -d --no-deps --force-recreate \
  medusa-api medusa-worker experience-api event-workers
docker restart buildkart-hosted-pilot-proxy-1
```

Data: restore `/var/backups/buildkart/buildkart-20261026T185554Z.dump.age`, or reverse only the six
allowlisted rows (four product statuses/metadata, two attribute flags). The order-line postcondition
guarantees rollback of the script alone cannot corrupt historical orders.

## 6. No-touch confirmation

- Production: untouched and unauthorised.
- Tryton stock records and reservation logic: unchanged.
- Orders, carts, payments, refunds, settlements: unchanged.
- Medusa money-unit contract: unchanged.
- Existing product, variant, offer and order identifiers: unchanged.
- Wonder Cement (`prod_01M5Q98Y7CEHEPKZENTNGF9CVW`) and RCC HUME PIPE
  (`prod_01M5SFFZ0VCJ50ZYPHABT2CY15`): not archived, not modified.
- `catalogue_import` historical values: retained exactly.

## 7. Deferred

| Item | Reason |
|---|---|
| Tryton reservation gap | Outside CHG-086; explicit no-touch. |
| Wonder Cement commercial completion | Seller and price undecided; readiness keeps it hidden. |
| RCC HUME PIPE commercial completion | No valid seller offer/price; readiness keeps it hidden. |
| Conflict detection with last-loaded version | Requires a version contract; not part of this bundle. |

## 8. Deployment and runtime evidence

_To be appended after the staging release._


## 11. Live journey — variant then pricing (2026-10-27)

Deployed commit `6d8e602`. Executed against staging with a real Admin session.

| Step | Observed |
|---|---|
| Login | ok |
| Create page | `/dashboard/products/new` |
| Seller selectable on the variant | `BuildMaster Supplies` |
| Save variant | navigated to `/product-studio/prod_01M5X2Q7DRJZGGVYGRDE293PF5?view=variants&focus=pricing` |
| Pricing | table shows `0/1 priced` and the first offer editor is open |
| B2C + B2B inputs | both present in one editor, one **Save pricing** |

Test record created by this check: `prod_01M5X2Q7DRJZGGVYGRDE293PF5` (`CHG086-JRN-030215`).
It is a QC record and can be archived with the next governed cleanup.

## 12. Security incident to action

While redacting the admin-console secret file, the command assumed `key=value` but the file uses
`Key : value`, so the staging Admin password was printed into the working transcript.

- Scope: staging Admin console only (`admin@buildkart.test`); no production credential involved.
- Action required: rotate the staging Admin password and update `/etc/buildkart/secrets/admin-console.txt`.
- No secret was committed to Git.
