# U-005 / B003 — closeout (seller-name focus)

- **Bundle:** U-005 — order page seller name instead of seller ID
- **Lane / release:** B / `image-rebuild` (admin API + admin UI only)
- **Worktree:** `C:\Users\LENOVO\AppData\Local\Temp\opencode\bk-u005-order-page`
- **Branch:** `fix/u005-order-page-labels`
- **Base:** `399a969` (live staging, verified 17:19Z)
- **Candidate:** `a13bcb4d615e854aa635655959e4b146d1ba79fb`
- **Deploy:** **not performed** — no gate received. Live remains `399a969`.
- **Production:** untouched, forbidden

## Scope of this pass

The requester asked to check and fix the **seller ID / no seller name** issue. This pass implements
that cluster only:

- seller name resolved at read time (admin API, additive `seller_name`);
- `Seller / Store` label with the name as the primary value and the `sel_…` ID in a tooltip;
- fallback to the ID when the seller is missing/deleted;
- multi-seller summary on the delivery section;
- shipments list and shipment detail show the name.

Tracking-label and `vN` removal are **not** in this focused pass (see Deferred).

## G1 baseline

| Item | Value |
|---|---|
| Branch | `fix/u005-order-page-labels` |
| HEAD | `399a969d9fd10ce7a01008cc7fe8e64d146ab805` |
| `git status` | clean |
| Live `current` | `release-399a969` |
| Reference order group | `og_01M5Z4YDTS57Z0ES1NJ7GZRDZ6` (BuildKart Direct + UrbanBuild Supply) |

## Diff vs `399a969`

| Path | Purpose |
|---|---|
| `services/backend/packages/api/src/lib/seller-names.ts` (new) | read-time seller-ID → name resolver, missing/deleted omitted |
| `.../api/admin/buildkart/order-groups/[id]/delivery-returns/route.ts` | enrich shipment cards with `seller_name` |
| `.../api/admin/buildkart/shipments/route.ts` | enrich list items |
| `.../api/admin/buildkart/shipments/[id]/route.ts` | enrich the detail shipment |
| `.../api/admin/buildkart/shipments/types.ts` | additive `seller_name?: string` |
| `apps/admin/src/widgets/order-delivery-returns.tsx` | `Seller / Store` label, name primary, ID tooltip, multi-seller summary |
| `apps/admin/src/routes/shipments/page.tsx` | Seller column shows the name, ID tooltip |
| `apps/admin/src/routes/shipments/[id]/page.tsx` | Seller shows the name, ID tooltip |

No Experience API, app, web, CMS, migration, env or data record touched.

## API verification (read-only)

`loadSellerNames` was executed against staging with the three reference sellers plus a missing ID:

```
SELLER_NAMES={
  "sel_01M4EC9C7YNSFGCG6A4B3Q6PG8":"BuildMaster Supplies",
  "sel_01M4EC9DK3DWFSYX18FNDSGYC2":"UrbanBuild Supply",
  "sel_01M5897CE4PTBHS4AA7H0G79G7":"BuildKart Direct"
}
```

The missing `sel_missing` ID is omitted, so the UI falls back to the raw ID (D1). The join is
read-only (no order/shipment write).

## Build verification

| Check | Result |
|---|---|
| API `tsc --noEmit` (host image, changed files mounted) | **0** |
| `npm run build --workspace @acme/api` (host image, changed files mounted) | **PASS** |
| `npm run build --workspace @acme/admin` | **PASS** (35.5s) |

## Before evidence

`screenshots/delivery-before-1440.png` captures the live `399a969` delivery section for order
`#145` (group `og_01M5Z4YDTS57Z0ES1NJ7GZRDZ6`): two cards, both labelled **Seller code**, with raw
`sel_…` IDs (`sel_01M5897CE4PTBHS4AA7H0G79G7`, `sel_01M4EC9DK3DWFSYX18FNDSGYC2`). This is the defect
the bundle fixes.

## Requirement ledger

