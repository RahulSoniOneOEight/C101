import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../domain/b2b_trade_models.dart';
import '../domain/presentation.dart';
import '../providers/b2b_trade_providers.dart';
import '../providers/catalog_providers.dart';
import '../providers/conversation_dock_provider.dart';
import '../theme/storefront_control_tokens.dart';
import '../widgets/storefront_control_bar.dart';
import '../widgets/conversation_bell.dart';
import '../widgets/trade_product_tile.dart';

/// B2B catalogue / category browse. Entry points are the home category rail,
/// header search, and the Seasonal / Best Deals merchandising tiles; content is
/// filtered data-driven via [tradeCatalogueViewProvider].
class B2BCatalogueScreen extends ConsumerStatefulWidget {
  const B2BCatalogueScreen({
    this.initialCategoryId,
    this.dealsOnly = false,
    this.seasonalOnly = false,
    super.key,
  });

  final String? initialCategoryId;
  final bool dealsOnly;
  final bool seasonalOnly;

  @override
  ConsumerState<B2BCatalogueScreen> createState() => _B2BCatalogueScreenState();
}

enum _CatalogueSort { recommended, priceAsc, priceDesc, discount }

extension on _CatalogueSort {
  String get label => switch (this) {
        _CatalogueSort.recommended => 'Recommended',
        _CatalogueSort.priceAsc => 'Price \u2191',
        _CatalogueSort.priceDesc => 'Price \u2193',
        _CatalogueSort.discount => 'Discount',
      };
}

class _B2BCatalogueScreenState extends ConsumerState<B2BCatalogueScreen> {
  /// Products revealed per page; "Load more" (button or scroll) appends another
  /// page so a category can grow into a long scroll.
  static const int _pageSize = 6;

  final Map<String, int> _selectedTier = <String, int>{};
  final Map<String, int> _qty = <String, int>{};
  late String? _categoryId = widget.initialCategoryId;
  late bool _dealsOnly = widget.dealsOnly;
  late bool _seasonalOnly = widget.seasonalOnly;
  String _query = '';
  int _visible = _pageSize;
  _CatalogueSort _sort = _CatalogueSort.recommended;
  bool _inStockOnly = false;
  String? _priceBand;
  final TextEditingController _searchController = TextEditingController();

  static const List<String> _quickFilters = <String>[
    'Best Deals',
    'Seasonal',
    'In stock',
  ];
  static const List<String> _priceBands = <String>[
    'Under \u20b9500',
    '\u20b9500 \u2013 \u20b95,000',
    '\u20b95,000+',
  ];

  int get _filterCount =>
      (_dealsOnly ? 1 : 0) +
      (_seasonalOnly ? 1 : 0) +
      (_inStockOnly ? 1 : 0) +
      (_priceBand == null ? 0 : 1);

  Set<String> get _quickSelected => <String>{
        if (_dealsOnly) 'Best Deals',
        if (_seasonalOnly) 'Seasonal',
        if (_inStockOnly) 'In stock',
      };

  void _clearFilters() {
    setState(() {
      _dealsOnly = false;
      _seasonalOnly = false;
      _inStockOnly = false;
      _priceBand = null;
      _resetPaging();
    });
  }

  void _toggleQuickFilter(String label) {
    setState(() {
      switch (label) {
        case 'Best Deals':
          _dealsOnly = !_dealsOnly;
        case 'Seasonal':
          _seasonalOnly = !_seasonalOnly;
        case 'In stock':
          _inStockOnly = !_inStockOnly;
      }
      _resetPaging();
    });
  }

