import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../domain/models.dart';
import '../providers/account_providers.dart';
import '../providers/cart_providers.dart';
import '../providers/catalog_providers.dart';
import '../theme/storefront_control_tokens.dart';
import '../widgets/notification_bell.dart';

/// Host scaffold for the D2C (consumer) section: persistent 4-tab bottom
/// navigation (Home / Browse / Cart / Account). Orders is reached from Account
/// rather than occupying its own tab.
class D2CShell extends StatelessWidget {
  const D2CShell({required this.navigationShell, super.key});

  final StatefulNavigationShell navigationShell;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: navigationShell,
      bottomNavigationBar: AppBottomNavigation(
        items: const <BottomNavItem>[
          BottomNavItem(label: 'Home', icon: Icons.home_outlined),
          BottomNavItem(label: 'Browse', icon: Icons.grid_view_outlined),
          BottomNavItem(label: 'Cart', icon: Icons.shopping_cart_outlined),
          BottomNavItem(label: 'Account', icon: Icons.person_outline),
        ],
        currentIndex: navigationShell.currentIndex,
        onSelected: (index) => navigationShell.goBranch(
          index,
          initialLocation: index == navigationShell.currentIndex,
        ),
      ),
    );
  }
}

/// Sort options for the marketplace browse grid.
enum BrowseSort { relevance, priceLowHigh, priceHighLow, rating }

extension on BrowseSort {
  String get label => switch (this) {
        BrowseSort.relevance => 'Relevance',
        BrowseSort.priceLowHigh => 'Price ↑',
        BrowseSort.priceHighLow => 'Price ↓',
        BrowseSort.rating => 'Rating',
      };
}

/// Marketplace **Browse** tab: search + category filters + sort/filter
/// (brand, price, key items) over a long-scrolling product grid.
class BrowseScreen extends ConsumerStatefulWidget {
  const BrowseScreen({this.initialTag, this.initialCategory, super.key});

  /// Optional collection tag carried from a home module's "See All" or a
  /// banner tap (e.g. "Flash Deals", "Best Sellers", "Clearance Sale").
  final String? initialTag;

  /// Optional category label to pre-select.
  final String? initialCategory;

  @override
  ConsumerState<BrowseScreen> createState() => _BrowseScreenState();
}

class _BrowseScreenState extends ConsumerState<BrowseScreen> {
  static const int _pageSize = 6;
  static const List<String> _priceRanges = <String>[
    'Under ₹500',
    '₹500 – ₹5,000',
    '₹5,000+',
  ];
  static const List<String> _keyItems = <String>[
    'On discount',
    'Bestseller',
    'Flash Deal',
    'Clearance',
    'In stock',
    'New',
    'Premium',
    'Highly rated',
    'Free delivery',
  ];

  /// Quick filters that stay visible on the listing. The bottom sheet keeps the
  /// full set; these are the three used most.
  static const List<String> _quickKeys = <String>[
    'Flash Deal',
    'Clearance',
    'In stock',
  ];

  final TextEditingController _search = TextEditingController();
  String _query = '';
  String? _category;
  BrowseSort _sort = BrowseSort.relevance;
  final Set<String> _brands = <String>{};
  final Set<String> _prices = <String>{};
  final Set<String> _keys = <String>{};
  double? _minRating;
  int _visible = _pageSize;

  int get _activeFilterCount =>
      _brands.length +
      _prices.length +
      _keys.length +
      (_minRating == null ? 0 : 1);

  @override
  void initState() {
    super.initState();
    _category = widget.initialCategory;
    final tag = widget.initialTag;
    if (tag != null) _keys.addAll(_keysForTag(tag));
  }

