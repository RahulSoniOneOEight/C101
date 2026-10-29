# CHG-096 — Staging deployment and Admin order-detail QC

**Status:** STAGING DEPLOYED AND VERIFIED
**Change:** CHG-096 Revision 1 — Admin order-detail top-chrome UX (status strip, Payments card, role-mode switch)
**Environment:** staging only. Production is not authorized and was not touched.
**Deploy owner:** requester-authorized OpenCode agent
**Completed:** 2026-10-29

---

## 1. Release identity

| Item | Value |
|---|---|
| Baseline before release | `/opt/buildkart-releases/release-b7f93b9` (`b7f93b9`, CHG-094) |
| Target branch | `release/chg-096-4` |
| Release commit | `dc38fcc089c710c3078bad62e0ea09718d343431` |
| Commit range | `b7f93b9..dc38fcc` — Admin top-chrome changes only |
| Release worktree | `/opt/buildkart-releases/release-dc38fcc` |
| Current symlink | `/opt/buildkart-releases/current -> release-dc38fcc` |
| Rollback release | `/opt/buildkart-releases/release-b7f93b9` |
| Rollback image | `buildkart-hosted-pilot-medusa:rollback-b7f93b9` (`sha256:7db0f1e59c82`) |
| New image | `buildkart-hosted-pilot-medusa:latest` (`sha256:a288bb00ad66`) |
| Production release | Not authorized |

## 2. What changed

- Added `services/backend/apps/admin/src/components/order-preview/index.tsx` with reusable top-chrome components:
  - `StatusStrip` — unified Payment / Delivery / Returns / Refund tiles.
  - `PaymentsCard` — authorized, captured, refunded, outstanding amounts with payment method/reference.
  - `RoleModeSwitch` — Admin / Seller / App / Web segmented control using `?previewMode=` query param.
  - `PerspectiveBanner` — boundary notice for each preview mode.
  - `AttentionStack`, `SectionNav`, `usePreviewMode`.
- Refactored `services/backend/apps/admin/src/widgets/order-workbench-status.tsx` to use the new status strip and role-mode switch.
- Updated `services/backend/apps/admin/src/widgets/order-delivery-returns.tsx` to embed `PaymentsCard` and hide Admin payment/refund/delivery-update controls in Seller/App/Web preview modes.

## 3. What was NOT changed

- `services/backend/apps/admin/fulfillment-preview*` harness — left untouched as reference.
- Customer web, seller portal, experience API, Medusa modules, database schema.
- Production.

## 4. Deployment procedure

1. Acquired `/var/lock/buildkart-staging-deploy` (deploy owner: requester-authorized OpenCode agent).
2. Created scoped release branch `release/chg-096-4` from baseline `b7f93b9` and cherry-picked the Admin top-chrome commits.
3. Built a fresh Medusa backend image (`medusa-api` + `medusa-worker`) with `--no-cache`.
4. Switched `/opt/buildkart-releases/current` to `release-dc38fcc`, recreated Medusa containers, and restarted the proxy.
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

Main admin bundle `/dashboard/assets/index-PUHS8hXf.js` contains:

- `Order operations` ✅
- `Payments` ✅
- `Authorized` ✅
- `Captured` ✅
- `Refunded` ✅
- `Outstanding` ✅
- `Admin view` ✅
- `Seller view` ✅
- `Customer app view` ✅
- `Customer web view` ✅

### 5.3 Browser QC

Run: `node client-projects/client101/evidence/CHG-096/staging-admin-qc.mjs`

Reference order: `#151` / `BK-261029-WT4R93` / `order_01M633BSHHWEMM9YT6K5S7PVCZ` / group `og_01M633BSJSH4023AHJPCKHNNKA`.

Summary: **38/38 PASS**; 0 console errors; 0 unexpected failed requests.

Checked per viewport (desktop + mobile):

- Login succeeds and order page loads.
- No horizontal document overflow.
- Status strip shows Payment / Delivery / Returns / Refund.
- Payments card shows Authorized, Captured, Refunded, Outstanding amounts (₹514.06 authorized/outstanding).
- Role-mode switch has Admin, Seller, App, Web controls.
- Seller mode shows Seller-view banner and hides native Medusa payment controls.
- App mode shows Customer-app-view banner.
- Web mode shows Customer-web-view banner.
- Admin mode shows Admin-view banner, native payment controls, and Update delivery status action.

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

- `client-projects/client101/evidence/CHG-096/staging-admin-qc.json`
- `client-projects/client101/evidence/CHG-096/staging-admin-qc.mjs`
- `client-projects/client101/evidence/CHG-096/screenshots/`
- `client-projects/client101/changes/CHG-096.yaml`