  List<TradeProduct> _filtered(
    List<TradeProduct> products, {
    bool? dealsOnly,
    bool? seasonalOnly,
    bool? inStockOnly,
    String? priceBand,
  }) {
    final deals = dealsOnly ?? _dealsOnly;
    final seasonal = seasonalOnly ?? _seasonalOnly;
    final inStock = inStockOnly ?? _inStockOnly;
    final band = priceBand ?? _priceBand;
    return products.where((p) {
      if (_categoryId != null && p.categoryId != _categoryId) return false;
      if (deals && p.savingsPercent == null) return false;
      if (seasonal && !p.seasonal) return false;
      if (inStock && !(p.stockKnown ? p.stockQty > 0 : true)) return false;
      if (band != null) {
        final amount = p.tradePrice.amount / 100;
        if (band == 'Under \u20b9500' && amount >= 500) return false;
        if (band == '\u20b9500 \u2013 \u20b95,000' &&
            (amount < 500 || amount > 5000)) {
          return false;
        }
        if (band == '\u20b95,000+' && amount <= 5000) return false;
      }
      if (!_matchesQuery(p)) return false;
      return true;
    }).toList();
  }

  List<TradeProduct> _sorted(List<TradeProduct> list) {
    switch (_sort) {
      case _CatalogueSort.priceAsc:
        return List<TradeProduct>.of(list)
          ..sort((a, b) => a.tradePrice.amount.compareTo(b.tradePrice.amount));
      case _CatalogueSort.priceDesc:
        return List<TradeProduct>.of(list)
          ..sort((a, b) => b.tradePrice.amount.compareTo(a.tradePrice.amount));
      case _CatalogueSort.discount:
        return List<TradeProduct>.of(list)
          ..sort((a, b) =>
              (b.savingsPercent ?? 0).compareTo(a.savingsPercent ?? 0));
      case _CatalogueSort.recommended:
        return list;
    }
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _resetPaging() => _visible = _pageSize;

  /// Search covers the product, its brand, every variant label/SKU and the
  /// seller name, so a buyer who only knows a SKU still finds the grouped card.
  bool _matchesQuery(TradeProduct p) {
    final q = _query.trim();
    if (q.isEmpty) return true;
    if (p.product.matchesQuery(q)) return true;
    final lower = q.toLowerCase();
    return p.sellers.any((seller) => seller.name.toLowerCase().contains(lower));
  }

  void _loadMore(int total) {
    if (_visible >= total) return;
    setState(() => _visible += _pageSize);
  }

  Future<void> _openFilters() async {
    final products = ref.read(tradeCatalogueViewProvider);
    var deals = _dealsOnly;
    var seasonal = _seasonalOnly;
    var inStock = _inStockOnly;
    String? band = _priceBand;

    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (sheetContext) {
        final colors = Theme.of(sheetContext).extension<AgencyColors>() ??
            AgencyColors.light;
        final fill = StorefrontControlTokens.filterFill(sheetContext);
        final ink = StorefrontControlTokens.filterInk(sheetContext);
        return StatefulBuilder(
          builder: (sheetContext, setSheet) {
            final preview = _filtered(
              products,
              dealsOnly: deals,
              seasonalOnly: seasonal,
              inStockOnly: inStock,
              priceBand: band,
            ).length;
            Widget toggle(String label, bool selected, VoidCallback onTap) =>
                StorefrontControlChip(
                  label: label,
                  selected: selected,
                  fill: fill,
                  ink: ink,
                  onTap: () => setSheet(onTap),
                );
            return SafeArea(
              child: Padding(
                padding: EdgeInsets.only(
                  left: AgencySpacing.md,
                  right: AgencySpacing.md,
                  bottom: MediaQuery.of(sheetContext).viewInsets.bottom,
                ),
                child: ConstrainedBox(
                  constraints: BoxConstraints(
                    maxHeight: MediaQuery.sizeOf(sheetContext).height * 0.75,
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Row(
                        children: <Widget>[
                          Text('Filters',
                              style: TextStyle(
                                  fontSize: 17,
                                  fontWeight: FontWeight.w700,
                                  color: colors.contentPrimary)),
                          const Spacer(),
                          Text('$preview results',
                              style: TextStyle(
                                  fontSize: 11,
                                  color: colors.contentSecondary)),
                        ],
                      ),
                      Flexible(
                        child: SingleChildScrollView(
                          padding: const EdgeInsets.only(top: AgencySpacing.sm),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: <Widget>[
                              _sheetGroup(sheetContext, 'Price'),
                              Wrap(
                                spacing: 6,
                                runSpacing: 6,
                                children: <Widget>[
                                  for (final option in _priceBands)
                                    toggle(
                                      option,
                                      band == option,
                                      () =>
                                          band = band == option ? null : option,
                                    ),
                                ],
                              ),
                              const SizedBox(height: AgencySpacing.md),
                              _sheetGroup(sheetContext, 'Trade filters'),
                              Wrap(
                                spacing: 6,
                                runSpacing: 6,
                                children: <Widget>[
                                  toggle('Best Deals', deals,
                                      () => deals = !deals),
                                  toggle('Seasonal', seasonal,
                                      () => seasonal = !seasonal),
                                  toggle('In stock', inStock,
                                      () => inStock = !inStock),
                                ],
                              ),
                            ],
                          ),
                        ),
                      ),
                      Padding(
                        padding: const EdgeInsets.symmetric(
                            vertical: AgencySpacing.sm),
                        child: Row(
                          children: <Widget>[
                            TextButton(
                              onPressed: () => setSheet(() {
                                deals = false;
                                seasonal = false;
                                inStock = false;
                                band = null;
                              }),
                              style: TextButton.styleFrom(
                                minimumSize: const Size(44, 48),
                                foregroundColor: colors.contentSecondary,
                              ),
                              child: const Text('Reset'),
                            ),
                            const SizedBox(width: AgencySpacing.sm),
                            Expanded(
                              child: FilledButton(
                                onPressed: () {
                                  setState(() {
                                    _dealsOnly = deals;
                                    _seasonalOnly = seasonal;
                                    _inStockOnly = inStock;
                                    _priceBand = band;
                                    _resetPaging();
                                  });
                                  Navigator.of(sheetContext).pop();
                                },
                                style: FilledButton.styleFrom(
                                  backgroundColor: ink,
                                  foregroundColor: colors.contentInverse,
                                  minimumSize: const Size.fromHeight(48),
                                ),
                                child: Text('Show $preview results'),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            );
          },
        );
      },
    );
  }

  Widget _sheetGroup(BuildContext context, String label) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w600,
            color:
                Theme.of(context).extension<AgencyColors>()?.contentSecondary,
          ),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final products = ref.watch(tradeCatalogueViewProvider);
    final categories = ref.watch(tradeCategoryOptionsProvider);
    final catalogueSource = ref.watch(tradeCatalogueSourceProvider);

    final filtered = _sorted(_filtered(products));

    final visible = filtered.take(_visible).toList();
    final hasMore = _visible < filtered.length;

    final title = _dealsOnly
        ? 'Best Deals'
        : _seasonalOnly
            ? 'Seasonal'
            : _categoryId == null
                ? 'Catalogue'
                : categories
                        .where((c) => c.id == _categoryId)
                        .map((c) => c.label)
                        .firstOrNull ??
                    'Catalogue';

    return Scaffold(
      appBar: AppBar(
        title: Text(title),
        actions: const <Widget>[
          ConversationBellButton(audience: ConversationAudience.business),
        ],
      ),
      body: NotificationListener<ScrollNotification>(
        onNotification: (n) {
          // Auto-append as the buyer nears the end — a long, seamless scroll.
          if (hasMore && n.metrics.pixels >= n.metrics.maxScrollExtent - 400) {
            _loadMore(filtered.length);
          }
          return false;
        },
        child: CustomScrollView(
          slivers: <Widget>[
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(
                    AgencySpacing.md, AgencySpacing.sm, AgencySpacing.md, 0),
                child: TextField(
                  controller: _searchController,
                  decoration: InputDecoration(
                    hintText: 'Search products, SKU',
                    prefixIcon: const Icon(Icons.search),
                    isDense: true,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(AgencyRadius.md),
                    ),
                  ),
                  onChanged: (value) => setState(() {
                    _query = value;
                    _resetPaging();
                  }),
                ),
              ),
            ),
            if (catalogueSource == TradeCatalogueSource.loading)
              const SliverToBoxAdapter(
                child: Padding(
                  padding: EdgeInsets.fromLTRB(
                      AgencySpacing.md, AgencySpacing.sm, AgencySpacing.md, 0),
                  child: LinearProgressIndicator(minHeight: 2),
                ),
              ),
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(
                    AgencySpacing.md, AgencySpacing.sm, AgencySpacing.md, 0),
                child: MerchandisingBanner(
                  imageUrl: ref.watch(
                          b2bCategoryBannerImageByIdProvider(_categoryId)) ??
                      fallbackCategoryBannerImage,
                  imageAlt:
                      ref.watch(b2bCategoryBannerAltByIdProvider(_categoryId)),
                  title: title,
                  subtitle: 'Trade rates · MOQ · GST invoicing',
                  ctaLabel: 'Filters',
                  onCta: () => setState(() {
                    _dealsOnly = true;
                    _seasonalOnly = false;
                    _resetPaging();
                  }),
                ),
              ),
            ),
            SliverToBoxAdapter(
              child: SizedBox(
                height: 48,
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(
                      horizontal: AgencySpacing.md, vertical: AgencySpacing.sm),
                  children: <Widget>[
                    _chip(
                        'All',
                        _categoryId == null && !_dealsOnly && !_seasonalOnly,
                        () => setState(() {
                              _categoryId = null;
                              _dealsOnly = false;
                              _seasonalOnly = false;
                              _resetPaging();
                            })),
                    for (final c in categories)
                      _chip(
                          c.label,
                          _categoryId == c.id,
                          () => setState(() {
                                _categoryId = c.id;
                                _dealsOnly = false;
                                _seasonalOnly = false;
                                _resetPaging();
                              })),
                  ],
                ),
              ),
            ),
            SliverPersistentHeader(
              pinned: true,
              delegate: StorefrontControlHeaderDelegate(
                sortOptions: <String>[
                  for (final option in _CatalogueSort.values) option.label,
                ],
                selectedSort: _sort.label,
                onSort: (label) => setState(() {
                  _sort = _CatalogueSort.values
                      .firstWhere((option) => option.label == label);
                  _resetPaging();
                }),
                quickFilters: _quickFilters,
                selectedQuickFilters: _quickSelected,
                onToggleQuickFilter: _toggleQuickFilter,
                filterCount: _filterCount,
                onOpenFilters: _openFilters,
                resultCount: filtered.length,
                onClearFilters: _clearFilters,
              ),
            ),
            if (filtered.isEmpty)
              SliverToBoxAdapter(child: _noResults(context, products))
            else
              SliverPadding(
                padding: const EdgeInsets.all(AgencySpacing.md),
                // Responsive two-column mobile grid: columns from the available
                // constraint, extent sized to the tile's actual content.
                sliver: SliverLayoutBuilder(
                  builder: (context, constraints) {
                    final columns = constraints.crossAxisExtent >= 900
                        ? 4
                        : constraints.crossAxisExtent >= 600
                            ? 3
                            : 2;
                    return SliverGrid(
                      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                        crossAxisCount: columns,
                        mainAxisSpacing: AgencySpacing.sm,
                        crossAxisSpacing: AgencySpacing.sm,
                        mainAxisExtent: kB2bProductCardExtent,
                      ),
                      delegate: SliverChildBuilderDelegate(
                        (context, i) {
                          final p = visible[i];
                          final selected = _selectedTier[p.product.id] ?? 0;
                          final defaultQty = p.tiers.isEmpty
                              ? p.moq
                              : p.tiers[selected.clamp(0, p.tiers.length - 1)]
                                  .quantity;
                          final qty = _qty[p.product.id] ?? defaultQty;
                          return tradeProductTile(
                            context,
                            ref,
                            p,
                            selectedTierIndex: selected,
                            onTierSelected: (t) => setState(() {
                              _selectedTier[p.product.id] = t;
                              _qty.remove(p.product.id);
                            }),
                            quantity: qty,
                            onQuantityChanged: (v) =>
                                setState(() => _qty[p.product.id] = v),
                          );
                        },
                        childCount: visible.length,
                      ),
                    );
                  },
                ),
              ),
            if (filtered.isNotEmpty)
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(
                      AgencySpacing.md, 0, AgencySpacing.md, AgencySpacing.lg),
                  child: hasMore
                      ? PinWorkflowAction(
                          label: 'Load more products',
                          hierarchy: PinWorkflowHierarchy.secondary,
                          onPressed: () => _loadMore(filtered.length),
                        )
                      : Center(
                          child: Text(
                            'All ${filtered.length} products shown',
                            style: TextStyle(
                                fontSize: 12,
                                color: _colorsOf(context).contentSecondary),
                          ),
                        ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  /// Shown when a search/filter yields nothing: suggested searches plus a few
  /// products so the catalogue is never a dead end.
  Widget _noResults(BuildContext context, List<TradeProduct> products) {
    final colors = _colorsOf(context);
    final suggestions = _query.trim().isEmpty
        ? const <String>['Tiles', 'Wire', 'Paint', 'LED', 'Valve', 'Drill']
        : <String>[_query.trim(), 'Tiles', 'Wire', 'Paint', 'Drill'];
    final pool = (_categoryId == null
            ? products
            : products.where((p) => p.categoryId == _categoryId).toList())
        .take(4)
        .toList();
    return Padding(
      padding: const EdgeInsets.all(AgencySpacing.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Icon(Icons.search_off, color: colors.contentSecondary, size: 32),
          const SizedBox(height: AgencySpacing.sm),
          Text('No products match',
              style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: colors.contentPrimary)),
          const SizedBox(height: AgencySpacing.md),
          Text('Suggested searches',
              style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: colors.contentPrimary)),
          const SizedBox(height: AgencySpacing.sm),
          Wrap(
            spacing: AgencySpacing.sm,
            runSpacing: AgencySpacing.sm,
            children: <Widget>[
              for (final s in suggestions)
                ActionChip(
                  label: Text(s, style: const TextStyle(fontSize: 12)),
                  onPressed: () => setState(() {
                    _searchController.text = s;
                    _query = s;
                    _resetPaging();
                  }),
                ),
            ],
          ),
          if (pool.isNotEmpty) ...<Widget>[
            const SizedBox(height: AgencySpacing.lg),
            Text('Popular products',
                style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: colors.contentPrimary)),
            const SizedBox(height: AgencySpacing.sm),
            for (final p in pool) _resultRow(context, colors, p),
          ],
        ],
      ),
    );
  }