  /// Maps a home collection tag onto the Browse "key item" filter set so that
  /// "See All" / banner taps land on the catalogue with the filter applied.
  static Set<String> _keysForTag(String tag) {
    final lower = tag.toLowerCase();
    if (lower.contains('best')) return <String>{'Bestseller'};
    if (lower.contains('clearance')) return <String>{'Clearance'};
    if (lower.contains('flash') ||
        lower.contains('limited') ||
        lower.contains('deal') ||
        lower.contains('sale')) {
      return <String>{'Flash Deal'};
    }
    if (lower.contains('new')) return <String>{'New'};
    if (lower.contains('premium')) return <String>{'Premium'};
    return <String>{};
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  /// Filter pass shared by the grid and the sheet's live result count.
  ///
  /// Selection sets are passed in so the sheet can preview its own state
  /// without mutating the page until the operator confirms.
  List<Product> _applyFilters(
    List<Product> products, {
    required Set<String> brands,
    required Set<String> prices,
    required Set<String> keys,
    required double? minRating,
  }) {
    var list = filterProductsByHomeCategory(products, _category);
    final q = _query.trim().toLowerCase();
    if (q.isNotEmpty) {
      // Includes every variant label and SKU, so all 500 imported SKUs are
      // discoverable from the 233 grouped cards.
      list = list.where((p) => p.matchesQuery(q)).toList();
    }
    if (brands.isNotEmpty) {
      list =
          list.where((p) => brands.contains(p.brand?.toUpperCase())).toList();
    }
    if (prices.isNotEmpty) {
      list = list.where((p) {
        final amount = (p.price?.amount ?? 0) / 100;
        return prices.any((r) {
          if (r == 'Under ?500') return amount < 500;
          if (r == '?500 ? ?5,000') return amount >= 500 && amount <= 5000;
          return amount > 5000;
        });
      }).toList();
    }
    if (keys.isNotEmpty) {
      list = list.where((p) => keys.every((k) => _matchesKey(p, k))).toList();
    }
    if (minRating != null) {
      list = list.where((p) => (p.rating ?? 0) >= minRating).toList();
    }
    return list;
  }

  List<Product> _apply(List<Product> products) {
    final list = _applyFilters(
      products,
      brands: _brands,
      prices: _prices,
      keys: _keys,
      minRating: _minRating,
    );
    switch (_sort) {
      case BrowseSort.priceLowHigh:
        return List<Product>.of(list)
          ..sort(
              (a, b) => (a.price?.amount ?? 0).compareTo(b.price?.amount ?? 0));
      case BrowseSort.priceHighLow:
        return List<Product>.of(list)
          ..sort(
              (a, b) => (b.price?.amount ?? 0).compareTo(a.price?.amount ?? 0));
      case BrowseSort.rating:
        return List<Product>.of(list)
          ..sort((a, b) => (b.rating ?? 0).compareTo(a.rating ?? 0));
      case BrowseSort.relevance:
        return list;
    }
  }

  void _clearFilters() {
    setState(() {
      _brands.clear();
      _prices.clear();
      _keys.clear();
      _minRating = null;
      _resetPaging();
    });
  }

  bool _matchesKey(Product p, String key) => switch (key) {
        'On discount' => p.discountPercent != null,
        'Bestseller' =>
          p.badges.any((b) => b.toLowerCase().contains('bestseller')),
        'Flash Deal' =>
          p.badges.any((b) => b.toLowerCase().contains('limited deal')),
        'Clearance' =>
          p.badges.any((b) => b.toLowerCase().contains('clearance')),
        'In stock' =>
          p.variants.isEmpty || p.variants.any((variant) => variant.inStock),
        'New' => p.badges.any((b) => b.toLowerCase() == 'new'),
        'Premium' => p.badges.any((b) => b.toLowerCase().contains('premium')),
        'Highly rated' => (p.rating ?? 0) >= 4.5,
        'Free delivery' =>
          (p.deliveryNote?.toLowerCase().contains('free') ?? false),
        _ => true,
      };

  void _resetPaging() => _visible = _pageSize;

  @override
  Widget build(BuildContext context) {
    final productsState = ref.watch(productsProvider);
    final categories = ref.watch(categoriesProvider);
    final itemCount = ref.watch(cartProvider).value?.itemCount ?? 0;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Browse'),
        actions: <Widget>[
          const NotificationBell(),
          IconButton(
            tooltip: 'Cart',
            onPressed: () => context.push('/cart'),
            icon: Badge(
              isLabelVisible: itemCount > 0,
              label: Text('$itemCount'),
              child: const Icon(Icons.shopping_cart_outlined),
            ),
          ),
        ],
      ),
      body: productsState.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Could not load products: $e')),
        data: (products) {
          final results = _apply(products);
          final visible = results.take(_visible).toList();
          final hasMore = _visible < results.length;
          return NotificationListener<ScrollNotification>(
            onNotification: (n) {
              if (hasMore &&
                  n.metrics.pixels >= n.metrics.maxScrollExtent - 500) {
                setState(() => _visible += _pageSize);
              }
              return false;
            },
            child: CustomScrollView(
              slivers: <Widget>[
                SliverToBoxAdapter(child: _searchBar()),
                SliverToBoxAdapter(child: _browseBanner()),
                SliverToBoxAdapter(child: _categoryFilters(categories)),
                SliverPersistentHeader(
                  pinned: true,
                  delegate: _BrowseControlsDelegate(
                    sort: _sort,
                    onSort: (next) => setState(() {
                      _sort = next;
                      _resetPaging();
                    }),
                    filterCount: _activeFilterCount,
                    onOpenFilters: _openFilters,
                    keys: _keys,
                    onToggleKey: (key) => setState(() {
                      if (!_keys.remove(key)) _keys.add(key);
                      _resetPaging();
                    }),
                    resultCount: results.length,
                    onClearFilters: _clearFilters,
                  ),
                ),
                if (results.isNotEmpty)
                  SliverToBoxAdapter(child: _recommendedStrip()),
                if (results.isEmpty)
                  SliverToBoxAdapter(child: _noResults(products))
                else
                  SliverPadding(
                    padding: const EdgeInsets.all(AgencySpacing.md),
                    sliver: SliverGrid(
                      gridDelegate:
                          const SliverGridDelegateWithFixedCrossAxisCount(
                        crossAxisCount: 2,
                        mainAxisSpacing: AgencySpacing.sm,
                        crossAxisSpacing: AgencySpacing.sm,
                        mainAxisExtent: 296,
                      ),
                      delegate: SliverChildBuilderDelegate(
                        (context, i) => _card(visible[i]),
                        childCount: visible.length,
                      ),
                    ),
                  ),
                if (results.isNotEmpty)
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(AgencySpacing.md, 0,
                          AgencySpacing.md, AgencySpacing.lg),
                      child: hasMore
                          ? PinWorkflowAction(
                              label: 'Load more products',
                              hierarchy: PinWorkflowHierarchy.secondary,
                              onPressed: () =>
                                  setState(() => _visible += _pageSize),
                            )
                          : Center(
                              child: Text(
                                'All ${results.length} products shown',
                                style: TextStyle(
                                    fontSize: 12,
                                    color: _colors(context).contentSecondary),
                              ),
                            ),
                    ),
                  ),
              ],
            ),
          );
        },
      ),
    );
  }

  AgencyColors _colors(BuildContext context) =>
      Theme.of(context).extension<AgencyColors>() ?? AgencyColors.light;

  Widget _searchBar() {
    final colors = _colors(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(
          AgencySpacing.md, AgencySpacing.sm, AgencySpacing.md, 0),
      child: TextField(
        controller: _search,
        decoration: InputDecoration(
          hintText: 'Search products, brands, sellers',
          prefixIcon: const Icon(Icons.search),
          isDense: true,
          filled: true,
          fillColor: colors.surfacePage,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(AgencyRadius.md),
            borderSide: BorderSide(color: colors.borderDefault),
          ),
        ),
        onChanged: (v) => setState(() {
          _query = v;
          _resetPaging();
        }),
      ),
    );
  }

  Widget _categoryFilters(List<Category> categories) {
    // Icon-led single-select categories — same treatment as the Home tab.
    final rail = <Category>[
      const Category(label: 'All', icon: Icons.apps_outlined),
      ...categories,
    ];
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AgencySpacing.xs),
      child: CategoryIconRail(
        categories: rail,
        selectedLabel: _category ?? 'All',
        onSelected: (c) => setState(() {
          _category = c.label == 'All' ? null : c.label;
          _resetPaging();
        }),
      ),
    );
  }

  Widget _card(Product product) {
    final wishlisted = ref.watch(wishlistProvider).contains(product.id);
    return ProductCard(
      title: product.title,
      priceLabel: product.price?.formatted ?? 'Price on request',
      previousPriceLabel: product.mrp?.formatted,
      discountLabel: product.discountPercent == null
          ? null
          : '${product.discountPercent}% off',
      imageUrl: product.thumbnail,
      brand: product.brandLine,
      badges: product.badges,
      variant: ProductCardVariant.large,
      onPressed: () => context.push('/product/${product.id}'),
      onAddToCart: () async {
        final messenger = ScaffoldMessenger.of(context);
        await ref.read(cartProvider.notifier).addItem(
            offerId: product.cartOfferId,
            variantId: product.cartVariantId,
            quantity: 1);
        if (!mounted) return;
        messenger.showSnackBar(
          const SnackBar(content: Text('Added to cart')),
        );
      },
      wishlisted: wishlisted,
      onWishlist: () => ref.read(wishlistProvider.notifier).toggle(product.id),
    );
  }

  /// Shown when the filters/search yield nothing: suggested filters + a few
  /// products so Browse is never a dead end.
  Widget _noResults(List<Product> products) {
    final colors = _colors(context);
    final suggestions = products.take(4).toList();
    return Padding(
      padding: const EdgeInsets.all(AgencySpacing.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Icon(Icons.search_off, color: colors.contentSecondary, size: 32),
          const SizedBox(height: AgencySpacing.sm),
          Text('No products match your search',
              style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: colors.contentPrimary)),
          const SizedBox(height: AgencySpacing.md),
          Text('Try a suggested filter',
              style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: colors.contentPrimary)),
          const SizedBox(height: AgencySpacing.sm),
          Wrap(
            spacing: AgencySpacing.sm,
            runSpacing: AgencySpacing.sm,
            children: <Widget>[
              for (final key in _keyItems.take(5))
                ActionChip(
                  label: Text(key, style: const TextStyle(fontSize: 12)),
                  onPressed: () => setState(() {
                    _keys
                      ..clear()
                      ..add(key);
                    _resetPaging();
                  }),
                ),
            ],
          ),
          if (suggestions.isNotEmpty) ...<Widget>[
            const SizedBox(height: AgencySpacing.lg),
            Text('Popular products',
                style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: colors.contentPrimary)),
            const SizedBox(height: AgencySpacing.sm),
            for (final p in suggestions) _card(p),
          ],
        ],
      ),
    );
  }

  /// A clickable category banner shown at the top of the Browse scroll.
  Widget _browseBanner() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
          AgencySpacing.md, AgencySpacing.sm, AgencySpacing.md, 0),
      child: MerchandisingBanner(
        imageUrl: ref.watch(categoryBannerImageProvider(_category)),
        title: _category ?? 'Browse the catalogue',
        subtitle: 'Top picks in this aisle',
        ctaLabel: 'Best sellers',
        onCta: () => setState(() {
          _keys
            ..clear()
            ..add('Bestseller');
          _resetPaging();
        }),
      ),
    );
  }

  /// "Recommended for you" horizontal rail inside the Browse scroll. The rail
  /// follows the selected category (falls back to the full catalogue).
  Widget _recommendedStrip() {
    final products = ref.watch(productsProvider).value ?? const <Product>[];
    final byCategory = filterProductsByHomeCategory(products, _category);
    final items =
        (byCategory.isNotEmpty ? byCategory : products).take(8).toList();
    if (items.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Padding(
          padding: const EdgeInsets.fromLTRB(AgencySpacing.md, AgencySpacing.sm,
              AgencySpacing.md, AgencySpacing.sm),
          child: SectionHeader(
            title: 'Recommended for you',
            tag: _category,
          ),
        ),
        SizedBox(
          height: 252,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: AgencySpacing.md),
            itemCount: items.length,
            separatorBuilder: (_, __) =>
                const SizedBox(width: AgencySpacing.sm),
            itemBuilder: (context, i) {
              final p = items[i];
              return SizedBox(
                width: 160,
                child: ProductCard(
                  title: p.title,
                  priceLabel: p.price?.formatted ?? 'Price on request',
                  previousPriceLabel: p.mrp?.formatted,
                  discountLabel: p.discountPercent == null
                      ? null
                      : '${p.discountPercent}% off',
                  imageUrl: p.thumbnail,
                  brand: p.brandLine,
                  badges: p.badges,
                  variant: ProductCardVariant.compact,
                  onPressed: () => context.push('/product/${p.id}'),
                  onAddToCart: () async {
                    final messenger = ScaffoldMessenger.of(context);
                    await ref.read(cartProvider.notifier).addItem(
                        offerId: p.cartOfferId,
                        variantId: p.cartVariantId,
                        quantity: 1);
                    if (!mounted) return;
                    messenger.showSnackBar(
                      const SnackBar(content: Text('Added to cart')),
                    );
                  },
                ),
              );
            },
          ),
        ),
      ],
    );
  }

  Future<void> _openFilters() async {
    final products = ref.read(productsProvider).value ?? const <Product>[];
    final brands = brandsOf(products);
    final brandsSel = <String>{..._brands};
    final pricesSel = <String>{..._prices};
    final keysSel = <String>{..._keys};
    final ratingSel = <String>{if (_minRating != null) '4★ & up'};

    double? ratingValue() => ratingSel.isEmpty ? null : 4.0;

    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (sheetContext) {
        final colors = Theme.of(sheetContext).extension<AgencyColors>() ??
            AgencyColors.light;
        return StatefulBuilder(
          builder: (sheetContext, setSheet) {
            final previewCount = _applyFilters(
              products,
              brands: brandsSel,
              prices: pricesSel,
              keys: keysSel,
              minRating: ratingValue(),
            ).length;
            return SafeArea(
              child: Padding(
                padding: EdgeInsets.only(
                  left: AgencySpacing.md,
                  right: AgencySpacing.md,
                  bottom: MediaQuery.of(sheetContext).viewInsets.bottom,
                ),
                child: ConstrainedBox(
                  constraints: BoxConstraints(
                    maxHeight: MediaQuery.sizeOf(sheetContext).height * 0.82,
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Padding(
                        padding:
                            const EdgeInsets.only(bottom: AgencySpacing.xs),
                        child: Row(
                          children: <Widget>[
                            Text('Filters',
                                style: TextStyle(
                                    fontSize: 18,
                                    fontWeight: FontWeight.w700,
                                    color: colors.contentPrimary)),
                            const Spacer(),
                            Text('$previewCount results',
                                style: TextStyle(
                                    fontSize: 12,
                                    color: colors.contentSecondary)),
                          ],
                        ),
                      ),
                      Flexible(
                        child: SingleChildScrollView(
                          padding: const EdgeInsets.only(top: AgencySpacing.xs),
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: <Widget>[
                              _filterGroup(
                                sheetContext,
                                'Brand',
                                brands,
                                brandsSel,
                                setSheet,
                              ),
                              _filterGroup(
                                sheetContext,
                                'Price',
                                _priceRanges,
                                pricesSel,
                                setSheet,
                              ),
                              _filterGroup(
                                sheetContext,
                                'Rating',
                                const <String>['4★ & up'],
                                ratingSel,
                                setSheet,
                              ),
                              _filterGroup(
                                sheetContext,
                                'Key items',
                                _keyItems,
                                keysSel,
                                setSheet,
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
                                brandsSel.clear();
                                pricesSel.clear();
                                keysSel.clear();
                                ratingSel.clear();
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
                                    _brands
                                      ..clear()
                                      ..addAll(brandsSel);
                                    _prices
                                      ..clear()
                                      ..addAll(pricesSel);
                                    _keys
                                      ..clear()
                                      ..addAll(keysSel);
                                    _minRating = ratingValue();
                                    _resetPaging();
                                  });
                                  Navigator.of(sheetContext).pop();
                                },
                                style: FilledButton.styleFrom(
                                  backgroundColor:
                                      StorefrontControlTokens.filterAccent(
                                          sheetContext),
                                  foregroundColor: colors.contentInverse,
                                  minimumSize: const Size.fromHeight(48),
                                ),
                                child: Text('Show $previewCount results'),
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

  Widget _filterGroup(
    BuildContext context,
    String title,
    List<String> options,
    Set<String> selected,
    void Function(void Function()) setSheet,
  ) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AgencySpacing.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(title,
              style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: _colors(context).contentPrimary)),
          const SizedBox(height: AgencySpacing.xs),
          Wrap(
            spacing: AgencySpacing.sm,
            runSpacing: AgencySpacing.xs,
            children: <Widget>[
              for (final o in options)
                TradeFilterChip(
                  label: o,
                  selected: selected.contains(o),
                  onTap: () => setSheet(() {
                    if (!selected.remove(o)) selected.add(o);
                  }),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Pinned control block for the listing: sort chips, filter button + quick
/// chips, result count and Clear all. Fixed height so the sliver can pin.
class _BrowseControlsDelegate extends SliverPersistentHeaderDelegate {
  _BrowseControlsDelegate({
    required this.sort,
    required this.onSort,
    required this.filterCount,
    required this.onOpenFilters,
    required this.keys,
    required this.onToggleKey,
    required this.resultCount,
    required this.onClearFilters,
  });

  static const double _height = 160;

  final BrowseSort sort;
  final ValueChanged<BrowseSort> onSort;
  final int filterCount;
  final Future<void> Function() onOpenFilters;
  final Set<String> keys;
  final ValueChanged<String> onToggleKey;
  final int resultCount;
  final VoidCallback onClearFilters;

  @override
  double get minExtent => _height;

  @override
  double get maxExtent => _height;

  @override
  Widget build(
      BuildContext context, double shrinkOffset, bool overlapsContent) {
    return _BrowseControls(
      sort: sort,
      onSort: onSort,
      filterCount: filterCount,
      onOpenFilters: onOpenFilters,
      keys: keys,
      onToggleKey: onToggleKey,
      resultCount: resultCount,
      onClearFilters: onClearFilters,
    );
  }

  @override
  bool shouldRebuild(covariant _BrowseControlsDelegate oldDelegate) {
    return oldDelegate.sort != sort ||
        oldDelegate.filterCount != filterCount ||
        oldDelegate.resultCount != resultCount ||
        oldDelegate.keys.length != keys.length ||
        !oldDelegate.keys.containsAll(keys);
  }
}

class _BrowseControls extends StatelessWidget {
  const _BrowseControls({
    required this.sort,
    required this.onSort,
    required this.filterCount,
    required this.onOpenFilters,
    required this.keys,
    required this.onToggleKey,
    required this.resultCount,
    required this.onClearFilters,
  });

  final BrowseSort sort;
  final ValueChanged<BrowseSort> onSort;
  final int filterCount;
  final Future<void> Function() onOpenFilters;
  final Set<String> keys;
  final ValueChanged<String> onToggleKey;
  final int resultCount;
  final VoidCallback onClearFilters;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final sortAccent = StorefrontControlTokens.sortAccent(context);
    final filterAccent = StorefrontControlTokens.filterAccent(context);
    return Material(
      color: colors.surfacePage,
      child: Container(
        decoration: BoxDecoration(
          border: Border(bottom: BorderSide(color: colors.borderDefault)),
        ),
        padding:
            const EdgeInsets.fromLTRB(AgencySpacing.md, 6, AgencySpacing.md, 6),
        child: Column(
          children: <Widget>[
            SizedBox(
              height: 44,
              child: ListView.separated(
                key: const Key('browseSortChips'),
                scrollDirection: Axis.horizontal,
                padding: EdgeInsets.zero,
                itemCount: BrowseSort.values.length,
                separatorBuilder: (_, __) => const SizedBox(width: 8),
                itemBuilder: (context, index) {
                  final option = BrowseSort.values[index];
                  return _BrowseChip(
                    label: option.label,
                    selected: sort == option,
                    accent: sortAccent,
                    onTap: () => onSort(option),
                  );
                },
              ),
            ),
            const SizedBox(height: 8),
            SizedBox(
              height: 44,
              child: Row(
                children: <Widget>[
                  _FiltersButton(
                    count: filterCount,
                    accent: filterAccent,
                    onTap: onOpenFilters,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: ListView.separated(
                      key: const Key('browseQuickChips'),
                      scrollDirection: Axis.horizontal,
                      padding: EdgeInsets.zero,
                      itemCount: _BrowseScreenState._quickKeys.length,
                      separatorBuilder: (_, __) => const SizedBox(width: 8),
                      itemBuilder: (context, index) {
                        final key = _BrowseScreenState._quickKeys[index];
                        return _BrowseChip(
                          label: key,
                          selected: keys.contains(key),
                          accent: filterAccent,
                          onTap: () => onToggleKey(key),
                        );
                      },
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 6),
            SizedBox(
              height: 44,
              child: Row(
                children: <Widget>[
                  Text(
                    '$resultCount ${resultCount == 1 ? 'result' : 'results'}',
                    style: TextStyle(
                      fontSize: 12,
                      color: colors.contentSecondary,
                    ),
                  ),
                  const Spacer(),
                  if (filterCount > 0)
                    TextButton(
                      onPressed: onClearFilters,
                      style: TextButton.styleFrom(
                        minimumSize: const Size(44, 44),
                        padding: const EdgeInsets.symmetric(horizontal: 8),
                        foregroundColor: colors.actionPrimary,
                      ),
                      child: const Text('Clear all'),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// A 44px tap-target chip. State is carried by the fill, the check icon and
/// the semantics `selected` flag, never by colour alone.
class _BrowseChip extends StatelessWidget {
  const _BrowseChip({
    required this.label,
    required this.selected,
    required this.accent,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final Color accent;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final radius = BorderRadius.circular(AgencyRadius.md);
    return Semantics(
      button: true,
      selected: selected,
      label: label,
      child: Material(
        color: selected ? accent : colors.surfaceRaised,
        shape: RoundedRectangleBorder(
          borderRadius: radius,
          side: BorderSide(color: selected ? accent : colors.borderDefault),
        ),
        child: InkWell(
          onTap: onTap,
          borderRadius: radius,
          child: Container(
            constraints: const BoxConstraints(minHeight: 44, minWidth: 44),
            padding: const EdgeInsets.symmetric(horizontal: 14),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                if (selected) ...<Widget>[
                  Icon(Icons.check, size: 16, color: colors.contentInverse),
                  const SizedBox(width: 6),
                ],
                Text(
                  label,
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: selected
                        ? colors.contentInverse
                        : colors.contentPrimary,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _FiltersButton extends StatelessWidget {
  const _FiltersButton({
    required this.count,
    required this.accent,
    required this.onTap,
  });

  final int count;
  final Color accent;
  final Future<void> Function() onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final radius = BorderRadius.circular(AgencyRadius.md);
    return Semantics(
      button: true,
      label: count == 0 ? 'Filters' : 'Filters, $count active',
      child: Material(
        color: colors.surfaceRaised,
        shape: RoundedRectangleBorder(
          borderRadius: radius,
          side: BorderSide(color: colors.borderDefault),
        ),
        child: InkWell(
          onTap: onTap,
          borderRadius: radius,
          child: Container(
            constraints: const BoxConstraints(minHeight: 44, minWidth: 44),
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                Icon(Icons.tune, size: 16, color: colors.contentSecondary),
                const SizedBox(width: 6),
                Text(
                  'Filters',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: colors.contentPrimary,
                  ),
                ),
                if (count > 0) ...<Widget>[
                  const SizedBox(width: 6),
                  Container(
                    constraints:
                        const BoxConstraints(minWidth: 18, minHeight: 18),
                    padding: const EdgeInsets.symmetric(horizontal: 5),
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: accent,
                      borderRadius: BorderRadius.circular(9),
                    ),
                    child: Text(
                      '$count',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        color: colors.contentInverse,
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
