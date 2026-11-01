# Staging release register

**Purpose:** one place that answers “what is actually live on staging right now?” without reading
chat history or commit logs. Update it after every deploy and after every accepted-change review.

- **Last verified:** 2026-11-01 10:55 IST (`2026-11-01T05:25Z`)
- **Verified by:** live bundle hash + browser probes + container image ids
- **Rule:** the live web build is identified by its banner and `main.dart.js` hash, not by the
  branch head. Branch heads move for docs-only commits; the banner does not.

## 1. Live now

| Surface | Live build | Artifact | Notes |
|---|---|---|---|
| Web (Firebase hosting) | **`ec92f03`** | `main.dart.js` 3,985,130 bytes · SHA-256 `48296a6a2e190eae58701bfd55a76d455bb4c3816942ee3ab86785d387ba9e0f` · banner `STAGING · ec92f03` | U-019 facets + PDP product type + U-011/U-017 fixes |
| Experience API | **`e4145643172a`** | image built from `3d2bdff` | order address + completion `order_number`/`total_minor` (QC 1–8) |
| Workspace service | **`5fc663e283dd`** | image built from `9003721` | B2B invitations / join / 10 seats (chat parity) |
| Medusa API + worker | **`f0dc0126f5de`** | built from `release-u014-9a3592aea` | U-013 price fix + U-014 option integrity in admin + vendor panels |
| Postgres | `postgres:16.15-alpine` | unchanged | staging data only |
| Release dir on host | `current → release-u014-9a3592aea` | — | newest deployed service code; experience-api still runs the `3d2bdff` image |
| Android (pilot artifact) | **`app-release-ec92f03.apk`** | 63,368,411 bytes · SHA-256 `807f140e0809c39b424ff20c1ddd7d3c962ce05ff9c9740ef583bcc56774bf63` · `CN=BuildKart Staging` | `D:\C101-control-room\artifacts\U-007-U-009\app-release-ec92f03.apk` (matches web `ec92f03`) |
| Production | untouched | — | no production release in this line |

## 2. Update log

Newest first. “Live” means verified against the surface above, not merely merged.

| Date | Update | Commits | Live? | What it changed |
|---|---|---|---|---|
| 2026-11-01 | **B2B image cleanup** | data-only (`u024_backup_*_20261101`) | **YES** | 8 test/QC products archived; B2B catalogue 14 → 6 with 0 missing thumbnails; Sumsan thumbnail URL fixed |
| 2026-11-01 | **Product type on the PDP** | `ec92f03` + data (`u022_product_type_backup_20261101`) | **YES** | Studio `product_type` now renders as Type / Product type on the PDP; 5 products populated |
| 2026-11-01 | **U-019 — Browse facets** | `734ac6f`; merged as `c3ca7bc`; released as `df32714` | **YES** | Data-backed sort (Discount), category/brand/seller/availability counts, price range slider, removable chips, Show N |
| 2026-11-01 | **PDP add-to-cart fix + benchmark batch** | `59e8796`, `ebf5b92` | **YES** | Add gives visible feedback (toast 1.8 s, “Added” state, cart badge), qty stepper, breadcrumb, share |
| 2026-11-01 | **U-015 — Smoke cleanup** | data-only (backup `u015_backup_*_20261101`) | **YES** | Three allowlisted Smoke products archived (`status=draft`, channels detached); published count 263 → 260 |
| 2026-11-01 | **U-014 — option integrity** | `9a3592a`; merged as `fa9d0ab`; image `f0dc0126f5de` | **YES** + data repair | Variant options filled from titles instead of deadlocking; hint/message fixed; IPHONE 17 (Black/White) and Sumsan (Blue/Black/White) options + links + ranks repaired |
| 2026-11-01 | **U-017 — PDP gallery + layout** | `cf0471a`; merged as `4d82db9`; released as `3e28237` | **YES** | 4:3 image slider with labelled demo slides, secondary Discuss, sticky Add/Buy bar, price comparison below specs |
| 2026-11-01 | **U-013 — price units** | `0be813c`, `b4f06f8` (image `679ca5cc5a0c` → container `5126a60f7ebe`) | **YES** + data repair applied | admin/vendor save minor units, response converted back, <10% guard, bulk path fixed; IPHONE 17 repaired to ₹1,85,000 / ₹1,95,000 |
| 2026-11-01 | **U-011 / B005 — Browse layout** | `259c0ec`, `04176d5`, `a5481b4`; merged as `6d1963f`; released as `e3cb365` | **YES** | Browse tiles 0.64 (160×250 / 175×273 / 187×292), duplicate “Recommended for you” strip removed, B2C control bar unpinned, 8/8/16 rhythm, 64 px category rail at ≤390, Home grids/rails at 0.64 |
| 2026-11-01 | **B2B chat/discuss parity** | `7cc48c5`, `9003721` | **YES** | Business workspaces get invitations (admin/buyer), join-on-accept, 10 seats, “Join your procurement workspace” dock state, “Workspace participants” sheet |
| 2026-10-31 | **QC fixes 1–8** | `3d2bdff` | **YES** (web superseded by `9003721`, which contains it; API image is built from it) | money reconciliation, order address, confirmation number/total, pluralisation, Indian grouping, sticky checkout CTA, auto delivery fee, quantity semantics |
| 2026-10-31 | U-007 tile restore + translucent controls | `293d75d`, `dacc4f9` | **YES** (inside `9003721`) | B2C product card layout and 55%/72% control discs |