  Widget _resultRow(BuildContext context, AgencyColors colors, TradeProduct p) {
    return InkWell(
      onTap: () => context.push('/b2b/pdp/${p.product.id}'),
      borderRadius: BorderRadius.circular(AgencyRadius.md),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(
          children: <Widget>[
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: colors.surfacePage,
                borderRadius: BorderRadius.circular(AgencyRadius.sm),
              ),
              child: Icon(Icons.image_outlined,
                  size: 20, color: colors.contentSecondary),
            ),
            const SizedBox(width: AgencySpacing.sm),
            Expanded(
              child: Text(p.product.title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 13, color: colors.contentPrimary)),
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: <Widget>[
                Text(p.tradePrice.formatted,
                    style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: colors.actionPrimary)),
              ],
            ),
          ],
        ),
      ),
    );
  }

  AgencyColors _colorsOf(BuildContext context) =>
      Theme.of(context).extension<AgencyColors>() ?? AgencyColors.light;

  Widget _chip(String label, bool selected, VoidCallback onTap) {
    final colors = _colorsOf(context);
    return Padding(
      padding: const EdgeInsets.only(right: AgencySpacing.sm),
      child: ChoiceChip(
        label: Text(label),
        selected: selected,
        onSelected: (_) => onTap(),
        selectedColor: colors.surfaceInteractive,
        labelStyle: TextStyle(
          color: selected ? colors.actionPrimary : colors.contentPrimary,
          fontWeight: selected ? FontWeight.w600 : FontWeight.w400,
        ),
      ),
    );
  }
}

