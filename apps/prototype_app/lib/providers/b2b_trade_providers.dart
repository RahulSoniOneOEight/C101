import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/local_store.dart';
import '../domain/b2b_trade_models.dart';
import '../domain/models.dart';

/// Trade category descriptors (icon + label) for the trade rail + catalogue.
class TradeCategory {
  const TradeCategory(
      {required this.id, required this.label, required this.icon});

  final String id;
  final String label;
  final IconData icon;
}

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
      return store.readProcurementLists();
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

  Future<ProcurementList> createList({
    required String title,
    String description = 'Saved list',
  }) async {
    final list = ProcurementList(
      id: 'pl_user_${DateTime.now().microsecondsSinceEpoch}',
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
      id: 'pl_user_${DateTime.now().microsecondsSinceEpoch}',
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
      _list(
          'pl_seasonal',
          'Seasonal',
          'Peak-season electrical demand',
          ProcurementListSourceType.buyerSaved,
          <(String, String, int)>[
            ('prod_led', 'LED Bulb 9W Cool White', 20),
            ('prod_mcb', 'MCB 32A Single Pole', 10),
            ('prod_wire', 'Copper Wire 1.5sqmm', 5),
          ],
          campaignRef: 'CAM-SEASON-26'),
      _list(
          'pl_kitchen',
          'Kitchen Works',
          'Sinks, taps and fittings for kitchen fit-outs',
          ProcurementListSourceType.buyerSaved, <(String, String, int)>[
        ('prod_bibcock', 'Bib Cock 15mm Full Turn Chrome', 10),
        ('prod_cpvc', 'CPVC Pipe 3/4 in', 50),
        ('prod_ballvalve', 'Ball Valve 25mm', 10),
      ]),
      _list(
          'pl_floor',
          'Floor Essentials',
          'Tiles, finishes and flooring consumables',
          ProcurementListSourceType.buyerSaved, <(String, String, int)>[
        ('prod_tiles', 'Ceramic Floor Tiles 600x600 Matt', 10),
        ('prod_paint', 'Emulsion Paint 20L', 4),
        ('prod_fittings', 'Bathroom Fittings Set', 4),
      ]),
    ];

/// The quick-order presets shown on the B2B Home — the kept list names.
final quickOrderPresetsProvider = Provider<List<String>>((ref) =>
    <String>[for (final l in ref.watch(procurementListsProvider)) l.title]);

final procurementListProvider =
    Provider.autoDispose.family<ProcurementList?, String>((ref, id) {
  final lists = ref.watch(procurementListsProvider);
  for (final list in lists) {
    if (list.id == id) return list;
  }
  return null;
});

/// Demo trade dashboard fixture. Real data is resolved from the backend later;
/// this exercises the trade UI with the reference profile.
final tradeDashboardProvider = Provider<TradeDashboard>((ref) {
  return TradeDashboard(
    categories: const <TradeCategory>[
      TradeCategory(
          id: 'plumbing', label: 'Plumbing', icon: Icons.water_drop_outlined),
      TradeCategory(
          id: 'electricals', label: 'Electricals', icon: Icons.bolt_outlined),
      TradeCategory(
          id: 'sanitary',
          label: 'Premium Sanitary',
          icon: Icons.bathtub_outlined),
      TradeCategory(
          id: 'paints',
          label: 'Paints & Construction',
          icon: Icons.format_paint_outlined),
      TradeCategory(
          id: 'hardware',
          label: 'Hardware & Tools',
          icon: Icons.handyman_outlined),
      TradeCategory(
          id: 'agri', label: 'Agriculture', icon: Icons.grass_outlined),
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
  'plumbing':
      'https://images.pexels.com/photos/585419/pexels-photo-585419.jpeg?auto=compress&cs=tinysrgb&w=600',
  'electricals':
      'https://images.pexels.com/photos/577514/pexels-photo-577514.jpeg?auto=compress&cs=tinysrgb&w=600',
  'paints':
      'https://images.pexels.com/photos/207142/pexels-photo-207142.jpeg?auto=compress&cs=tinysrgb&w=600',
  'hardware':
      'https://images.pexels.com/photos/1249611/pexels-photo-1249611.jpeg?auto=compress&cs=tinysrgb&w=600',
  'sanitary':
      'https://images.pexels.com/photos/6492403/pexels-photo-6492403.jpeg?auto=compress&cs=tinysrgb&w=600',
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

/// The full B2B trade catalogue, category-tagged and seasonally flagged. This
/// powers the catalogue/category browse, Best Deals and Seasonal surfaces. In
/// production it is fed by the product/catalog backend.
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
      categoryId: 'plumbing',
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
      categoryId: 'plumbing',
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
      categoryId: 'plumbing',
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
      categoryId: 'electricals',
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
      categoryId: 'electricals',
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
      categoryId: 'electricals',
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
      categoryId: 'electricals',
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
      categoryId: 'paints',
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
      categoryId: 'paints',
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
      categoryId: 'hardware',
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
      categoryId: 'hardware',
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
      categoryId: 'sanitary',
      tiers: const [(4, 2450), (10, 2320), (20, 2240)],
    ),
  ];
  return <TradeProduct>[for (final p in base) _withSellers(p)];
});

/// Frequently bought / saved products surfaced in the "Frequent & Saved"
/// collection swimlane on the B2B home.
final frequentSavedProvider = Provider<List<TradeProduct>>((ref) {
  final catalogue = ref.watch(tradeCatalogueProvider);
  const ids = {'prod_bibcock', 'prod_cpvc', 'prod_switch', 'prod_led'};
  return catalogue.where((p) => ids.contains(p.product.id)).toList();
});

/// Products with the buyer's best price advantage (highest savings), surfaced
/// in the "My Price Advantage" collection swimlane.
final priceAdvantageProvider = Provider<List<TradeProduct>>((ref) {
  final catalogue = ref.watch(tradeCatalogueProvider);
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

  void addTradeProduct(TradeProduct product, {int? quantity}) {
    final qty = quantity ?? product.moq;
    addSku(
      sku: product.product.id,
      name: product.product.title,
      quantity: qty,
      unitPrice: product.unitPriceFor(qty),
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
    final catalogue = ref.read(tradeCatalogueProvider);
    TradeProduct? match;
    for (final product in catalogue) {
      if (product.product.id == sku ||
          product.product.title.toLowerCase() == name.toLowerCase()) {
        match = product;
        break;
      }
    }
    final resolvedPrice =
        unitPrice ?? match?.unitPriceFor(quantity) ?? _inr(100);
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
        unitPrice: match?.unitPriceFor(combinedQuantity) ?? resolvedPrice,
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
      for (final product in ref.read(tradeCatalogueProvider).take(2)) {
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
    for (final product in ref.read(tradeCatalogueProvider)) {
      if (product.product.id == sku) {
        catalogueMatch = product;
        break;
      }
    }
    _commit(state.copyWith(
      lines: <B2BQuotationLine>[
        for (final line in state.lines)
          line.sku == sku
              ? B2BQuotationLine(
                  sku: line.sku,
                  name: line.name,
                  quantity: quantity,
                  unitPrice:
                      catalogueMatch?.unitPriceFor(quantity) ?? line.unitPrice,
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
        requiredBy: state.requiredBy,
        remarks: state.remarks,
        reference: state.reference,
      ));

  void setRequiredBy(DateTime? date) => _commit(B2BQuotationCart(
        lines: state.lines,
        status: state.status,
        deliveryLocation: state.deliveryLocation,
        requiredBy: date,
        remarks: state.remarks,
        reference: state.reference,
      ));

  void setRemarks(String? remarks) => _commit(B2BQuotationCart(
        lines: state.lines,
        status: state.status,
        deliveryLocation: state.deliveryLocation,
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
