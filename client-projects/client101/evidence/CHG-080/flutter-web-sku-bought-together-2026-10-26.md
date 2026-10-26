# Evidence — Flutter web SKU-scoped Bought Together release

- **Change:** CHG-080-FU2
- **Date:** 2026-10-26
- **Environment:** staging only; production unauthorized and untouched
- **Surface:** `https://buildkart-staging.web.app`
- **Lane / release mechanism:** B / `static-ui` (Flutter web on Firebase Hosting)

## 1. Outcome and scope

Completed the existing Bought Together implementation on the canonical Flutter web storefront.
The selected SKU now scopes the pair request, a paired SKU renders the existing section, and a
sibling SKU hides it. No other storefront feature was changed.

The scoped release is based directly on the previously deployed web commit `e691744`. Its only
commit is `8150e0e` on `fix/webstore-bt-sku-firebase`, with these paths:

- `apps/prototype_app/lib/data/experience_api.dart`
- `apps/prototype_app/lib/providers/catalog_providers.dart`
- `apps/prototype_app/lib/screens/b2b_quote_screens.dart`
- `apps/prototype_app/lib/screens/product_detail_screen.dart`
- `apps/prototype_app/lib/widgets/bought_together_section.dart`
- `apps/prototype_app/test/bought_together_provider_test.dart`

Release diff: 6 paths, 92 insertions and 10 deletions (73 inserted lines are the focused regression
test). Authentication, navigation, search, catalogue, cart, checkout, orders, account, API, schema,
admin and infrastructure code are absent from the release diff.

## 2. Baseline and defects found

The live Firebase bundle was build `e691744` (SHA-256
`8edf24d888171c98c7657b53e6c2870cbf02ee5ddb0965d3037160537b4befb8`). It contained the existing
Bought Together UI but called the endpoint with `channel` only. The current SKU-level API therefore
returned `pair_id: null` and the section remained hidden.

The first scoped preview then exposed a second feature-local lifecycle defect: the SKU request
returned the correct pair and parsed successfully, but `FutureProvider.autoDispose` discarded the
in-flight result when the zero-height loading child temporarily left the lazy PDP viewport. The
provider is now retained for the app session by using `FutureProvider.family`. It remains fail-soft:
request or parsing errors still resolve to `null` and never block the PDP.

## 3. Verification before deployment

| Gate | Result |
|---|---|
| Scoped diff from live `e691744` | PASS — one commit, six Bought Together paths only |
| `flutter analyze` | PASS — no issues |
| Focused parsing + provider tests | PASS — 3/3 |
| Full Flutter suite | PASS — 281/281 |
| Flutter web release build | PASS |
| Final artifact | 3,916,569 bytes; SHA-256 `ea044752767511077849c1e508f5e0b0368518161116d89dfcb37014a873c144` |
| Compiled build marker | `STAGING · 8150e0e` |
| Compiled request | adds `sku` to `/v1/products/{id}/bought-together` |

The build emitted the existing non-fatal Cupertino font warning and completed successfully. No
dependency or lockfile changed.

## 4. Hosted acceptance

Product: `1/2in Drive 24 Pcs Socket Set`
(`prod_01M59JHKBZ41EJTYW3X6MCXZC6`), B2C.

| Case | Runtime result |
|---|---|
| Paired SKU `BAUM-237S1-SET-HEX` | request includes the SKU; HTTP 200; pair `btp_710026edf43347c9a92bed32f58a7eba`; card shows `1 Light Diamond Cut Pendant` |
| Sibling SKU `BAUM-237S1-SET-BI-HEX` | request includes the sibling SKU; HTTP 200; `pair_id: null`; section hidden |
| Paired SKU price | ₹3990, unchanged |
| Sibling SKU price | ₹4275, unchanged |
| 390×844 paired render | PASS — no overflow |
| 390×844 unpaired render | PASS — specifications flow directly to Related products |
| 1440×1200 paired render | PASS — no horizontal overflow (`documentWidth == viewportWidth == 1440`) |
| Console errors | 0 across paired, unpaired and desktop checks |
| Failed requests | 0 across paired, unpaired and desktop checks |

Screenshots:

- `screenshots/flutter-web-bt-paired-390x844.png`
- `screenshots/flutter-web-bt-unpaired-390x844.png`
- `screenshots/flutter-web-bt-paired-1440x1200.png`

No login, cart, order, payment or catalogue data write was performed during acceptance.

## 5. Deployment

- Firebase project/site: `buildkart-staging`
- Release commit: `8150e0e5dbb29e27100d2724f244cf1a8b6091f8`
- Firebase release completed: 2026-10-26 10:11:56 UTC
- Files published: 39
- Live bundle hash equals the built artifact hash exactly.
- Post-deploy endpoints:
  - `https://buildkart-staging.web.app/` — 200
  - `https://api-staging.pinakaplay.cloud/health` — 200
  - `https://ops-staging.pinakaplay.cloud/health` — 200
  - `https://ops-staging.pinakaplay.cloud/dashboard/` — 200
  - `https://app-staging.pinakaplay.cloud/` — 200

## 6. Rollback

Before deployment, Firebase live build `e691744` was cloned to:

- Channel: `pre-bt-sku-20261026`
- URL: `https://buildkart-staging--pre-bt-sku-20261026-xy4wn8mb.web.app`
- Verified bundle: `e691744`
- Channel expiry: 2026-11-02 15:41:33

Rollback command (from a repository with Firebase access):

```bash
firebase hosting:clone \
  buildkart-staging:pre-bt-sku-20261026 \
  buildkart-staging:live \
  --project buildkart-staging --non-interactive
```

## 7. Requirement ledger

| ID | Requirement | Status |
|---|---|---|
| R1 | Live Flutter request carries selected SKU | **PASS** |
| R2 | Paired SKU renders the existing Bought Together card | **PASS** |
| R3 | Unpaired sibling SKU hides the card | **PASS** |
| R4 | Other Flutter features remain unchanged | **PASS-CODE** — scoped diff plus 281/281 tests |
| R5 | Firebase staging deployment and health | **PASS** |

## 8. Residual notes

- Bought Together values are cached by product/channel/SKU for the current app session. A pairing
  changed by an operator during that already-open session becomes visible after page/app reload.
- The configured pair is B2C only because the Pendant SKU has no B2B trade price; B2B runtime display
  is therefore not applicable to this acceptance.
- Production remains blocked on explicit human authorization.
