import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/app_config.dart';
import '../data/experience_api.dart';
import '../data/local_store.dart';
import '../domain/b2b_trade_models.dart';
import '../domain/image_quality_order.dart';
import '../domain/models.dart';
import '../domain/presentation.dart';
import 'catalog_providers.dart';

/// Trade category descriptors (icon + label) for the trade rail + catalogue.
class TradeCategory {
  const TradeCategory(
      {required this.id, required this.label, required this.icon});

  final String id;
  final String label;
  final IconData icon;
}

// The B2B category banner used to be a hard-coded per-category Pexels map here. It is now authored in
// the console like the B2C one and read from the CMS through `b2bCategoryBannerImageProvider`, so no
// image is invented in the app.

class TradeDashboard {
  const TradeDashboard({
    required this.categories,
    required this.schemes,
    required this.repeatOrders,
    required this.quotations,
    required this.picks,
  });

  final List<TradeCategory> categories;
  final List<TradeScheme> schemes;
  final List<B2BOrder> repeatOrders;
  final List<QuotationSummary> quotations;
  final List<TradeProduct> picks;
}

class QuotationSummary {
  const QuotationSummary({
    required this.reference,
    required this.summary,
    required this.quoteCount,
  });

  final String reference;
  final String summary;
  final int quoteCount;
}

Money _inr(int rupees) => Money(amount: rupees * 100, currencyCode: 'INR');

B2BOrderLine _line(String sku, String name, int qty, int rupees) =>
    B2BOrderLine(sku: sku, name: name, quantity: qty, unitPrice: _inr(rupees));

/// Builds a data-driven [ProcurementList] from a compact SKU/name/quantity spec.
ProcurementList _list(
  String id,
  String title,
  String description,
  ProcurementListSourceType sourceType,
  List<(String, String, int)> items, {
  String? campaignRef,
  String? reason,
  ProcurementListAction action = ProcurementListAction.view,
  List<String> categoryLabels = const <String>[],
  int? limit,
  int defaultQuantity = 1,
}) {
  return ProcurementList(
    id: id,
    title: title,
    description: description,
    sourceType: sourceType,
    items: <ProcurementListItem>[
      for (final it in items)
        ProcurementListItem(sku: it.$1, name: it.$2, quantity: it.$3),
    ],
    campaignRef: campaignRef,
    personalizationReason: reason,
    action: action,
    categoryLabels: categoryLabels,
    limit: limit,
    defaultQuantity: defaultQuantity,
  );
}

/// Persistence + save state for the procurement lists (Quick Order → list
/// journey).
///
/// Edits made in the Quick Order Center (add/remove SKU, create, rename,
/// delete) are persisted via [LocalStore] so they survive navigation and appear
/// in the normal list view ([ProcurementListDetailScreen]). When no store is
/// available (unit tests) it degrades to an in-memory seed without persisting.
enum ListsSaveState { idle, saving, saved }

class ListsSaveStateNotifier extends Notifier<ListsSaveState> {
  @override
  ListsSaveState build() => ListsSaveState.idle;

  void saving() => state = ListsSaveState.saving;
  void saved() => state = ListsSaveState.saved;
  void idle() => state = ListsSaveState.idle;
}

final listsSaveStateProvider =
    NotifierProvider<ListsSaveStateNotifier, ListsSaveState>(
        ListsSaveStateNotifier.new);

/// The canonical purchased-list set (Seasonal / Kitchen Works / Floor
/// Essentials) plus any buyer-created lists, persisted across sessions.
final procurementListsProvider =
    NotifierProvider<ProcurementListsNotifier, List<ProcurementList>>(
        ProcurementListsNotifier.new);

class ProcurementListsNotifier extends Notifier<List<ProcurementList>> {
  @override
  List<ProcurementList> build() {
    try {
      final store = ref.read(localStoreProvider);
      if (!store.hasProcurementLists()) {
        final seed = _seedLists();
        store.writeProcurementLists(seed); // first-run seed (fire-and-forget)
        return seed;
      }
      final persisted = store.readProcurementLists();
      final migrated = _migrateLegacySeedLists(persisted);
      if (migrated.$2) {
        store.writeProcurementLists(migrated.$1); // one-time fixture migration
      }
      return migrated.$1;
    } catch (_) {
      // No store available (e.g. a bare unit-test container): in-memory only.
      return _seedLists();
    }
  }

  Future<void> _commit(List<ProcurementList> next) async {
    state = next;
    final save = ref.read(listsSaveStateProvider.notifier);
    save.saving();
    try {
      await ref.read(localStoreProvider).writeProcurementLists(next);
      save.saved();
    } catch (_) {
      // Persistence unavailable — the in-memory edit still stands.
      save.idle();
    }
  }

  /// Adds a SKU to a list (no-op when already present) and persists.
  Future<void> addSku(String listId, ProcurementListItem item) async {
    final current = _find(listId);
    if (current == null || current.items.any((i) => i.sku == item.sku)) return;
    await _commit(_replace(current
        .copyWith(items: <ProcurementListItem>[...current.items, item])));
  }

  Future<void> removeSku(String listId, String sku) async {
    final current = _find(listId);
    if (current == null) return;
    await _commit(_replace(current.copyWith(
        items: current.items.where((i) => i.sku != sku).toList())));
  }

  static int _createdSequence = 0;

  String _newListId() =>
      'pl_user_${DateTime.now().microsecondsSinceEpoch}_${_createdSequence++}';

  Future<ProcurementList> createList({
    required String title,
    String description = 'Saved list',
  }) async {
    final list = ProcurementList(
      id: _newListId(),
      title: title,
      description: description,
      sourceType: ProcurementListSourceType.buyerSaved,
      items: const <ProcurementListItem>[],
      action: ProcurementListAction.useList,
    );
    await _commit(<ProcurementList>[...state, list]);
    return list;
  }

  Future<void> renameList(String listId, String title) async {
    final current = _find(listId);
    if (current == null) return;
    await _commit(_replace(current.copyWith(title: title)));
  }

  Future<void> deleteList(String listId) async {
    await _commit(state.where((l) => l.id != listId).toList());
  }

  // ---- Manage Lists / List Editor support ---------------------------------

  ProcurementList? listById(String id) => _find(id);

  /// Replace a list's items wholesale (List Editor "Save Changes").
  Future<void> replaceItems(
      String listId, List<ProcurementListItem> items) async {
    final current = _find(listId);
    if (current == null) return;
    await _commit(_replace(current.copyWith(items: items)));
  }

  /// Update the persisted saved default quantity for one SKU. This never touches
  /// the temporary quick-order purchase quantity or the cart.
  Future<void> setItemQuantity(String listId, String sku, int quantity) async {
    if (quantity <= 0) return;
    final current = _find(listId);
    if (current == null) return;
    await _commit(_replace(current.copyWith(
      items: <ProcurementListItem>[
        for (final i in current.items)
          i.sku == sku
              ? ProcurementListItem(
                  sku: i.sku,
                  name: i.name,
                  quantity: quantity,
                  unitPrice: i.unitPrice)
              : i,
      ],
    )));
  }