/// Active trade schemes / offers, surfaced from the home "Schemes" tile.
class B2BSchemesScreen extends ConsumerWidget {
  const B2BSchemesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final schemes = ref.watch(tradeDashboardProvider).schemes;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Schemes & Offers'),
        actions: const <Widget>[
          ConversationBellButton(audience: ConversationAudience.business),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(AgencySpacing.md),
        children: <Widget>[
          Text('Active offers for your account',
              style: TextStyle(
                  fontSize: 13,
                  color: Theme.of(context).colorScheme.onSurface)),
          const SizedBox(height: AgencySpacing.sm),
          PinCarousel(
            height: 230,
            children: <Widget>[
              for (final scheme in schemes)
                TradeSchemeCard(
                  title: scheme.title,
                  detail: scheme.detail,
                  badge: switch (scheme.badge) {
                    TradeSchemeBadgeType.freeGoods =>
                      TradeSchemeBadge.freeGoods,
                    TradeSchemeBadgeType.cashOffer =>
                      TradeSchemeBadge.cashOffer,
                    TradeSchemeBadgeType.creditScheme =>
                      TradeSchemeBadge.creditScheme,
                  },
                ),
            ],
          ),
        ],
      ),
    );
  }
}

/// The buyer's negotiated price advantage: account summary plus tier savings.
class B2BPriceAdvantageScreen extends ConsumerWidget {
  const B2BPriceAdvantageScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors =
        Theme.of(context).extension<AgencyColors>() ?? AgencyColors.light;
    final products = ref.watch(tradeCatalogueViewProvider);

