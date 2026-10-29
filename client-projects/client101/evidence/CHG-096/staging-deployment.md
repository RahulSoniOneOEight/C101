# CHG-096 — Staging deployment and Admin order-detail QC

**Status:** STAGING DEPLOYED AND VERIFIED
**Change:** CHG-096 Revision 1 — Admin order-detail top-chrome, Admin-only page
**Environment:** staging only. Production is not authorized and was not touched.
**Deploy owner:** requester-authorized OpenCode agent
**Completed:** 2026-10-29

---

## 1. Release identity

| Item | Value |
|---|---|
| Baseline before release | `/opt/buildkart-releases/release-b7f93b9` (`b7f93b9`, CHG-094) |
| Target branch | `release/chg-096-7` |
| Release commit | `6c776fc60223668ab40d07fe93a95658bced5219` |
| Commit range | `b7f93b9..6c776fc` — Admin top-chrome changes only |
| Release worktree | `/opt/buildkart-releases/release-6c776fc` |
| Current symlink | `/opt/buildkart-releases/current -> release-6c776fc` |
| Rollback release | `/opt/buildkart-releases/release-b7f93b9` |
| Rollback image | `buildkart-hosted-pilot-medusa:rollback-b7f93b9` (`sha256:7db0f1e59c82`) |
| New image | `buildkart-hosted-pilot-medusa:latest` (`sha256:89d711b7801a`) |
| Production release | Not authorized |

## 2. What changed

Scoped to `services/backend/apps/admin/src/components/order-preview/index.tsx` and the two Admin widgets:

- **Removed the Admin/Seller/App/Web role-preview banner.**
  - Admin and Seller are separate portals, so the Admin order page no longer exposes a role preview or `previewMode` query parameter.
  - Removed `PreviewModeBanner`, `RoleModeSwitch`, `PerspectiveBanner`, `usePreviewMode` and `usePreviewModeUrl`.
- **Admin-only order operations:**
  - Four-tile Payment / Delivery / Returns / Refund status strip.
  - Payments card with Authorized / Captured / Refunded / Outstanding amounts.
  - Reconciliation card summarizing Payment / Delivery / Returns / Refund.
  - "Payment ready to capture" attention item for authorized payments.
  - Jump-to section nav.
- **Simplified delivery and returns widget** to Admin behavior only; native Medusa payment, delivery and return actions remain intact.
- Removed the redundant subtitle under "Order operations" and reduced top-chrome vertical spacing.

## 3. What was NOT changed

- `services/backend/apps/admin/fulfillment-preview*` harness — left untouched as reference.
- Customer web, seller portal, experience API, Medusa modules, database schema.
- Native Medusa order actions (Capture payment, Update delivery status, Return workbench).
- Production.

## 4. Deployment procedure

1. Acquired `/var/lock/buildkart-staging-deploy` (deploy owner: requester-authorized OpenCode agent).
2. Created scoped release branch `release/chg-096-7` from baseline `b7f93b9` and cherry-picked the Admin top-chrome commits.
3. Built a fresh Medusa backend image (`medusa-api` + `medusa-worker`) with `--no-cache`.
4. Switched `/opt/buildkart-releases/current` to `release-6c776fc`, recreated Medusa containers, and restarted the proxy.
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

Main admin bundle `/dashboard/assets/index-Dy-CzoEn.js`:

Present:

- `Order operations` ✅
- `System reconciliation` ✅
- `One flow, independently verifiable effects` ✅
- `Ready to capture` ✅
- `No refund issued` ✅

Removed:

- `Preview as` ✅
- `Admin view` ✅
- `Seller view` ✅
- `Customer app view` ✅
- `Customer web view` ✅
- `You see payment, delivery and return operations across the marketplace.` ✅

### 5.3 Browser QC

Run: `node client-projects/client101/evidence/CHG-096/staging-admin-qc.mjs`

Reference order: `#151` / `BK-261029-WT4R93` / `order_01M633BSHHWEMM9YT6K5S7PVCZ` / group `og_01M633BSJSH4023AHJPCKHNNKA`.

Summary: **28/28 PASS**; 0 console errors; 0 unexpected failed requests.

Checked per viewport (desktop + mobile):

- Login succeeds and order page loads.
- No horizontal document overflow.
- Admin status strip shows Payment / Delivery / Returns / Refund.
- Payments card shows Authorized, Captured, Refunded, Outstanding amounts (₹514.06 authorized/outstanding).
- Role-preview banner is absent.
- Seller / App / Web preview links are absent.
- Jump-to section nav is present.
- Reconciliation card is present.
- "Payment ready to capture" attention item is present.
- Native Medusa payment controls are present.
- Delivery update control is present.

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