  /// Create a buyer-owned list seeded with items.
  Future<ProcurementList> createWithItems({
    required String title,
    String description = 'Saved list',
    List<ProcurementListItem> items = const <ProcurementListItem>[],
  }) async {
    final list = ProcurementList(
      id: _newListId(),
      title: title,
      description: description,
      sourceType: ProcurementListSourceType.buyerSaved,
      items: items,
      action: ProcurementListAction.useList,
    );
    await _commit(<ProcurementList>[...state, list]);
    return list;
  }

  /// Duplicate any list as a new buyer-owned copy (source untouched).
  Future<ProcurementList> duplicateList(String listId, {String? title}) async {
    final source = _find(listId);
    return createWithItems(
      title: title ?? 'Copy of ${source?.title ?? 'List'}',
      description: source?.description ?? 'Saved list',
      items: source?.items ?? const <ProcurementListItem>[],
    );
  }

  /// Persist an editor draft. Curated/suggested sources (non buyer-owned) save
  /// as an editable buyer-owned copy without modifying the original template.
  Future<ProcurementList> saveEdited({
    String? listId,
    required String title,
    required List<ProcurementListItem> items,
  }) async {
    final current = listId == null ? null : _find(listId);
    if (current == null) {
      return createWithItems(title: title, items: items);
    }
    if (current.sourceType != ProcurementListSourceType.buyerSaved) {
      return createWithItems(
        title: title,
        description: current.description,
        items: items,
      );
    }
    final updated = current.copyWith(title: title, items: items);
    await _commit(_replace(updated));
    return updated;
  }

  ProcurementList? _find(String id) {
    for (final l in state) {
      if (l.id == id) return l;
    }
    return null;
  }

  List<ProcurementList> _replace(ProcurementList updated) => <ProcurementList>[
        for (final l in state) l.id == updated.id ? updated : l,
      ];
}

List<ProcurementList> _seedLists() => <ProcurementList>[
      // CHG-062: rule-based staging lists. Membership resolves from the live
      // catalogue by L1 category, so an import can never leave the list pointing
      // at archived demonstration ids. Operators can override the title, order
      // and membership from the console's curated collections.
      _list(
          'pl_seasonal',
          'Electrical Essentials',
          'Lighting, wiring and switchgear',
          ProcurementListSourceType.buyerSaved,
          const <(String, String, int)>[],
          categoryLabels: const <String>['Lighting & Electrical'],
          limit: 20,
          defaultQuantity: 5),
      _list(
          'pl_kitchen',
          'Bathroom & Plumbing',
          'Fittings, sanitaryware and pipes',
          ProcurementListSourceType.buyerSaved,
          const <(String, String, int)>[],
          categoryLabels: const <String>['Bathroom & Plumbing'],
          limit: 20,
          defaultQuantity: 4),
      _list(
          'pl_floor',
          'Paints & Finishes',
          'Paints, boards and surface finishes',
          ProcurementListSourceType.buyerSaved,
          const <(String, String, int)>[],
          categoryLabels: const <String>[
            'Paints & Finishes',
            'Tiles & Building Materials',
          ],
          limit: 18,
          defaultQuantity: 4),
      _list(
          'pl_tools',
          'Tools & Hardware',
          'Hand tools, power tools and fasteners',
          ProcurementListSourceType.buyerSaved,
          const <(String, String, int)>[],
          categoryLabels: const <String>['Tools & Hardware'],
          limit: 20,
          defaultQuantity: 5),
    ];

/// Replaces only untouched demonstration seeds with the current seed.
///
/// The 3-item pilot seed and the 12/8/8 demonstration seed are recognised by
/// their exact id/quantity signature. Any buyer rename, add or removal changes
/// that signature, so buyer work is preserved rather than overwritten.
/// Missing seed lists are appended; user-created lists are always kept.
(List<ProcurementList>, bool) _migrateLegacySeedLists(
    List<ProcurementList> persisted) {
  const legacySignatures = <String, Map<String, int>>{
    'pl_seasonal': <String, int>{
      'prod_led': 20,
      'prod_mcb': 10,
      'prod_wire': 5,
    },
    'pl_kitchen': <String, int>{
      'prod_bibcock': 10,
      'prod_cpvc': 50,
      'prod_ballvalve': 10,
    },
    'pl_floor': <String, int>{
      'prod_tiles': 10,
      'prod_paint': 4,
      'prod_fittings': 4,
    },
  };
  const demoSeedSignatures = <String, Map<String, int>>{
    'pl_seasonal': <String, int>{
      'prod_led': 20,
      'prod_mcb': 10,
      'prod_wire': 5,
      'prod_switch': 20,
      'prod_bibcock': 10,
      'prod_cpvc': 50,
      'prod_ballvalve': 10,
      'prod_tiles': 10,
      'prod_paint': 4,
      'prod_drill': 2,
      'prod_grinder': 2,
      'prod_fittings': 4,
    },
    'pl_kitchen': <String, int>{
      'prod_bibcock': 10,
      'prod_cpvc': 50,
      'prod_ballvalve': 10,
      'prod_fittings': 4,
      'prod_tiles': 10,
      'prod_paint': 4,
      'prod_drill': 2,
      'prod_grinder': 2,
    },
    'pl_floor': <String, int>{
      'prod_tiles': 10,
      'prod_paint': 4,
      'prod_fittings': 4,
      'prod_drill': 2,
      'prod_grinder': 2,
      'prod_ballvalve': 10,
      'prod_cpvc': 50,
      'prod_wire': 5,
    },
  };
  const legacyTitles = <String, String>{
    'pl_seasonal': 'Seasonal',
    'pl_kitchen': 'Kitchen Works',
    'pl_floor': 'Floor Essentials',
  };
  final seeds = _seedLists();
  final seedById = <String, ProcurementList>{
    for (final list in seeds) list.id: list,
  };
  final result = <ProcurementList>[
    for (final list in persisted)
      if (_matchesLegacyFixture(
              list, legacySignatures[list.id], legacyTitles[list.id] ?? '') ||
          _matchesLegacyFixture(
              list, demoSeedSignatures[list.id], legacyTitles[list.id] ?? ''))
        seedById[list.id] ?? list
      else
        list,
  ];
  final present = <String>{for (final list in result) list.id};
  for (final seed in seeds) {
    if (!present.contains(seed.id)) result.add(seed);
  }
  final changed = result.length != persisted.length ||
      <int>[for (var i = 0; i < persisted.length; i++) i]
          .any((i) => !identical(persisted[i], result[i]));
  return (result, changed);
}

bool _matchesLegacyFixture(
    ProcurementList list, Map<String, int>? signature, String originalTitle) {
  if (signature == null ||
      list.title != originalTitle ||
      list.items.length != signature.length) {
    return false;
  }
  for (final item in list.items) {
    if (signature[item.sku] != item.quantity) return false;
  }
  return true;
}

