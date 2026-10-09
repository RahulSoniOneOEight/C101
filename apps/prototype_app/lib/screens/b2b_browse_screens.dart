import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../domain/b2b_trade_models.dart';
import '../providers/b2b_trade_providers.dart';
import '../widgets/trade_product_tile.dart';

/// B2B catalogue / category browse. Entry points are the home category rail,
/// header search, and the Seasonal / Best Deals merchandising tiles; content is
/// filtered data-driven via [tradeCatalogueProvider].
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
  final TextEditingController _searchController = TextEditingController();

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _resetPaging() => _visible = _pageSize;

  void _loadMore(int total) {
    if (_visible >= total) return;
    setState(() => _visible += _pageSize);
  }

  @override
  Widget build(BuildContext context) {
    final products = ref.watch(tradeCatalogueProvider);
    final categories = ref.watch(tradeDashboardProvider).categories;

    final filtered = products.where((p) {
      if (_categoryId != null && p.categoryId != _categoryId) return false;
      if (_dealsOnly && p.savingsPercent == null) return false;
      if (_seasonalOnly && !p.seasonal) return false;
      if (_query.isNotEmpty &&
          !p.product.title.toLowerCase().contains(_query.toLowerCase())) {
        return false;
      }
      return true;
    }).toList();

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
      appBar: AppBar(title: Text(title)),
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
            SliverToBoxAdapter(
              child: SizedBox(
                height: 48,
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(
                      horizontal: AgencySpacing.md, vertical: AgencySpacing.sm),
                  children: <Widget>[
                    _chip('All', _categoryId == null && !_dealsOnly && !_seasonalOnly,
                        () => setState(() {
                              _categoryId = null;
                              _dealsOnly = false;
                              _seasonalOnly = false;
                              _resetPaging();
                            })),
                    for (final c in categories)
                      _chip(c.label, _categoryId == c.id, () => setState(() {
                            _categoryId = c.id;
                            _dealsOnly = false;
                            _seasonalOnly = false;
                            _resetPaging();
                          })),
                  ],
                ),
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
                      gridDelegate:
                          SliverGridDelegateWithFixedCrossAxisCount(
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
                  padding: const EdgeInsets.fromLTRB(AgencySpacing.md, 0,
                      AgencySpacing.md, AgencySpacing.lg),
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

  Widget _resultRow(
      BuildContext context, AgencyColors colors, TradeProduct p) {
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
                  style: TextStyle(
                      fontSize: 13, color: colors.contentPrimary)),
            ),
            Text(p.tradePrice.formatted,
                style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: colors.actionPrimary)),
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
      appBar: AppBar(title: const Text('Schemes & Offers')),
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
    final products = ref.watch(tradeCatalogueProvider);

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
      appBar: AppBar(title: const Text('My Price Advantage')),
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
