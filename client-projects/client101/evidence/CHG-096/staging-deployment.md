# CHG-096 — Staging deployment and Admin order-detail QC

**Status:** STAGING DEPLOYED AND VERIFIED
**Change:** CHG-096 Revision 1 — Admin order-detail top-chrome UX polish
**Environment:** staging only. Production is not authorized and was not touched.
**Deploy owner:** requester-authorized OpenCode agent
**Completed:** 2026-10-29

---

## 1. Release identity

| Item | Value |
|---|---|
| Baseline before release | `/opt/buildkart-releases/release-b7f93b9` (`b7f93b9`, CHG-094) |
| Target branch | `release/chg-096-6` |
| Release commit | `5f6c90b115d0cd961b2123eb9a79b50a05b42195` |
| Commit range | `b7f93b9..5f6c90b` — Admin top-chrome changes only |
| Release worktree | `/opt/buildkart-releases/release-5f6c90b` |
| Current symlink | `/opt/buildkart-releases/current -> release-5f6c90b` |
| Rollback release | `/opt/buildkart-releases/release-b7f93b9` |
| Rollback image | `buildkart-hosted-pilot-medusa:rollback-b7f93b9` (`sha256:7db0f1e59c82`) |
| New image | `buildkart-hosted-pilot-medusa:latest` (`sha256:eb5e1500cbc0`) |
| Production release | Not authorized |

## 2. What changed

Scoped to `services/backend/apps/admin/src/components/order-preview/index.tsx` and the two Admin widgets:

- **Polaris-style `PreviewModeBanner`** with mode-specific icons (Admin=User, Seller=BuildingStorefront, App=Phone, Web=Globe), colored left border, and a highlighted active preview link.
- **Mode-aware status strip:**
  - Admin: Payment / Delivery / Returns / Refund
  - Seller: Delivery / Returns
  - App/Web: single "Order status" tile
- **Improved microcopy** on the status strip: "Ready to capture", "Payment captured", "No refund issued", etc.
- **Attention stack** now surfaces a "Payment ready to capture" item for authorized payments in Admin mode.
- **Payments card moved** from the delivery/returns widget into the top chrome, directly under the status strip for Admin mode.
- **New `ReconciliationCard`** summarizing Payment / Delivery / Returns / Refund system state.
- **SectionNav** is now horizontally scrollable and hidden for Seller/App/Web modes.
- Removed the redundant subtitle under "Order operations" and reduced top-chrome vertical spacing.

## 3. What was NOT changed

- `services/backend/apps/admin/fulfillment-preview*` harness — left untouched as reference.
- Customer web, seller portal, experience API, Medusa modules, database schema.
- Native Medusa order actions (Capture payment, Update delivery status, Return workbench).
- Production.

## 4. Deployment procedure

1. Acquired `/var/lock/buildkart-staging-deploy` (deploy owner: requester-authorized OpenCode agent).
2. Created scoped release branch `release/chg-096-6` from baseline `b7f93b9` and cherry-picked the Admin top-chrome commits.
3. Built a fresh Medusa backend image (`medusa-api` + `medusa-worker`) with `--no-cache`.
4. Switched `/opt/buildkart-releases/current` to `release-5f6c90b`, recreated Medusa containers, and restarted the proxy.
5. Verified public health endpoints and admin bundle markers.
6. Ran automated browser QC against order #151 at desktop (1440×900) and mobile (390×844).
7. Preserved rollback image `buildkart-hosted-pilot-medusa:rollback-b7f93b9`.

## 5. Verification

### 5.1 Public health

| Check | Result |
|---|---|
| `api-staging.pinakaplay.cloud/health` | 200 |
| `ops-staging.pinakaplay.cloud/health` | 200 |
| Admin dashboard | 200 |
| Seller dashboard | 200 |

### 5.2 Bundle marker check

Main admin bundle `/dashboard/assets/index-ChQIUnVk.js` contains:

- `System reconciliation` ✅
- `One flow, independently verifiable effects` ✅
- `Order status` ✅
- `Ready to capture` ✅
- `No refund issued` ✅
- `Preview as` ✅
- `Admin view` ✅
- `Seller view` ✅
- `Customer app view` ✅
- `Customer web view` ✅

### 5.3 Browser QC

Run: `node client-projects/client101/evidence/CHG-096/staging-admin-qc.mjs`

Reference order: `#151` / `BK-261029-WT4R93` / `order_01M633BSHHWEMM9YT6K5S7PVCZ` / group `og_01M633BSJSH4023AHJPCKHNNKA`.

Summary: **56/56 PASS**; 0 console errors; 0 unexpected failed requests.

Checked per viewport (desktop + mobile):

- Login succeeds and order page loads.
- No horizontal document overflow.
- Admin status strip shows Payment / Delivery / Returns / Refund.
- Payments card shows Authorized, Captured, Refunded, Outstanding amounts (₹514.06 authorized/outstanding).
- Reconciliation card shows Payment / Delivery / Returns / Refund rows.
- Attention stack shows "Payment ready to capture".
- Preview-mode banner shows the current perspective and "Preview as" Admin / Seller / App / Web links with mode-specific icons.
- Seller mode shows Seller-view banner, simplified Delivery + Returns status strip, hides Jump-to nav, and hides native payment controls.
- App mode shows Customer-app-view banner, single "Order status" tile, hides Jump-to nav.
- Web mode shows Customer-web-view banner, single "Order status" tile, hides Jump-to nav.
- Admin mode shows Admin-view banner, Jump-to nav, native payment controls, and Update delivery status action.

Screenshots saved in `client-projects/client101/evidence/CHG-096/screenshots/`.

## 6. Rollback

If needed, run from the VPS as root:

```bash
cd /opt/buildkart-releases/release-b7f93b9/services/hosted
ln -sfn /opt/buildkart-releases/release-b7f93b9 /opt/buildkart-releases/current
docker compose -f docker-compose.hosted.yml up -d --no-deps --force-recreate medusa-api medusa-worker
# wait for healthy
docker restart buildkart-hosted-pilot-proxy-1
```

## 7. Evidence

- `client-projects/client101/evidence/CHG-096/staging-deployment.md`
- `client-projects/client101/evidence/CHG-096/staging-admin-qc.json`
- `client-projects/client101/evidence/CHG-096/staging-admin-qc.mjs`
- `client-projects/client101/evidence/CHG-096/screenshots/`
- `client-projects/client101/changes/CHG-096.yaml`