/// Procurement lists with rule-based membership materialised from the live
/// catalogue (CHG-062).
///
/// Persistence keeps the rule, not twenty stale product ids, so a catalogue
/// change updates every list. Buyer-owned lists (no rule) pass through
/// unchanged. Screens read this provider; edits go through
/// [procurementListsProvider].
final resolvedProcurementListsProvider = Provider<List<ProcurementList>>((ref) {
  final lists = ref.watch(procurementListsProvider);
  final catalogue = ref.watch(tradeCatalogueViewProvider);
  return <ProcurementList>[
    for (final list in lists) _resolveProcurementList(list, catalogue),
  ];
});

ProcurementList _resolveProcurementList(
    ProcurementList list, List<TradeProduct> catalogue) {
  if (!list.isRuleBased) return list;
  final labels = <String>{
    for (final label in list.categoryLabels) label.trim().toLowerCase(),
  };
  final categoryIds = <String>{
    for (final label in labels)
      if (TradeCategoryIds.byLabel[label] != null)
        TradeCategoryIds.byLabel[label]!,
  };
  final items = <ProcurementListItem>[];
  final seen = <String>{};
  // Buyer additions on a rule list are kept ahead of the rule result.
  for (final item in list.items) {
    if (seen.add(item.sku)) items.add(item);
  }
  for (final product in catalogue) {
    if (list.limit != null && items.length >= list.limit!) break;
    final label = (product.product.categoryLabel ?? '').trim().toLowerCase();
    final id = product.categoryId;
    if (!labels.contains(label) && !categoryIds.contains(id)) continue;
    if (!seen.add(product.product.id)) continue;
    items.add(ProcurementListItem(
      sku: product.product.id,
      name: product.product.title,
      quantity: list.defaultQuantity,
      unitPrice: product.tradePrice,
    ));
  }
  return list.copyWith(items: items);
}

/// The quick-order presets shown on the B2B Home — the kept list names.
/// Quick-order lists with console-authored presentation applied (CHG-062).
///
/// Console records (placement `b2b.quick_order`) override the governed rule
/// lists by display position: title, supporting text, category rule, cap and
/// default quantity. Records beyond the built-in four append new lists. With no
/// authored record the governed lists pass through unchanged.
final effectiveProcurementListsProvider =
    Provider<List<ProcurementList>>((ref) {
  final base = ref.watch(resolvedProcurementListsProvider);
  final catalogue = ref.watch(tradeCatalogueViewProvider);
  final curated = (ref.watch(b2bCuratedCollectionsProvider).value ??
          const <CuratedCollection>[])
      .where((item) => item.placement == 'b2b.quick_order')
      .toList()
    ..sort((a, b) => (a.displayOrder ?? 999).compareTo(b.displayOrder ?? 999));
  if (curated.isEmpty) return base;

  final ruleLists = base.where((list) => list.isRuleBased).toList();
  final others = base.where((list) => !list.isRuleBased).toList();
  final merged = <ProcurementList>[];
  for (var i = 0; i < curated.length; i++) {
    final record = curated[i];
    final template = i < ruleLists.length ? ruleLists[i] : null;
    merged.add(ProcurementList(
      id: template?.id ?? 'pl_cms_${record.collectionKey}',
      title: record.title,
      description: record.description ?? template?.description ?? 'Saved list',
      sourceType: template?.sourceType ?? ProcurementListSourceType.buyerSaved,
      // A rule template is re-resolved from its (possibly new) rule rather than
      // inheriting the previously materialised items.
      items: template != null && template.isRuleBased
          ? const <ProcurementListItem>[]
          : (template?.items ?? const <ProcurementListItem>[]),
      campaignRef: template?.campaignRef,
      action: template?.action ?? ProcurementListAction.useList,
      categoryLabels: record.categoryLabels.isEmpty
          ? (template?.categoryLabels ?? const <String>[])
          : record.categoryLabels,
      limit: record.limit ?? template?.limit ?? 20,
      defaultQuantity: record.defaultQuantity ?? template?.defaultQuantity ?? 1,
    ));
  }
  for (var i = curated.length; i < ruleLists.length; i++) {
    merged.add(ruleLists[i]);
  }
  merged.addAll(others);
  return <ProcurementList>[
    for (final list in merged) _resolveProcurementList(list, catalogue),
  ];
});

final quickOrderPresetsProvider = Provider<List<String>>((ref) => <String>[
      for (final l in ref.watch(effectiveProcurementListsProvider)) l.title
    ]);

final procurementListProvider =
    Provider.autoDispose.family<ProcurementList?, String>((ref, id) {
  final lists = ref.watch(effectiveProcurementListsProvider);
  for (final list in lists) {
    if (list.id == id) return list;
  }
  return null;
});

/// Commerce category ids the trade catalogue is tagged with.
///
/// These are the live Medusa category ids, so the rail, the filter and Category presentation all
/// speak the same identifiers. Renaming a category in the console changes the rail label; it does
/// not need a code change here.
abstract final class TradeCategoryIds {
  static const String bathroom = 'pcat_01M4EC9BNHH212X5V13Z055DDR';
  static const String electrical = 'pcat_01M4EC9BNKHP80XAET6X0BV6MT';
  static const String construction = 'pcat_01M4EC9BNG9AVFBH8RAN8MDP0V';
  static const String tiles = 'pcat_01M4EC9BNJPR8T0YQCBC8W4XFJ';
  static const String agriculture = 'pcat_01M4EC9BNMNB7AW5Z293YVRWJW';
  static const String pumps = 'pcat_01M4EC9BNM9X603HVQBQ93J969';
  static const String paints = 'pcat_01M57QZG8NS654FG2PR3HJ95PW';
  static const String tools = 'pcat_01M57QZFXG5E8KD9P8K7Q6G89S';
  static const String automotive = 'pcat_01M57QZGC2DDKFG5775TD4455Q';
  static const String miscellaneous = 'pcat_01M58989BEMSW5CRGFGZBJF10N';

  /// L1 label to commerce id. Merchandising rules are authored by label because
  /// that is what the catalogue import and CMS present; the id makes the same
  /// rule work against fixtures, which carry ids but no label.
  static const Map<String, String> byLabel = <String, String>{
    'lighting & electrical': electrical,
    'bathroom & plumbing': bathroom,
    'paints & finishes': paints,
    'tiles & building materials': tiles,
    'tools & hardware': tools,
    'agriculture & seeds': agriculture,
    'building & construction': construction,
    'pumps & machines': pumps,
    'automotive & tyres': automotive,
    'miscellaneous': miscellaneous,
  };
}