    // Best savings available across the catalogue, for the headline metric.
    final maxSavings = products
        .map((p) => p.savingsPercent ?? 0)
        .fold(0, (a, b) => a > b ? a : b);

    // A representative product's tier ladder to illustrate savings.
    final sample = products.firstWhere(
      (p) => p.tiers.isNotEmpty,
      orElse: () => products.first,
    );

    return Scaffold(
      appBar: AppBar(
        title: const Text('My Price Advantage'),
        actions: const <Widget>[
          ConversationBellButton(audience: ConversationAudience.business),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(AgencySpacing.md),
        children: <Widget>[
          TradeAccountSummary(
            businessName: 'Sharma Traders',
            gstinLabel: 'GSTIN 08AAICS1234F1Z5',
            tradeDiscountLabel: 'Dealer tier',
            creditAvailableLabel: '₹4.2L',
            onView: () {},
          ),
          const SizedBox(height: AgencySpacing.md),
          Surface(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text('You save up to $maxSavings%',
                    style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                        color: colors.actionPrimary)),
                const SizedBox(height: AgencySpacing.xs),
                Text('Tier pricing on ${sample.product.title}',
                    style: TextStyle(
                        fontSize: 13, color: colors.contentSecondary)),
                const SizedBox(height: AgencySpacing.sm),
                for (final tier in sample.tiers)
                  Padding(
                    padding: const EdgeInsets.only(bottom: AgencySpacing.xs),
                    child: Row(
                      children: <Widget>[
                        Expanded(
                          child: Text('${tier.quantity}+ pcs',
                              style: TextStyle(
                                  fontSize: 13, color: colors.contentPrimary)),
                        ),
                        Text(tier.unitPrice.formatted,
                            style: TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w700,
                                color: colors.contentPrimary)),
                      ],
                    ),
                  ),
                const Divider(),
                Text(
                    'Savings apply automatically at checkout based on your '
                    'ordered quantity and tier.',
                    style: TextStyle(
                        fontSize: 11, color: colors.contentSecondary)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