Evidence: `client-projects/client101/evidence/U-007/update-note-2026-10-31.md` (§8–§10) and
`client-projects/client101/evidence/U-011/closeout.md`.

## 3. Verification performed (2026-11-01, after U-014 + U-015)

```text
web main.dart.js   3,939,895 bytes  sha256 d6ec1f19…cc1805   banner STAGING · 3e28237
GET /health        {"status":"ok","environment":"staging","pilot_user_count":21}
medusa-api         f0dc0126f5de   (healthy, built from release-u014-9a3592aea)
workspace          5fc663e283dd   (unchanged, healthy)
experience-api     e4145643172a   (unchanged, healthy)
current            /opt/buildkart-releases/release-u014-9a3592aea
```

| Check | Live result |
|---|---|
| IPHONE 17 options | Color linked; BLACK→Black rank 0, WHITE→White rank 1 |
| Sumsan Fold 7 options | Color linked; Blue rank 0, Black rank 1, White rank 2 |
| `product_variant_option` rows | **5** for the two products (was 0) |
| `__default__` | retired for both multi-variant products; Smoke 134657 keeps its default |
| Smoke archive | the three IDs return **404** on `/v1/products/{id}`; published count **263 → 260** |
| Sumsan storefront | 3 variants, ₹1,48,000 / ₹1,50,000 / ₹1,55,000 — unchanged |
| IPHONE prices | ₹1,85,000 / ₹1,95,000 — unchanged |
| Product images | `static` 200 after the proxy reload |
| B2C QC order | **BK-261101-P7Q3WJ** — ₹432 + ₹99 − ₹21.60 = ₹509.40 | PASS |
| Full-flow re-QC | **BK-261101-GE0K30** (B2C) · **og_01M6BPD2Z90N88SKNRNEE8TVJE** (B2B, ₹431.50) | PASS |
| B2B QC order | **og_01M6ASXQ0D0J4AZFR8H4CA36QQ** — ₹350 − ₹17.50 + ₹99 = ₹431.50, GST invoice | PASS |
| Release note / QC report | `evidence/release-notes/2026-11-01-u013-u017.md`, `evidence/qc/2026-11-01-order-flows.md` | stored |
| Production | untouched |

## 4. Not live / open

| Item | Status | Blocked on |
|---|---|---|
| APK distribution to testers | artifact ready (`app-release-ec92f03.apk`) | Firebase App Distribution has no tester group configured |
| Four extra Smoke products (707433, 208869, 685854, 712935) | still published | outside the U-015 allowlist — needs a follow-up allowlist |
| U-014 studio create→reload UI pass | deferred | no admin credentials in the worker session |
| Seat role promote/demote in-app | not built | backlog (B2B chat parity follow-up) |
| Dock real-time via WebSocket | not built | backlog (dock polls every 6 s) |
| Real `images[]` (U-017 phase 2) | not built | API + photo content |

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
| Medusa (U-014) | same, from `release-u013-0be813c47` (image `5126a60f7ebe`); reload the proxy |
| U-013 price repair | `insert into price select * from u013_price_backup_20261101;` per row (backup table holds the pre-repair rows) |
| U-014 option repair | restore `u014_backup_ppo/ppov/pv/pvo/po/poval_20261101` (six tables) and reapply `variant_rank` from `u014_backup_pv_20261101` |
| U-015 archive | reinsert `u015_backup_product_20261101` (status) and `u015_backup_channel_20261101` (channel links) |
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