/// Trade categories for the rail, catalogue chips and filters.
///
/// Backend-first: the console's Category presentation supplies the id, label, icon and order for the
/// B2B channel. The local fixture list is only a fallback for when presentation is unavailable, so a
/// rename in the admin console reaches the trade surfaces without a code change.
final tradeCategoryOptionsProvider = Provider<List<TradeCategory>>((ref) {
  final cms = ref.watch(b2bPresentationProvider).value?.categories ??
      const <StorefrontCategory>[];
  if (cms.isEmpty) {
    return ref.watch(tradeDashboardProvider).categories;
  }
  return <TradeCategory>[
    for (final category in cms)
      TradeCategory(
        id: category.id,
        label: category.label,
        icon: categoryIconFor(category.iconKey),
      ),
  ];
});

/// Demo trade dashboard fixture. Real data is resolved from the backend later;
/// this exercises the trade UI with the reference profile.
final tradeDashboardProvider = Provider<TradeDashboard>((ref) {
  return TradeDashboard(
    categories: const <TradeCategory>[
      TradeCategory(
          id: TradeCategoryIds.electrical,
          label: 'Lighting & Electrical',
          icon: Icons.bolt_outlined),
      TradeCategory(
          id: TradeCategoryIds.bathroom,
          label: 'Bathroom & Plumbing',
          icon: Icons.water_drop_outlined),
      TradeCategory(
          id: TradeCategoryIds.paints,
          label: 'Paints & Finishes',
          icon: Icons.format_paint_outlined),
      TradeCategory(
          id: TradeCategoryIds.bathroom,
          label: 'Premium Sanitary',
          icon: Icons.bathtub_outlined),
      TradeCategory(
          id: TradeCategoryIds.construction,
          label: 'Paints & Construction',
          icon: Icons.format_paint_outlined),
      TradeCategory(
          id: TradeCategoryIds.pumps,
          label: 'Hardware & Tools',
          icon: Icons.handyman_outlined),
      TradeCategory(
          id: TradeCategoryIds.agriculture,
          label: 'Agriculture',
          icon: Icons.grass_outlined),
    ],
    schemes: const <TradeScheme>[
      TradeScheme(
        title: 'Buy 100 Get 5 Free',
        detail: 'On select plumbing & paints',
        badge: TradeSchemeBadgeType.freeGoods,
      ),
      TradeScheme(
        title: '5% Additional Cash Discount',
        detail: 'On prepaid trade orders',
        badge: TradeSchemeBadgeType.cashOffer,
      ),
      TradeScheme(
        title: '30-Day Interest Free Credit',
        detail: 'For verified dealers',
        badge: TradeSchemeBadgeType.creditScheme,
      ),
    ],
    repeatOrders: <B2BOrder>[
      B2BOrder(
        reference: 'Order #PO-3391',
        dateLabel: '24 Sep',
        itemSummary: '6 items',
        total: _inr(42300),
        lines: <B2BOrderLine>[
          _line('prod_bibcock', 'Bib Cock 15mm Full Turn Chrome', 10, 432),
          _line('prod_cpvc', 'CPVC Pipe 3/4 in', 50, 84),
          _line('prod_tiles', 'Ceramic Floor Tiles 600x600 Matt', 6, 3738),
        ],
      ),
      B2BOrder(
        reference: 'Order #PO-3374',
        dateLabel: '18 Sep',
        itemSummary: '3 items',
        total: _inr(18900),
        lines: <B2BOrderLine>[
          _line('prod_wire', 'Copper Wire 1.5sqmm', 5, 1240),
          _line('prod_mcb', 'MCB 32A Single Pole', 10, 214),
          _line('prod_led', 'LED Bulb 9W Cool White', 20, 68),
        ],
      ),
    ],
    quotations: const <QuotationSummary>[
      QuotationSummary(
          reference: 'RFQ-2841',
          summary: 'Bathroom fittings · 5 items',
          quoteCount: 3),
      QuotationSummary(
          reference: 'RFQ-2839',
          summary: 'Electricals · 8 items',
          quoteCount: 0),
    ],
    picks: <TradeProduct>[
      TradeProduct(
        product: Product(
          id: 'prod_bibcock',
          title: 'Bib Cock 15mm Full Turn Chrome',
          brand: 'JAQUAR',
          price: _inr(432),
          mrp: _inr(485),
        ),
        tradePrice: _inr(432),
        moq: 5,
        stockQty: 87,
        deliveryLocation: 'Bhiwadi, Rajasthan',
        tag: TradeTagType.bestseller,
        tiers: <TradeTier>[
          TradeTier(quantity: 5, unitPrice: _inr(432)),
          TradeTier(quantity: 10, unitPrice: _inr(415)),
          TradeTier(quantity: 25, unitPrice: _inr(398)),
          TradeTier(quantity: 50, unitPrice: _inr(389)),
        ],
        scheme: const TradeScheme(
          title: 'Scheme available',
          detail: 'Buy 100 Get 5 Free',
          badge: TradeSchemeBadgeType.freeGoods,
        ),
      ),
      TradeProduct(
        product: Product(
          id: 'prod_tiles',
          title: 'Ceramic Floor Tiles 600x600 Matt',
          brand: 'CERAMICA',
          price: _inr(3738),
          mrp: _inr(4200),
        ),
        tradePrice: _inr(3738),
        moq: 5,
        stockQty: 240,
        deliveryLocation: 'Bhiwadi, Rajasthan',
        tag: TradeTagType.premium,
        tiers: <TradeTier>[
          TradeTier(quantity: 5, unitPrice: _inr(3738)),
          TradeTier(quantity: 10, unitPrice: _inr(3610)),
          TradeTier(quantity: 25, unitPrice: _inr(3495)),
          TradeTier(quantity: 50, unitPrice: _inr(3380)),
        ],
      ),
    ],
  );
});

/// Builds a [TradeProduct] from a compact spec so the catalogue fixture stays
/// readable. Tiers are (quantity, unit-rupees) pairs.
/// Representative product imagery per trade category (demo seed). Real
/// thumbnails come from the catalogue backend; any URL that fails to resolve
/// falls back to the tile's placeholder icon.
const Map<String, String> _categoryThumb = <String, String>{
  TradeCategoryIds.bathroom:
      'https://images.pexels.com/photos/585419/pexels-photo-585419.jpeg?auto=compress&cs=tinysrgb&w=600',
  TradeCategoryIds.electrical:
      'https://images.pexels.com/photos/577514/pexels-photo-577514.jpeg?auto=compress&cs=tinysrgb&w=600',
  TradeCategoryIds.construction:
      'https://images.pexels.com/photos/207142/pexels-photo-207142.jpeg?auto=compress&cs=tinysrgb&w=600',
  TradeCategoryIds.pumps:
      'https://images.pexels.com/photos/1249611/pexels-photo-1249611.jpeg?auto=compress&cs=tinysrgb&w=600',
  TradeCategoryIds.agriculture:
      'https://images.pexels.com/photos/265216/pexels-photo-265216.jpeg?auto=compress&cs=tinysrgb&w=600',
};

