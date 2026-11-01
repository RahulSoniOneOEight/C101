# Release note — U-019 Browse facets (2026-11-01)

**Live web:** `df32714` · 3,984,874 bytes · SHA-256 `288edc1be57f77ae771f4bd8de4dd04978e0c9ba8c1a5be6b06de314fabe16cc`
**Scope:** B2C Browse only. No API, DB, admin or B2B change.

## What shipped

| Item | Detail |
|---|---|
| **Sort** | Relevance · Price ↑ · Price ↓ · **Discount** (real list price only). **Rating removed** (no review data); Popularity and Newest stay hidden until order/`created_at` data exists. |
| **Category facet** | Rail categories + “Uncategorised”, each with a live count; selecting one filters immediately, “All categories” clears it. |
| **Price facet** | Dual range slider over the catalogue min/max, preset chips (`< ₹500`, `₹500 – ₹5,000`, `₹5,000+`) and “Any price”. |
| **Brand facet** | Multi-select with counts. |
| **Seller facet** | Multi-select with counts, derived from the variant `seller_name`; hidden when no seller is named. |
| **Availability facet** | In stock / On discount with counts. |
| **Active chips** | Removable chips for every applied facet plus a clear-filters (backspace) action. |
| **Footer** | Reset + “Show N results”, wired to the live preview count. |

## Deviations / not shipped

| Item | Why |
|---|---|
| Sticky 48 px control bar | U-011 deliberately unpinned the 102 px bar to reclaim the grid. A compact sticky bar is a separate layout task; the bar remains unpinned for now. |
| **Fast delivery** toggle + tile speed line | Needs `eta_max_days` on the composed product — not in the API. Hidden by design until the data lands (no empty facets). |
| **Seller location** facet | Needs `seller_location.state_name` + the “No location on file” bucket; hidden until B010 data exists. |
| “Delivers to” pincode check | Needs a browse-level serviceability read (today it is cart/address scoped). |
| Brand search box, min/max price inputs | Follow-ups; counts and slider are in. |
| B2B facets | B2B keeps its own sort/filter bar (Recommended / Price / Discount + category + price band). A trade-specific facet set (MOQ, GST, credit, rate band) is a separate pass. |

## Verification

```text
flutter analyze     clean
flutter test        314/314 (new facet test: category/seller/availability counts, Show N)
live web            SORT: Relevance · Price ↑ · Price ↓ · Discount (Rating absent)
                    SHEET: Category · Price slider · Brand · Seller · Availability with counts
                    Footer: Show N results
```

Screenshots: `evidence/qc/screenshots/u019_browse.png`, `u019_filters.png`.

## Rollback

Redeploy `71421f2` or `firebase hosting:rollback --project buildkart-staging`. No data change.

## APK

`app-release-df32714.apk` · 63,368,411 bytes · SHA-256
`72747df57e5f8bff8f16633fdc55660a113b69b329e038412465a6d8b6dafbb2` · `CN=BuildKart Staging`,
at `D:\C101-control-room\artifacts\U-007-U-009\`. Build id `df32714` verified inside the package.