| ID | Requirement | Status | Evidence |
|---|---|---|---|
| R1 | Shipment card shows seller name, ID in tooltip, fallback to ID | **PASS-CODE** | `seller_name` join + `Seller / Store` label + `title={sellerId}`; helper output above. Screenshot after deploy. |
| R2 | Multi-seller order shows BuildKart Direct / UrbanBuild Supply on the two cards | **PASS-CODE** | both names resolve; screenshot after deploy |
| R3 | Delivery section lists distinct sellers with a count, no raw IDs | **PASS-CODE** | `Sellers (2): …` summary implemented |
| R4 | Label is Seller/Store, never “Seller code”; primary value never `sel_…` | **PASS-CODE** | source: `name="Seller / Store"`, value name-or-ID; no `Seller code` left in admin |
| R5 | Shipments list + shipment detail show the name, ID tooltip | **PASS-CODE** | source changes in both pages |
| R6 | `vN` removed from delivery/return cards | **DEFERRED** | focused pass limited to the seller-name issue; requester instruction |
| R7 | Tracking labelled “Simulated tracking” | **DEFERRED** | same; tracking code remains readable |
| R8 | Raw-ID audit for the order page | **PASS-CODE** | audit table below |
| R9 | No behaviour/permission change | **PASS-CODE** | display-only diff; no action or RBAC code touched |
| R10 | API additive: `seller_name` present, `sellerId` retained | **PASS-CODE** | routes add `seller_name`; `sellerId` unchanged |
| R11 | Admin typecheck/build; 1440/390 screenshots; zero console errors | **PASS-CODE** | API tsc 0, admin build 0; screenshots after deploy |

## Raw-ID audit (R8)

| Surface | Raw value today | Disposition |
|---|---|---|
| Delivery shipment card | `sellerId` (`sel_…`) | **fixed** — name primary, ID tooltip |
| Delivery shipment card | `trackingNumber` (`SIM-…`) | identifier, kept; label deferred (R7) |
| Delivery shipment card | `v{version}` | concurrency value; removal deferred (R6) |
| Delivery shipment card | `allocationId` (line under shipment) | labelled technical reference; kept |
| Delivery shipment card | `orderGroupId` (order context) | labelled technical reference; kept |
| Shipments list | Seller column `sel_…` | **fixed** — name, ID tooltip |
| Shipment detail | Seller `sel_…` | **fixed** — name, ID tooltip |
| Shipment detail | Allocation `alloc_…` | labelled technical reference; kept |
| Return card | `record.id` / `v{version}` | return reference is labelled; version removal deferred (R6) |

## Deploy

- **Not authorised by the brief.** Live is `399a969`.
- Mechanism: `image-rebuild` — **medusa only** (admin API + UI); no Experience API, CMS or app build.
- Previous release: `399a969`; rollback: `399a969`.
- After the gate: build medusa, switch `current`, restart the proxy, then capture the two reference
  orders at 1440 and 390 (R1–R5, R11) and verify the API `seller_name`.

## Deferred register

| Item | Why | Owner / when |
|---|---|---|
| R6 (`vN` removal) | requester asked to focus on seller name | next U-005 pass |
| R7 (`Simulated tracking` label) | same | next U-005 pass |
| 1440/390 before/after screenshots | require the deployed admin bundle | after the U-005 deploy gate |
| Deploy | no gate | control room + requester |

## Residual risks

1. **Deleted seller.** The join omits soft-deleted sellers; the UI falls back to the raw ID. This is
   the specified fallback, not a hidden name.
2. **Extra read query.** Each delivery-returns/shipments read adds one seller query bounded by the
   distinct seller count. No write, no cache invalidation.
3. **Action responses.** Shipment action/simulate/reconcile responses may not carry `seller_name`
   (they proxy the Experience API); the read routes do. The UI always falls back to `sellerId`.
4. **No runtime UI yet.** The live admin bundle is still `399a969` and still shows “Seller code”
   until the U-005 deploy gate.