TradeProduct _tp({
  required String id,
  required String title,
  required String brand,
  required int price,
  required int mrp,
  required int moq,
  required int stock,
  String categoryId = 'all',
  bool seasonal = false,
  TradeTagType? tag,
  TradeScheme? scheme,
  String? thumb,
  List<(int, int)> tiers = const <(int, int)>[],
}) {
  return TradeProduct(
    product: Product(
        id: id,
        title: title,
        brand: brand,
        price: _inr(price),
        mrp: _inr(mrp),
        thumbnail: thumb ?? _categoryThumb[categoryId]),
    tradePrice: _inr(price),
    moq: moq,
    stockQty: stock,
    deliveryLocation: 'Bhiwadi, Rajasthan',
    categoryId: categoryId,
    seasonal: seasonal,
    tag: tag,
    scheme: scheme,
    tiers: <TradeTier>[
      for (final t in tiers) TradeTier(quantity: t.$1, unitPrice: _inr(t.$2)),
    ],
  );
}

/// Attaches a deterministic multi-seller offer set to a trade product so the
/// PDP can show the best price by default plus comparable alternatives. Real
/// seller data comes from the marketplace backend; this keeps the flow testable.
TradeProduct _withSellers(TradeProduct p) {
  if (p.sellers.isNotEmpty) return p;
  final base = p.tradePrice.amount;
  Money price(int rupees) => Money(amount: rupees, currencyCode: 'INR');
  return p.copyWith(sellers: <TradeSupplier>[
    TradeSupplier(
      id: '${p.product.id}_s1',
      name: p.product.brand ?? 'BuildKart Verified Seller',
      unitPrice: price(base),
      moq: p.moq,
      stockQty: p.stockQty,
      rating: 4.6,
      deliveryLabel: '2-3 days',
      bestPrice: true,
    ),
    TradeSupplier(
      id: '${p.product.id}_s2',
      name: 'Sharma Sanitary Mart',
      unitPrice: price((base * 1.04).round()),
      moq: p.moq + 5,
      stockQty: (p.stockQty * 0.6).round(),
      rating: 4.3,
      deliveryLabel: '4-5 days',
    ),
    TradeSupplier(
      id: '${p.product.id}_s3',
      name: 'Metro Hardware Depot',
      unitPrice: price((base * 1.08).round()),
      moq: p.moq,
      stockQty: (p.stockQty * 0.35).round(),
      rating: 4.1,
      deliveryLabel: '5-7 days',
    ),
  ]);
}

/// Maps a composed catalogue product onto the B2B trade view model.
///
/// Only values that actually exist upstream are carried across: catalogue price,
/// the winning offer's seller and the offer's stock. MOQ stays 1 and quantity
/// tiers stay empty because there is no governed trade-terms source yet; filling
/// them with a local convention would fabricate a commercial term.
/// Quantity ladder for live trade products (CHG-051).
///
/// Each step adds five points and the deepest step stops at the governed 10%
/// promotion ceiling: 1+ list, 10+ 5% off, 25+ 10% off. These are quotation /
/// trade-price terms, not a Medusa promotion (quantity slabs are not
/// expressible there).
const List<(int, int)> _tradeTierLadder = <(int, int)>[
  (1, 0),
  (10, 5),
  (25, 10),
];

Money _discountedMoney(Money price, int percent) => Money(
      amount: (price.amount * (100 - percent) / 100).round(),
      currencyCode: price.currencyCode,
    );

/// Unit price from a variant's saved B2B tiers at [quantity]. Null means the
/// variant has no configured B2B terms, so the caller keeps its own price.
Money? b2bUnitPriceFor(ProductVariant? variant, int quantity) {
  if (variant == null || variant.b2bTiers.isEmpty) return null;
  B2bPriceTier? match;
  for (final tier in variant.b2bTiers) {
    if (quantity < tier.minQuantity) continue;
    if (match == null || tier.minQuantity > match.minQuantity) match = tier;
  }
  return match?.unitPrice;
}

TradeProduct tradeProductFromCatalogue(Product product, {String? categoryId}) {
  // Show the cheapest sellable SKU on the card, matching the B2C best price.
  // `defaultVariant` is the first sellable SKU, which is not necessarily the
  // cheapest and made the same product show two different discounts.
  ProductVariant? selected;
  for (final variant in product.variants) {
    if (!variant.isPurchasable || variant.price == null) continue;
    if (selected == null) {
      selected = variant;
      continue;
    }
    // A seller's published B2B terms beat a B2C-only SKU, even when the B2C
    // price happens to be lower. The buyer must see the trade offer the seller
    // actually authorised.
    if (variant.b2bConfigured != selected.b2bConfigured) {
      if (variant.b2bConfigured) selected = variant;
      continue;
    }
    if (variant.price!.amount < selected.price!.amount) {
      selected = variant;
    }
  }
  selected ??= product.defaultVariant;
  final price = selected?.price ??
      product.price ??
      const Money(amount: 0, currencyCode: 'INR');
  final configuredTiers = selected?.b2bTiers ?? const <B2bPriceTier>[];
  return TradeProduct(
    product: product,
    tradePrice: price,
    moq: selected?.b2bMoq ?? 1,
    stockQty: selected?.stockQty ?? 0,
    selectedVariant: selected,
    // An older composed payload lists variants without stock. Say "unconfirmed"
    // rather than turning every product into "Out of Stock".
    stockKnown: selected != null,
    deliveryLocation: 'Marketplace Shipping',
    categoryId: categoryId ?? product.categoryId ?? 'all',
    tiers: configuredTiers.isNotEmpty
        ? <TradeTier>[
            for (final tier in configuredTiers)
              TradeTier(
                quantity: tier.minQuantity,
                unitPrice: tier.unitPrice,
              ),
          ]
        : price.amount <= 0
            ? const <TradeTier>[]
            : <TradeTier>[
                for (final tier in _tradeTierLadder)
                  TradeTier(
                    quantity: tier.$1,
                    unitPrice:
                        tier.$2 == 0 ? price : _discountedMoney(price, tier.$2),
                  ),
              ],
    sellers: <TradeSupplier>[
      for (final variant in product.variants)
        if (variant.isPurchasable)
          TradeSupplier(
            id: variant.offerId!,
            name: variant.sellerName ??
                product.brand ??
                'BuildKart Verified Seller',
            unitPrice: variant.price!,
            moq: variant.b2bMoq ?? 1,
            stockQty: variant.stockQty,
            bestPrice: variant.id == product.variantId,
          ),
    ],
  );
}

