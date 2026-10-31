# Staging release register

**Purpose:** one place that answers “what is actually live on staging right now?” without reading
chat history or commit logs. Update it after every deploy and after every accepted-change review.

- **Last verified:** 2026-11-01 02:05 IST (`2026-10-31T20:35Z`)
- **Verified by:** live bundle hash + browser probes + container image ids
- **Rule:** the live web build is identified by its banner and `main.dart.js` hash, not by the
  branch head. Branch heads move for docs-only commits; the banner does not.

## 1. Live now

| Surface | Live build | Artifact | Notes |
|---|---|---|---|
| Web (Firebase hosting) | **`e3cb365`** | `main.dart.js` 3,932,303 bytes · SHA-256 `ad7c7ec1cf924d5cf853cda57ecc18092c997e3cb1f1cf217e14890853f4b161` · banner `STAGING · e3cb365` | U-011 + chat parity in one bundle; local and live byte-identical |
| Experience API | **`e4145643172a`** | image built from `3d2bdff` | order address + completion `order_number`/`total_minor` (QC 1–8) |
| Workspace service | **`5fc663e283dd`** | image built from `9003721` | B2B invitations / join / 10 seats (chat parity) |
| Medusa API + worker | **`c1021b0b0be1`** | unchanged since 2026-10-31T08:32Z | no image rebuild in the recent updates |
| Postgres | `postgres:16.15-alpine` | unchanged | staging data only |
| Release dir on host | `current → release-9003721` | — | repointed 2026-11-01; API still runs the `3d2bdff` image |
| Android (pilot artifact) | **`app-release-e3cb365.apk`** | 62,942,271 bytes · SHA-256 `168effb33ce291ceef0196bcb9006f4e403cfb3889c4f8921023f5f14c4ba23a` · `CN=BuildKart Staging` | `D:\C101-control-room\artifacts\U-007-U-009\app-release-e3cb365.apk`; not yet distributed |
| Production | untouched | — | no production release in this line |

## 2. Update log

Newest first. “Live” means verified against the surface above, not merely merged.

| Date | Update | Commits | Live? | What it changed |
|---|---|---|---|---|
| 2026-11-01 | **U-011 / B005 — Browse layout** | `259c0ec`, `04176d5`, `a5481b4`; merged as `6d1963f`; released as `e3cb365` | **YES** | Browse tiles 0.64 (160×250 / 175×273 / 187×292), duplicate “Recommended for you” strip removed, B2C control bar unpinned, 8/8/16 rhythm, 64 px category rail at ≤390, Home grids/rails at 0.64 |
| 2026-11-01 | **B2B chat/discuss parity** | `7cc48c5`, `9003721` | **YES** | Business workspaces get invitations (admin/buyer), join-on-accept, 10 seats, “Join your procurement workspace” dock state, “Workspace participants” sheet |
| 2026-10-31 | **QC fixes 1–8** | `3d2bdff` | **YES** (web superseded by `9003721`, which contains it; API image is built from it) | money reconciliation, order address, confirmation number/total, pluralisation, Indian grouping, sticky checkout CTA, auto delivery fee, quantity semantics |
| 2026-10-31 | U-007 tile restore + translucent controls | `293d75d`, `dacc4f9` | **YES** (inside `9003721`) | B2C product card layout and 55%/72% control discs |

Evidence: `client-projects/client101/evidence/U-007/update-note-2026-10-31.md` (§8–§10) and
`client-projects/client101/evidence/U-011/closeout.md`.

## 3. Verification performed (2026-11-01, after the U-011 deploy)

```text
web main.dart.js   3,932,303 bytes  sha256 ad7c7ec1…f4b161   banner STAGING · e3cb365
GET /health        {"status":"ok","environment":"staging","pilot_user_count":21}
workspace image    5fc663e283dd   (unchanged, still up)
experience-api     e4145643172a   (unchanged, still up)
medusa             c1021b0b0be1   (unchanged, still up)
current            /opt/buildkart-releases/release-9003721
```

| Check | Live result |
|---|---|
| Browse “Recommended for you” strip | **absent** at 360 / 390 / 414 |
| Browse first grid tile @390 | **y = 545** (scroll-frame **489**) — was 813 before U-011 |
| Browse tile widths | 160 / 175 / 187 at 360 / 390 / 414 |
| Browse category rail | 64 px items at 360 & 390 (five fit), 72 px at 414 |
| Console / page / HTTP errors | **0** across login → Browse → Home and the B2B dock |
| B2B dock: Manage participants, Project actions, composer, Assistant tab | all present → chat parity survived the merge |
| B2B workspace participants (API) | **3 of 10** |
| B2B approver can manage participants | **403** (correct) |
| B2C household participants (API) | **2 of 3** |
| `current` symlink | `release-9003721` (was `release-3d2bdff`) |
| Production | untouched |

## 4. Not live (pending)

| Item | Status | Blocked on |
|---|---|---|
| U-011 signed APK distribution to testers | artifact built and signed for `e3cb365` (`168effb3…4ba23a`) | Firebase App Distribution tester group not defined — hand out via the artifact path until then |
| Seat role promote/demote in-app | not built | backlog (B2B chat parity follow-up) |
| Dock real-time via WebSocket | not built | backlog (dock polls every 6 s) |

## 5. How U-011 was shipped (record)

The branch was based on `3d2bdff` while staging was `9003721`; deploying the branch head directly
would have dropped the chat parity. The release was therefore built from a merge:

```sh
git checkout feat/u009-pincode-delivery
git merge --no-ff feat/u011-browse-spacing      # 6d1963f, conflict-free
# manifest entry + checker  → e3cb365, all 10 required changes PASS
python tooling/build_staging_web.py --build-id e3cb365 --require-clean
firebase deploy --only hosting --project buildkart-staging
```

Post-deploy steps that were completed: banner + hash matched, Browse re-measured, B2B dock re-checked,
`U-011 browse layout (6d1963f)` added to `tooling/staging_release_manifest.json`, this register updated.

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
