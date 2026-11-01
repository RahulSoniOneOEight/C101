# Staging release register

**Purpose:** one place that answers “what is actually live on staging right now?” without reading
chat history or commit logs. Update it after every deploy and after every accepted-change review.

- **Last verified:** 2026-11-01 10:05 IST (`2026-11-01T04:35Z`)
- **Verified by:** live bundle hash + browser probes + container image ids
- **Rule:** the live web build is identified by its banner and `main.dart.js` hash, not by the
  branch head. Branch heads move for docs-only commits; the banner does not.

## 1. Live now

| Surface | Live build | Artifact | Notes |
|---|---|---|---|
| Web (Firebase hosting) | **`3e28237`** | `main.dart.js` 3,939,895 bytes · SHA-256 `d6ec1f1920fdabec43c7abd8f5a38324258fcda146273b93bd9c09d6bdcc1805` · banner `STAGING · 3e28237` | U-011 + U-017 + chat parity in one bundle; local and live byte-identical |
| Experience API | **`e4145643172a`** | image built from `3d2bdff` | order address + completion `order_number`/`total_minor` (QC 1–8) |
| Workspace service | **`5fc663e283dd`** | image built from `9003721` | B2B invitations / join / 10 seats (chat parity) |
| Medusa API + worker | **`5126a60f7ebe`** | built from `release-u013-0be813c47` | U-013 price-unit fix in admin + vendor panels |
| Postgres | `postgres:16.15-alpine` | unchanged | staging data only |
| Release dir on host | `current → release-u013-0be813c47` | — | newest deployed service code; experience-api still runs the `3d2bdff` image |
| Android (pilot artifact) | **`app-release-e3cb365.apk`** | 62,942,271 bytes · SHA-256 `168effb33ce291ceef0196bcb9006f4e403cfb3889c4f8921023f5f14c4ba23a` · `CN=BuildKart Staging` | `D:\C101-control-room\artifacts\U-007-U-009\app-release-e3cb365.apk`; not yet distributed |
| Production | untouched | — | no production release in this line |

## 2. Update log

Newest first. “Live” means verified against the surface above, not merely merged.

| Date | Update | Commits | Live? | What it changed |
|---|---|---|---|---|
| 2026-11-01 | **U-017 — PDP gallery + layout** | `cf0471a`; merged as `4d82db9`; released as `3e28237` | **YES** | 4:3 image slider with labelled demo slides, secondary Discuss, sticky Add/Buy bar, price comparison below specs |
| 2026-11-01 | **U-013 — price units** | `0be813c`, `b4f06f8` (image `679ca5cc5a0c` → container `5126a60f7ebe`) | **YES** + data repair applied | admin/vendor save minor units, response converted back, <10% guard, bulk path fixed; IPHONE 17 repaired to ₹1,85,000 / ₹1,95,000 |
| 2026-11-01 | **U-011 / B005 — Browse layout** | `259c0ec`, `04176d5`, `a5481b4`; merged as `6d1963f`; released as `e3cb365` | **YES** | Browse tiles 0.64 (160×250 / 175×273 / 187×292), duplicate “Recommended for you” strip removed, B2C control bar unpinned, 8/8/16 rhythm, 64 px category rail at ≤390, Home grids/rails at 0.64 |
| 2026-11-01 | **B2B chat/discuss parity** | `7cc48c5`, `9003721` | **YES** | Business workspaces get invitations (admin/buyer), join-on-accept, 10 seats, “Join your procurement workspace” dock state, “Workspace participants” sheet |
| 2026-10-31 | **QC fixes 1–8** | `3d2bdff` | **YES** (web superseded by `9003721`, which contains it; API image is built from it) | money reconciliation, order address, confirmation number/total, pluralisation, Indian grouping, sticky checkout CTA, auto delivery fee, quantity semantics |
| 2026-10-31 | U-007 tile restore + translucent controls | `293d75d`, `dacc4f9` | **YES** (inside `9003721`) | B2C product card layout and 55%/72% control discs |

Evidence: `client-projects/client101/evidence/U-007/update-note-2026-10-31.md` (§8–§10) and
`client-projects/client101/evidence/U-011/closeout.md`.

## 3. Verification performed (2026-11-01, after the U-013 + U-017 deploy)

```text
web main.dart.js   3,939,895 bytes  sha256 d6ec1f19…cc1805   banner STAGING · 3e28237
GET /health        {"status":"ok","environment":"staging","pilot_user_count":21}
medusa-api         5126a60f7ebe   (healthy, image built from release-u013-0be813c47)
workspace          5fc663e283dd   (unchanged, healthy)
experience-api     e4145643172a   (unchanged, healthy)
current            /opt/buildkart-releases/release-u013-0be813c47
```

| Check | Live result |
|---|---|
| IPHONE 17 WHITE price | **₹1,95,000** vs ₹2,00,000 (3% off) — API `unit_amount_minor 19,500,000` |
| IPHONE 17 BLACK price | **₹1,85,000** — API `unit_amount_minor 18,500,000` |
| DB rows after repair | `amount 185000 / 195000`, `raw_amount.value` synced |
| Price guard | shipped in the admin/vendor bundle (`priceUnitWarning` + confirm) |
| PDP gallery (IPHONE 17) | 4 slides, counter `3 / 4`, **Representative image** chip, Pexels slide renders |
| PDP actions | Add to Cart + Buy Now, secondary **Discuss this product**, sticky bar Add/Buy only |
| PDP sections | price → variants → CTA → trust → specs → description → full specs → price comparison |
| Console / HTTP errors | 0 after fixing the nginx upstream (see §7) |
| B2B goldens | unchanged |
| `current` symlink | `release-u013-0be813c47` |
| Production | untouched |

## 4. Not live (pending)

| Item | Status | Blocked on |
|---|---|---|
| U-014 option integrity (B007) | not started | next bundle in the P0→P1→P2 sequence |
| U-015 smoke cleanup (B008) | not started | data-only, after U-014 |
| APK for `3e28237` | not built | only the `e3cb365` artifact exists so far |
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
| Medusa (U-013) | `docker compose up -d --no-deps medusa-api medusa-worker` from `release-9003721` (image `c1021b0b0be1`) |
| U-013 price repair | `insert into price select * from u013_price_backup_20261101;` per row (backup table holds the pre-repair rows) |
| APK | re-distribute `app-release-e3cb365.apk` |

## 7. Maintenance rules

1. Every deploy updates §1 (hashes, image ids) and adds a §2 row — even for a docs-only or partial
   deploy.
2. Every “not live” item moves to §2 only after the live hash/banner proves it.
3. Never write a build id that differs from the committed release line; never deploy without
   `BUILD_ID`.
4. If a surface runs a different commit than `current`, record it (§1 notes do this today for the
   API `3d2bdff` vs workspace `9003721`).
5. **After recreating any container behind nginx, reload the proxy**
   (`docker exec buildkart-hosted-pilot-proxy-1 nginx -s reload`). On 2026-11-01 the Medusa recreate
   left `ops-staging` pointing at the old container IP and every product image returned 502 until the
   reload.