/// Live B2B trade catalogue from the Experience API.
///
/// Reads the same staged source catalogue as the storefront, but through the B2B
/// sales channel, and resolves each product's L1 category id from CMS
/// presentation so the trade rail filters on commerce identity rather than on a
/// label guess.
final tradeCatalogueLiveProvider =
    FutureProvider.autoDispose<List<TradeProduct>>((ref) async {
  // Tests and any process that has not bootstrapped the live runtime read the
  // governed fixture, never a half-started request.
  if (!AppConfig.liveCatalogueEnabled) return const <TradeProduct>[];
  final categories = ref.watch(b2bPresentationProvider).value?.categories ??
      const <StorefrontCategory>[];
  final categoryIdByLabel = <String, String>{
    for (final category in categories)
      if (category.label.trim().isNotEmpty)
        category.label.trim().toLowerCase(): category.id,
  };
  final api = ref.watch(experienceApiProvider);
  var products = await api.getAllComposedProducts(
    channel: 'b2b',
    catalogueImport: AppConfig.catalogueImport,
  );
  if (products.isEmpty) {
    products = await api.getAllComposedProducts(channel: 'b2b');
  }
  return <TradeProduct>[
    for (final product in orderProductsByDisplayImage(products))
      tradeProductFromCatalogue(
        product,
        categoryId: categoryIdByLabel[
            (product.categoryLabel ?? '').trim().toLowerCase()],
      ),
  ];
});

/// What the trade surfaces are currently showing.
enum TradeCatalogueSource { loading, live, fallback }

/// The trade catalogue the B2B UI renders.
///
/// Live API data wins; the local fixture is only a fallback while the API is
/// loading or unreachable, so the trade UI never becomes an error page.
final tradeCatalogueViewProvider = Provider<List<TradeProduct>>((ref) {
  final live = ref.watch(tradeCatalogueLiveProvider);
  final products = live.value ?? const <TradeProduct>[];
  if (products.isNotEmpty) return products;
  return ref.watch(tradeCatalogueProvider);
});

final tradeCatalogueSourceProvider = Provider<TradeCatalogueSource>((ref) {
  final live = ref.watch(tradeCatalogueLiveProvider);
  if ((live.value ?? const <TradeProduct>[]).isNotEmpty) {
    return TradeCatalogueSource.live;
  }
  return live.isLoading
      ? TradeCatalogueSource.loading
      : TradeCatalogueSource.fallback;
});

/// The full B2B trade catalogue fixture, category-tagged and seasonally flagged.
///
/// Kept only as the offline/development fallback for [tradeCatalogueViewProvider].
/// Live trade surfaces read the Experience API.
final tradeCatalogueProvider = Provider<List<TradeProduct>>((ref) {
  const freeGoods = TradeScheme(
    title: 'Scheme available',
    detail: 'Buy 100 Get 5 Free',
    badge: TradeSchemeBadgeType.freeGoods,
  );
  const cashOffer = TradeScheme(
    title: 'Cash offer',
    detail: '5% additional cash discount',
    badge: TradeSchemeBadgeType.cashOffer,
  );
  final base = <TradeProduct>[
    _tp(
      id: 'prod_bibcock',
      title: 'Bib Cock 15mm Full Turn Chrome',
      brand: 'JAQUAR',
      price: 432,
      mrp: 485,
      moq: 5,
      stock: 87,
      categoryId: TradeCategoryIds.bathroom,
      tag: TradeTagType.bestseller,
      scheme: freeGoods,
      tiers: const [(5, 432), (10, 415), (25, 398), (50, 389)],
    ),
    _tp(
      id: 'prod_cpvc',
      title: 'CPVC Pipe 3/4 in',
      brand: 'Astral',
      price: 84,
      mrp: 99,
      moq: 10,
      stock: 420,
      categoryId: TradeCategoryIds.bathroom,
      tiers: const [(10, 84), (50, 79), (100, 74)],
    ),
    _tp(
      id: 'prod_ballvalve',
      title: 'Ball Valve 25mm',
      brand: 'Zoloto',
      price: 186,
      mrp: 230,
      moq: 10,
      stock: 150,
      categoryId: TradeCategoryIds.bathroom,
      scheme: cashOffer,
      tiers: const [(10, 186), (25, 175), (50, 168)],
    ),
    _tp(
      id: 'prod_switch',
      title: 'Anchor Switch 6A',
      brand: 'Panasonic',
      price: 38,
      mrp: 52,
      moq: 20,
      stock: 900,
      categoryId: TradeCategoryIds.electrical,
      tiers: const [(20, 38), (100, 34), (300, 31)],
    ),
    _tp(
      id: 'prod_wire',
      title: 'Copper Wire 1.5sqmm',
      brand: 'Finolex',
      price: 1240,
      mrp: 1480,
      moq: 5,
      stock: 210,
      categoryId: TradeCategoryIds.electrical,
      tiers: const [(5, 1240), (20, 1180), (50, 1135)],
    ),
    _tp(
      id: 'prod_mcb',
      title: 'MCB 32A Single Pole',
      brand: 'Havells',
      price: 214,
      mrp: 265,
      moq: 10,
      stock: 340,
      categoryId: TradeCategoryIds.electrical,
      scheme: freeGoods,
      tiers: const [(10, 214), (25, 199), (50, 188)],
    ),
    _tp(
      id: 'prod_led',
      title: 'LED Bulb 9W Cool White',
      brand: 'Philips',
      price: 68,
      mrp: 90,
      moq: 20,
      stock: 1100,
      categoryId: TradeCategoryIds.electrical,
      seasonal: true,
      tag: TradeTagType.bestseller,
      tiers: const [(20, 68), (100, 61), (300, 57)],
    ),
    _tp(
      id: 'prod_tiles',
      title: 'Ceramic Floor Tiles 600x600 Matt',
      brand: 'CERAMICA',
      price: 3738,
      mrp: 4200,
      moq: 5,
      stock: 240,
      categoryId: TradeCategoryIds.construction,
      tag: TradeTagType.premium,
      tiers: const [(5, 3738), (10, 3610), (25, 3495), (50, 3380)],
    ),
    _tp(
      id: 'prod_paint',
      title: 'Emulsion Paint 20L',
      brand: 'Asian Paints',
      price: 2350,
      mrp: 2850,
      moq: 4,
      stock: 180,
      categoryId: TradeCategoryIds.paints,
      scheme: cashOffer,
      tiers: const [(4, 2350), (10, 2210), (20, 2120)],
    ),
    _tp(
      id: 'prod_drill',
      title: 'Cordless Drill Kit 18V',
      brand: 'Bosch',
      price: 6450,
      mrp: 7999,
      moq: 2,
      stock: 64,
      categoryId: TradeCategoryIds.pumps,
      tiers: const [(2, 6450), (5, 6190), (10, 5990)],
    ),
    _tp(
      id: 'prod_grinder',
      title: 'Angle Grinder 4 in',
      brand: 'Bosch',
      price: 3299,
      mrp: 4599,
      moq: 2,
      stock: 92,
      categoryId: TradeCategoryIds.pumps,
      tag: TradeTagType.premium,
      tiers: const [(2, 3299), (5, 3150), (10, 3050)],
    ),
    _tp(
      id: 'prod_fittings',
      title: 'Bathroom Fittings Set',
      brand: 'Jaquar',
      price: 2450,
      mrp: 3200,
      moq: 4,
      stock: 130,
      categoryId: TradeCategoryIds.bathroom,
      tiers: const [(4, 2450), (10, 2320), (20, 2240)],
    ),
    _tp(
      id: 'prod_washbasin',
      title: 'Premium Ceramic Wash Basin',
      brand: 'CERA',
      price: 3200,
      mrp: 3890,
      moq: 2,
      stock: 74,
      categoryId: TradeCategoryIds.bathroom,
      tiers: const [(2, 3200), (5, 3050), (10, 2920)],
    ),
    _tp(
      id: 'prod_adhesive',
      title: 'Tile Adhesive 20kg',
      brand: 'MYK Laticrete',
      price: 780,
      mrp: 925,
      moq: 5,
      stock: 260,
      categoryId: TradeCategoryIds.construction,
      tiers: const [(5, 780), (20, 735), (50, 698)],
    ),
    _tp(
      id: 'prod_hose',
      title: 'Reinforced Garden Hose 30m',
      brand: 'Jain',
      price: 1450,
      mrp: 1780,
      moq: 4,
      stock: 118,
      categoryId: TradeCategoryIds.agriculture,
      tiers: const [(4, 1450), (10, 1375), (25, 1290)],
    ),
    _tp(
      id: 'prod_pump',
      title: 'Agricultural Water Pump 1HP',
      brand: 'Kirloskar',
      price: 6200,
      mrp: 7490,
      moq: 2,
      stock: 42,
      categoryId: TradeCategoryIds.agriculture,
      tiers: const [(2, 6200), (5, 5940), (10, 5680)],
    ),
  ];
  return <TradeProduct>[for (final p in base) _withSellers(p)];
});

