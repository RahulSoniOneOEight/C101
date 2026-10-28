# CHG-091 — Staging deployment and browser QC

**Status:** STAGING DEPLOYED AND VERIFIED
**Change:** CHG-091 Revision 1 — customer returns index
**Environment:** staging only. Production is not authorized and was not touched.
**Completed:** 2026-10-29

---

## 1. Release identity

| Item | Value |
|---|---|
| Baseline before release | `/opt/buildkart-releases/release-bab4e51` (`bab4e51`, CHG-089) |
| Target branch | `release/chg-091` |
| Release commit | `92c0c4d9f` |
| Commit range | `bab4e51..92c0c4d` — three code files plus CHG-090/091 governance and evidence |
| Release worktree | `/opt/buildkart-releases/release-92c0c4d` |
| Current symlink | `/opt/buildkart-releases/current -> release-92c0c4d` |
| Rollback release | `/opt/buildkart-releases/release-bab4e51` |
| Rollback image | `buildkart-hosted-pilot-web:rollback-bab4e51` (`4250786d4468`) |
| New web image | `buildkart-hosted-pilot-web:latest` (`92f15d6f5907`) |
| Production | Not authorized, not touched |

No API or schema change. Only the customer web image was rebuilt and `web` recreated; `proxy` restarted.

---

## 2. Deploy checks

| Check | Result |
|---|---|
| No-cache web build | PASS |
| Marker in image | PASS — `Your return requests` in `/app/.next/server/app/returns/page.js` |
| `web` health | healthy |
| Running image | `sha256:92f15d6f5907…` |
| API / app / Admin / Seller | 200 / 200 / 200 / 200 |

---

## 3. Browser QC

**Result: 22/22 PASS**, 4 screenshots, zero console errors, zero unexpected failed requests, read-only.

| Check | 390×844 | 1440×900 |
|---|---|---|
| Owner sign-in | PASS | PASS |
| Returns navigation link | PASS | PASS |
| Returns index loads | PASS | PASS |
| Owner returns listed (3) | PASS | PASS |
| Status vocabulary | PASS | PASS |
| "not a refund" wording | PASS | PASS |
| Row links to detail | PASS | PASS |
| Detail opens from list | PASS | PASS |
| No overflow (index and detail) | PASS | PASS |
| CHG-089 "Start a return" still present | PASS | PASS |

No data was written; there is no fixture and no cleanup step.

Evidence: `staging-browser-qc.json`, `staging-screenshots/{desktop,mobile}/`,
`tools/staging-browser-qc.cjs`.

---

## 4. Rollback

```sh
docker tag buildkart-hosted-pilot-web:rollback-bab4e51 buildkart-hosted-pilot-web:latest
ln -sfn /opt/buildkart-releases/release-bab4e51 /opt/buildkart-releases/current
cd /opt/buildkart-releases/release-bab4e51/services/hosted
docker compose -f docker-compose.hosted.yml up -d --no-deps --force-recreate web
docker restart buildkart-hosted-pilot-proxy-1
```

No schema or data rollback is required.

---

## 5. Notes

- The empty state is code-reviewed but not reachable for this owner, who has three returns.
- Staging FCM remains disabled by CHG-090; this change does not affect notifications.
- Production remains unauthorized.
