# U-005 / B003 — closeout (seller-name focus)

- **Bundle:** U-005 — order page seller name instead of seller ID
- **Lane / release:** B / `image-rebuild` (admin API + admin UI only)
- **Worktree:** `C:\Users\LENOVO\AppData\Local\Temp\opencode\bk-u005-order-page`
- **Branch:** `fix/u005-order-page-labels`
- **Base:** `399a969` (live staging, verified 17:19Z)
- **Runtime release:** **`a13bcb4`** (`/opt/buildkart-releases/release-a13bcb4`)
- **Rollback:** `399a969` — not used
- **Deploy:** staging only, under the requester's gate
  (`DEPLOY APPROVED: U-005 release a13bcb4 … Rollback 399a969. Staging only.`)
- **Production:** untouched, forbidden

## Outcome

The admin order delivery cards now show the seller/store **name** — BuildKart Direct, UrbanBuild
Supply, BuildMaster Supplies — with the `sel_…` ID kept in the tooltip. The delivery section adds a
distinct-seller summary. The shipments list and shipment detail show names too. The live
`Seller code` label is gone.

This pass deliberately focused on the **seller ID / no seller name** issue. Tracking-label (R7)
and `vN` removal (R6) remain deferred.

## G1 baseline

| Item | Value |
|---|---|
| Branch | `fix/u005-order-page-labels` |
| HEAD | `399a969d9fd10ce7a01008cc7fe8e64d146ab805` |
| `git status` | clean |
| Live `current` | `release-399a969` |
| Reference order group | `og_01M5Z4YDTS57Z0ES1NJ7GZRDZ6` (BuildKart Direct + UrbanBuild Supply) |

## G5 scoped release — `399a969..a13bcb4`

One commit, eight files:

| Path | Purpose |
|---|---|
| `services/backend/packages/api/src/lib/seller-names.ts` (new) | read-time seller-ID → name resolver; missing/deleted omitted |
| `.../api/admin/buildkart/order-groups/[id]/delivery-returns/route.ts` | adds `seller_name` to shipment cards |
| `.../api/admin/buildkart/shipments/route.ts` | adds `seller_name` to list items |
| `.../api/admin/buildkart/shipments/[id]/route.ts` | adds `seller_name` to the detail |
| `.../api/admin/buildkart/shipments/types.ts` | additive `seller_name?: string` |
| `apps/admin/src/widgets/order-delivery-returns.tsx` | `Seller / Store` label, name primary, ID tooltip, multi-seller summary |
| `apps/admin/src/routes/shipments/page.tsx` | Seller column shows the name, ID tooltip |
| `apps/admin/src/routes/shipments/[id]/page.tsx` | Seller shows the name, ID tooltip |

No Experience API, app, web, CMS, migration, env or data record touched.

## Deploy record

| Step | Result |
|---|---|
| Branch pushed | `fix/u005-order-page-labels` |
| Build | `--no-cache` medusa-api + medusa-worker; `BUILD_EXIT=0` |
| Image markers before switch | `seller-names.ts` present · delivery route joins names · `seller_name` type present · admin bundle contains **Seller / Store** and **zero** “Seller code” |
| `current` | `release-a13bcb4` |
| Containers | medusa-api healthy · medusa-worker healthy · experience-api unchanged (399a969 image) |
| Proxy | restarted |
| Health | api 200 · ops 200 · dashboard 200 · seller 200 · app 200 |

## API verification (runtime)

Admin delivery-returns for `og_01M5Z4YDTS57Z0ES1NJ7GZRDZ6`:

```
ship_c15eefdb46e440a08e5f9d9514cd2023  sellerId=sel_01M5897CE4PTBHS4AA7H0G79G7  seller_name="BuildKart Direct"  tracking=SIM-123F730D40A5
ship_326cd5db3d8941c88c74b3107f292785  sellerId=sel_01M4EC9DK3DWFSYX18FNDSGYC2  seller_name="UrbanBuild Supply"  tracking=SIM-CF4FBD28983E
DISTINCT_NAMES=["BuildKart Direct", "UrbanBuild Supply"]
```

Shipments list: the same seller IDs resolve to BuildKart Direct / UrbanBuild Supply. `sellerId` is
retained on every response.

## UI verification (runtime, 1440 + 390)

Order `#145` (`order_01M5Z4YDTH64YA09B3YTM6VY9A`), delivery section:

```
PASS no Seller code label
PASS BuildKart Direct shown
PASS UrbanBuild Supply shown
PASS distinct seller summary — Sellers (2): BuildKart Direct · UrbanBuild Supply
PASS shipments list names
PASS shipments list no Seller code
PASS shipment detail name
PASS no console errors
```