/// Previously ordered products, surfaced in the "Buy Again" swimlane.
///
/// Resolved from the buyer's own orders and saved procurement lists, never from
/// a fixed set of demonstration ids: an empty history means the unit is empty
/// rather than presenting unrelated catalogue items as "frequent".
final frequentSavedProvider = Provider<List<TradeProduct>>((ref) {
  final catalogue = ref.watch(tradeCatalogueViewProvider);
  final skus = <String>{
    for (final order in ref.watch(b2bOrdersProvider))
      for (final line in order.lines) line.sku,
    for (final list in ref.watch(procurementListsProvider))
      for (final item in list.items) item.sku,
  };
  if (skus.isEmpty) return const <TradeProduct>[];
  final matched = <TradeProduct>[
    for (final product in catalogue)
      if (product.product.variants.any((v) => skus.contains(v.sku)) ||
          skus.contains(product.product.id))
        product,
  ];
  return matched.take(6).toList();
});

/// Products with the buyer's best price advantage (highest savings), surfaced
/// in the "My Price Advantage" collection swimlane.
final priceAdvantageProvider = Provider<List<TradeProduct>>((ref) {
  final catalogue = ref.watch(tradeCatalogueViewProvider);
  final sorted = List<TradeProduct>.of(catalogue)
    ..sort((a, b) => (b.savingsPercent ?? 0).compareTo(a.savingsPercent ?? 0));
  return sorted.take(4).toList();
});

/// Shared B2B quotation-cart state. It is intentionally separate from the
/// consumer cart because trade quantities, negotiated tiers and procurement
/// list lines follow different business rules.
///
/// This is the **single** RFQ / quotation basket used by every B2B screen:
/// direct adds from the product tile, procurement lists and reorder all write
/// here, and it persists as a device-local draft until the RFQ is submitted.
class B2BQuotationCartNotifier extends Notifier<B2BQuotationCart> {
  @override
  B2BQuotationCart build() {
    // Restore a previously saved RFQ draft (development fixture until the RFQ
    // backend contract exists). Persistence is best-effort: when no store is
    // configured (e.g. lightweight tests) the basket simply starts empty.
    try {
      return ref.read(localStoreProvider).readRfqDraft() ??
          const B2BQuotationCart();
    } catch (_) {
      return const B2BQuotationCart();
    }
  }

  void _commit(B2BQuotationCart next) {
    state = next;
    try {
      ref.read(localStoreProvider).writeRfqDraft(next);
    } catch (_) {
      // Persistence unavailable — keep the in-memory basket only.
    }
  }

  /// Resolve the sellable variant behind an RFQ line, which stores the SKU
  /// rather than the product id.
  ProductVariant? _variantForSku(String sku) {
    for (final product in ref.read(tradeCatalogueViewProvider)) {
      for (final variant in product.product.variants) {
        if (variant.sku == sku) return variant;
      }
    }
    return null;
  }

  /// Adds one SKU of a grouped product.
  ///
  /// [variant] is the SKU the buyer selected on the product page. Without one,
  /// the product's first sellable variant is used so a grouped product is never
  /// added under its product id when real SKUs exist.
  void addTradeProduct(TradeProduct product,
      {int? quantity, ProductVariant? variant}) {
    final selected = variant ?? product.product.defaultVariant;
    final qty = quantity ?? product.moq;
    addSku(
      sku: selected?.sku ?? product.product.id,
      name: selected == null
          ? product.product.title
          : '${product.product.title} · ${selected.label}',
      quantity: qty,
      unitPrice: b2bUnitPriceFor(selected, qty) ??
          selected?.price ??
          product.unitPriceFor(qty),
      seller: selected?.sellerName,
    );
  }

  void addSku({
    required String sku,
    required String name,
    required int quantity,
    Money? unitPrice,
    String? seller,
  }) {
    if (sku.trim().isEmpty || quantity <= 0) return;
    final catalogue = ref.read(tradeCatalogueViewProvider);
    TradeProduct? match;
    for (final product in catalogue) {
      if (product.product.id == sku ||
          product.product.title.toLowerCase() == name.toLowerCase()) {
        match = product;
        break;
      }
    }
    final variant = _variantForSku(sku);
    // A configured B2B tier is the seller's trade price at this quantity. Only
    // fall back to the local fixture ladder when the catalogue has no variants.
    final tierPriced = match != null && match.product.variants.isEmpty;
    final resolvedPrice = unitPrice ??
        b2bUnitPriceFor(variant, quantity) ??
        (tierPriced ? match.unitPriceFor(quantity) : null) ??
        match?.tradePrice ??
        _inr(100);
    final index = state.lines.indexWhere((line) => line.sku == sku);
    final next = List<B2BQuotationLine>.of(state.lines);
    if (index >= 0) {
      // Established quantity-merging rule: an identical SKU/variant/unit/seller
      // line is merged (quantities summed) rather than duplicated. Any buyer
      // target price already entered on the line is preserved.
      final existing = next[index];
      final combinedQuantity = existing.quantity + quantity;
      next[index] = B2BQuotationLine(
        sku: existing.sku,
        name: existing.name,
        quantity: combinedQuantity,
        unitPrice: b2bUnitPriceFor(variant, combinedQuantity) ??
            (tierPriced
                ? match.unitPriceFor(combinedQuantity)
                : existing.unitPrice),
        targetUnitPrice: existing.targetUnitPrice,
        seller: existing.seller ?? seller,
      );
    } else {
      next.add(B2BQuotationLine(
        sku: sku,
        name: name,
        quantity: quantity,
        unitPrice: resolvedPrice,
        seller: seller,
      ));
    }
    _commit(state.copyWith(lines: next, status: RfqStatus.draft));
  }

