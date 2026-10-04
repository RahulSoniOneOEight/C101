# Session note — 2026-10-04 (f) — Quick Order "Add SKU to list" save state

## Input
In the B2B Quick Order → list journey, "Add SKU to list" had no save state: the
addition lived only in the screen's memory and was lost on navigation, and it
never reached the normal list view.

## Root cause
`B2BQuickOrderCenterScreen` seeded its own mutable `_QList` copies from
`procurementListsProvider` (a plain, non-persisted `Provider`) and mutated them
locally. Nothing was written to storage, so edits did not survive navigation and
were invisible to `ProcurementListDetailScreen`.

## Fix — persist + save state
- **Model JSON:** `ProcurementListItem` / `ProcurementList` gained
  `toJson`/`fromJson` (+ `ProcurementList.copyWith`).
- **Storage:** `LocalStore` gained `readProcurementLists` / `writeProcurementLists`
  / `hasProcurementLists` (JSON in SharedPreferences).
- **Provider:** `procurementListsProvider` is now a persisted
  `ProcurementListsNotifier` (seeded once, then read/written) with
  `addSku` / `removeSku` / `createList` / `renameList` / `deleteList`. It
  degrades gracefully to an in-memory seed when no store is available (tests).
- **Save state:** new `listsSaveStateProvider` (`idle → saving → saved`); the
  Quick Order Center shows a **"Saving… / Saved"** indicator in the app bar after
  every edit.
- **View/normal list flow:** the Quick Order Center commits through the
  notifier, so `ProcurementListDetailScreen` (the normal list view) reflects the
  added SKU immediately, and a **"View list"** action in the app bar opens it
  directly (`/b2b/procurement-list/:id`).
- The screen now derives its working view from the persisted source on every
  build, so the added SKU flips the row to "Remove from list" and shows
  "In: <list>".

## Files
- `lib/domain/b2b_trade_models.dart` — list/item JSON + copyWith.
- `lib/data/local_store.dart` — procurement-list persistence.
- `lib/providers/b2b_trade_providers.dart` — persisted notifier + save state.
- `lib/screens/b2b_quick_order_screen.dart` — commit through the notifier,
  save indicator, "View list".
- `test/b2b_quick_order_test.dart` — new persistence/save-state test.

## Verification
- `flutter analyze` clean; `flutter test` — app **70** pass, package **48** pass.
- New test: `addSku` sets `ListsSaveState.saved`, the SKU appears via
  `procurementListProvider(id)`, and a **fresh container over the same store**
  still sees it (persistence survives reload).
- Emulator (medium_phone/API 36): Floor Essentials → Add to list on
  "Anchor Switch 6A" → app bar shows **"Saved"**, row shows
  "In: Floor Essentials" / "Remove from list", toast "Saved prod_switch …";
  **View list** opens the normal list view showing **"Saved · 4 SKUs"** with the
  newly added SKU.

## Notes
- List edits are device-local (no list API yet); a merchandising/lists endpoint
  would replace `LocalStore` as the source of truth.
- No palette/token or unrelated-screen changes.
