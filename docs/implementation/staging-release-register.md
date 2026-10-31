# Staging release register

**Purpose:** one place that answers “what is actually live on staging right now?” without reading
chat history or commit logs. Update it after every deploy and after every accepted-change review.

- **Last verified:** 2026-11-01 01:51 IST (`2026-10-31T20:21Z`)
- **Verified by:** live bundle hash + browser probes + container image ids
- **Rule:** the live web build is identified by its banner and `main.dart.js` hash, not by the
  branch head. Branch heads move for docs-only commits; the banner does not.

## 1. Live now

| Surface | Live build | Artifact | Notes |
|---|---|---|---|
| Web (Firebase hosting) | **`9003721`** | `main.dart.js` 3,931,739 bytes · SHA-256 `627728b9d82dbccdd7b959cc85dd747ec306112ba0e0d9807f769c7fa7a69b82` · banner `STAGING · 9003721` | local build and live bundle are byte-identical |
| Experience API | **`e4145643172a`** | image built from `3d2bdff` | order address + completion `order_number`/`total_minor` (QC 1–8) |
| Workspace service | **`5fc663e283dd`** | image built from `9003721` | B2B invitations / join / 10 seats (chat parity) |
| Medusa API + worker | **`c1021b0b0be1`** | unchanged since 2026-10-31T08:32Z | no image rebuild in the recent updates |
| Postgres | `postgres:16.15-alpine` | unchanged | staging data only |
| Release dir on host | `current → release-3d2bdff`; `release-9003721` also present | — | API runs from `3d2bdff` code, workspace from `9003721` code |
| Android (pilot artifact) | **`app-release-9003721.apk`** | 62,942,271 bytes · SHA-256 `0f5f54b209d96acfd6cc4a618eaa637f3abe2af422357d2524f8cf9c2f3c3226` · `CN=BuildKart Staging` | `D:\C101-control-room\artifacts\U-007-U-009\app-release-9003721.apk` |
| Production | untouched | — | no production release in this line |

## 2. Update log

Newest first. “Live” means verified against the surface above, not merely merged.

| Date | Update | Commits | Live? | What it changed |
|---|---|---|---|---|
| 2026-11-01 | **U-011 / B005 — Browse layout** | `259c0ec`, `04176d5`, `a5481b4` (branch `feat/u011-browse-spacing`, base `3d2bdff`) | **NO — built and verified locally only** | Browse tiles 0.64 (160×250 / 175×273 / 187×292), duplicate “Recommended for you” strip removed, B2C control bar unpinned, 8/8/16 rhythm, 64 px category rail at ≤390, Home grids/rails at 0.64 |
| 2026-11-01 | **B2B chat/discuss parity** | `7cc48c5`, `9003721` | **YES** | Business workspaces get invitations (admin/buyer), join-on-accept, 10 seats, “Join your procurement workspace” dock state, “Workspace participants” sheet |
| 2026-10-31 | **QC fixes 1–8** | `3d2bdff` | **YES** (web superseded by `9003721`, which contains it; API image is built from it) | money reconciliation, order address, confirmation number/total, pluralisation, Indian grouping, sticky checkout CTA, auto delivery fee, quantity semantics |
| 2026-10-31 | U-007 tile restore + translucent controls | `293d75d`, `dacc4f9` | **YES** (inside `9003721`) | B2C product card layout and 55%/72% control discs |

Evidence: `client-projects/client101/evidence/U-007/update-note-2026-10-31.md` (§8–§10) and
`client-projects/client101/evidence/U-011/closeout.md`.

## 3. Verification performed (2026-11-01)

```text
web main.dart.js   3,931,739 bytes  sha256 627728b9…a69b82   banner STAGING · 9003721
GET /health        {"status":"ok","environment":"staging","pilot_user_count":21}
workspace image    5fc663e283dd   (started 2026-10-31T19:33:34Z)
experience-api     e4145643172a   (started 2026-10-31T17:28:45Z)
medusa             c1021b0b0be1   (started 2026-10-31T08:32:34Z)
```

| Check | Live result |
|---|---|
| B2B dock: **Manage participants** visible to the buyer | present |
| B2B dock: **Project actions** (Join with code) | present |
| B2B dock: chat composer | present |
| B2B workspace participants (API) | **3 of 10** (admin, buyer, approver) |
| B2B approver can manage participants | **403** (correct — approver is not a manager) |
| B2C household participants (API) | **2 of 3**, both invitations `accepted` |
| B2C Browse: “Recommended for you” strip | **still present** → U-011 not deployed |
| B2C Browse: first grid tile @390 | **y = 813**, 175 wide, 72 px rail items → the pre-U-011 layout |

## 4. Not live (pending)

| Item | Status | Blocked on |
|---|---|---|
| U-011 Browse layout (`feat/u011-browse-spacing`) | built, 305/305 tests, verified in a local production build | human deploy authorisation; must be merged onto the live release line first |
| U-011 signed APK | not built | deploy gate + protected keystore |
| Seat role promote/demote in-app | not built | backlog (B2B chat parity follow-up) |
| Dock real-time via WebSocket | not built | backlog (dock polls every 6 s) |

## 5. How to ship U-011 without losing the chat parity

The U-011 branch is based on `3d2bdff`, but live is `9003721`. **Do not deploy the branch head
directly** — it does not contain `7cc48c5`/`9003721`, so the B2B chat parity would disappear.

```sh
git checkout feat/u009-pincode-delivery        # live release line
git merge --no-ff feat/u011-browse-spacing     # verified conflict-free with `git merge-tree`
                                               # (2026-11-01; the tree hash moves with the head)
python tooling/check_staging_release_line.py --require-clean
python tooling/build_staging_web.py --build-id <merge-sha> --require-clean
firebase deploy --only hosting --project buildkart-staging
```

After the deploy:

1. Verify the banner shows `<merge-sha>` and the live `main.dart.js` hash equals the local build.
2. Re-check Browse at 390: first grid tile ≈ 489 px in the scroll frame, no “Recommended for you”.
3. Add the merge commit to `tooling/staging_release_manifest.json` so it cannot be reverted.
4. Update this register (§1 and §2).

## 6. Rollback

| Surface | Rollback |
|---|---|
| Web | `firebase hosting:rollback --project buildkart-staging`, or rebuild/deploy `9003721` |
| Workspace service | rebuild `release-3d2bdff` and `docker compose up -d --no-deps workspace` (B2B invite routes return 403 again; memberships stay) |
| Experience API | rebuild `release-e12f6f7` (prior image `94818d572a3d` if still present) |
| APK | re-distribute `app-release-9003721.apk` |

## 7. Maintenance rules

1. Every deploy updates §1 (hashes, image ids) and adds a §2 row — even for a docs-only or partial
   deploy.
2. Every “not live” item moves to §2 only after the live hash/banner proves it.
3. Never write a build id that differs from the committed release line; never deploy without
   `BUILD_ID`.
4. If a surface runs a different commit than `current`, record it (§1 notes do this today for the
   API `3d2bdff` vs workspace `9003721`).