  void addProcurementItems(
    Iterable<ProcurementListItem> items, {
    Map<String, int> quantities = const <String, int>{},
  }) {
    for (final item in items) {
      final quantity = quantities[item.sku] ?? item.quantity;
      if (quantity > 0) {
        addSku(
          sku: item.sku,
          name: item.name,
          quantity: quantity,
          unitPrice: item.unitPrice,
        );
      }
    }
  }

  void addRepeatOrder(B2BOrder order) {
    // Reorder drops the *entire* previous order back into the cart.
    if (order.lines.isEmpty) {
      for (final product in ref.read(tradeCatalogueViewProvider).take(2)) {
        addTradeProduct(product);
      }
      return;
    }
    for (final line in order.lines) {
      addSku(
        sku: line.sku,
        name: line.name,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
      );
    }
  }

  void updateQuantity(String sku, int quantity) {
    if (quantity <= 0) {
      remove(sku);
      return;
    }
    TradeProduct? catalogueMatch;
    for (final product in ref.read(tradeCatalogueViewProvider)) {
      if (product.product.id == sku) {
        catalogueMatch = product;
        break;
      }
    }
    final tierPriced =
        catalogueMatch != null && catalogueMatch.product.variants.isEmpty;
    final variant = _variantForSku(sku);
    _commit(state.copyWith(
      lines: <B2BQuotationLine>[
        for (final line in state.lines)
          line.sku == sku
              ? B2BQuotationLine(
                  sku: line.sku,
                  name: line.name,
                  quantity: quantity,
                  unitPrice: b2bUnitPriceFor(variant, quantity) ??
                      (tierPriced
                          ? catalogueMatch.unitPriceFor(quantity)
                          : line.unitPrice),
                  targetUnitPrice: line.targetUnitPrice,
                  seller: line.seller,
                )
              : line,
      ],
    ));
  }

  /// Set (or clear) the buyer's target unit price for a line.
  void setTargetPrice(String sku, Money? target) {
    _commit(state.copyWith(
      lines: <B2BQuotationLine>[
        for (final line in state.lines)
          line.sku == sku
              ? B2BQuotationLine(
                  sku: line.sku,
                  name: line.name,
                  quantity: line.quantity,
                  unitPrice: line.unitPrice,
                  targetUnitPrice: target,
                  seller: line.seller,
                )
              : line,
      ],
    ));
  }

  void setDeliveryLocation(String? location) => _commit(B2BQuotationCart(
        lines: state.lines,
        status: state.status,
        deliveryLocation: location,
        deliveryTier: state.deliveryTier,
        requiredBy: state.requiredBy,
        remarks: state.remarks,
        reference: state.reference,
      ));

  void setDeliveryTier(String tier) => _commit(B2BQuotationCart(
        lines: state.lines,
        status: state.status,
        deliveryLocation: state.deliveryLocation,
        deliveryTier: tier,
        requiredBy: state.requiredBy,
        remarks: state.remarks,
        reference: state.reference,
      ));

  void setRequiredBy(DateTime? date) => _commit(B2BQuotationCart(
        lines: state.lines,
        status: state.status,
        deliveryLocation: state.deliveryLocation,
        deliveryTier: state.deliveryTier,
        requiredBy: date,
        remarks: state.remarks,
        reference: state.reference,
      ));

  void setRemarks(String? remarks) => _commit(B2BQuotationCart(
        lines: state.lines,
        status: state.status,
        deliveryLocation: state.deliveryLocation,
        deliveryTier: state.deliveryTier,
        requiredBy: state.requiredBy,
        remarks: remarks,
        reference: state.reference,
      ));

  void remove(String sku) => _commit(state.copyWith(
        lines: state.lines.where((line) => line.sku != sku).toList(),
      ));

  /// Persist the current basket as a draft without submitting it.
  void saveDraft() => _commit(state.copyWith(status: RfqStatus.draft));

  /// Submit the RFQ. Assigns a reference id and returns it. Never creates a
  /// purchase order or triggers payment.
  String submit() {
    final reference = state.reference ?? _nextReference();
    _commit(state.copyWith(status: RfqStatus.submitted, reference: reference));
    return reference;
  }

  String _nextReference() {
    final n = DateTime.now().millisecondsSinceEpoch % 10000;
    return 'RFQ-${n.toString().padLeft(4, '0')}';
  }

  void clear() => _commit(const B2BQuotationCart());
}

final b2bQuotationCartProvider =
    NotifierProvider<B2BQuotationCartNotifier, B2BQuotationCart>(
  B2BQuotationCartNotifier.new,
);

/// The buyer's placed purchase-order history, persisted across sessions and
/// seeded once from the dashboard's repeat orders.
class B2BOrdersNotifier extends Notifier<List<B2BOrder>> {
  @override
  List<B2BOrder> build() {
    try {
      final store = ref.read(localStoreProvider);
      if (!store.hasB2bOrders()) {
        final seed = ref.read(tradeDashboardProvider).repeatOrders;
        store.writeB2bOrders(seed); // first-run seed (fire-and-forget)
        return seed;
      }
      return store.readB2bOrders();
    } catch (_) {
      return ref.read(tradeDashboardProvider).repeatOrders;
    }
  }

  Future<void> _commit(List<B2BOrder> next) async {
    state = next;
    try {
      await ref.read(localStoreProvider).writeB2bOrders(next);
    } catch (_) {
      // Persistence unavailable — the in-memory history still stands.
    }
  }

  /// Convert the quotation cart into a placed order, prepend it to the history
  /// and clear the cart. Returns null for an empty cart or when no delivery
  /// site has been selected.
  Future<B2BOrder?> placeOrder(B2BQuotationCart cart, {String? poRef}) async {
    if (cart.isEmpty || cart.deliveryLocation?.trim().isEmpty != false) {
      return null;
    }
    final reference = poRef ?? 'Order #PO-${3400 + state.length}';
    final order = B2BOrder(
      reference: reference,
      dateLabel: 'Today',
      itemSummary:
          '${cart.lines.length} ${cart.lines.length == 1 ? 'item' : 'items'}',
      total: cart.total,
      deliveryLocation: cart.deliveryLocation,
      lines: <B2BOrderLine>[
        for (final line in cart.lines)
          B2BOrderLine(
            sku: line.sku,
            name: line.name,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
          ),
      ],
    );
    await _commit(<B2BOrder>[order, ...state]);
    ref.read(b2bQuotationCartProvider.notifier).clear();
    return order;
  }

  B2BOrder? get latest => state.isEmpty ? null : state.first;
}

final b2bOrdersProvider =
    NotifierProvider<B2BOrdersNotifier, List<B2BOrder>>(B2BOrdersNotifier.new);