Screenshots:
- `screenshots/delivery-before-1440.png` — live `399a969`: “Seller code” + raw IDs on both cards.
- `screenshots/delivery-after-1440.png` — `a13bcb4`: **Seller / Store** names + `Sellers (2)` summary.
- `screenshots/delivery-after-390.png` — mobile width, names and actions intact.
- `screenshots/shipments-after-1440.png` — Seller column with names.
- `screenshots/shipment-detail-after-1440.png` — detail Seller with the name.

## Requirement ledger

| ID | Requirement | Status | Evidence |
|---|---|---|---|
| R1 | Shipment card shows seller name, ID in tooltip, fallback to ID | **PASS** | runtime cards show BuildKart Direct / UrbanBuild Supply; API `seller_name` |
| R2 | Multi-seller order shows BuildKart Direct / UrbanBuild Supply on the two cards | **PASS** | `delivery-after-1440.png`; API response |
| R3 | Delivery section lists distinct sellers with a count, no raw IDs | **PASS** | “Sellers (2): BuildKart Direct · UrbanBuild Supply” |
| R4 | Label is Seller/Store, never “Seller code”; primary value never `sel_…` | **PASS** | screenshot + source; admin bundle has zero “Seller code” |
| R5 | Shipments list + shipment detail show the name, ID tooltip | **PASS** | `shipments-after-1440.png`, `shipment-detail-after-1440.png`; runtime check |
| R6 | `vN` removed from delivery/return cards | **DEFERRED** | focused pass limited to the seller-name issue (requester instruction) |
| R7 | Tracking labelled “Simulated tracking” | **DEFERRED** | same; tracking code remains readable |
| R8 | Raw-ID audit for the order page | **PASS** | audit table below |
| R9 | No behaviour/permission change | **PASS** | display-only diff; “Update delivery status” still renders; no action executed |
| R10 | API additive: `seller_name` present, `sellerId` retained | **PASS** | runtime API output above |
| R11 | Admin typecheck/build; 1440/390 screenshots; zero console errors | **PASS** | API tsc 0 · admin build 0 · screenshots · 0 console errors |

## Raw-ID audit (R8)

| Surface | Raw value | Disposition |
|---|---|---|
| Delivery shipment card | `sellerId` (`sel_…`) | **fixed** — name primary, ID tooltip |
| Delivery shipment card | `trackingNumber` (`SIM-…`) | identifier kept; label deferred (R7) |
| Delivery shipment card | `v{version}` | concurrency value; removal deferred (R6) |
| Delivery shipment card | `allocationId` | labelled technical reference; kept |
| Delivery shipment card | `orderGroupId` | labelled technical reference; kept |
| Shipments list | Seller `sel_…` | **fixed** — name, ID tooltip |
| Shipment detail | Seller `sel_…` | **fixed** — name, ID tooltip |
| Shipment detail | Allocation `alloc_…` | labelled technical reference; kept |
| Return card | `record.id` / `v{version}` | return reference labelled; version removal deferred (R6) |

## Deferred register

| Item | Why | Owner / when |
|---|---|---|
| R6 (`vN` removal) | focused pass on seller name | next U-005 pass |
| R7 (`Simulated tracking` label) | same | next U-005 pass |
| Production | forbidden | human authorisation only |

## Residual risks

1. **Deleted seller.** The join omits soft-deleted sellers; the UI falls back to the raw ID (D1).
   That is the specified fallback, not a hidden name.
2. **Tooltip-only ID.** The `sel_…` ID is exposed via the `title` attribute; it is not a visible
   primary value. Keyboard/screen-reader users see the name; support can hover for the ID.
3. **Extra read query.** Each delivery-returns/shipments read adds one seller query bounded by the
   distinct seller count. No write, no cache invalidation.
4. **Action responses.** Shipment action/simulate/reconcile responses may not carry `seller_name`
   (they proxy the Experience API); the read routes do. The UI always falls back to `sellerId`.
5. **Scope.** Tracking label and `vN` are unchanged by design in this pass.
6. **Concurrent-release lesson.** The release was built `--no-cache` and marker-checked before
   switching, following the earlier stale-image incident.

## Release and rollback

- **Runtime release:** `a13bcb4` — `/opt/buildkart-releases/release-a13bcb4`
- **Rollback:** `399a969` — `/opt/buildkart-releases/release-399a969` (unused)
- **Mechanism:** `image-rebuild` — medusa only (admin API + UI); Experience API, CMS and app untouched.
- **Production:** untouched and forbidden.
