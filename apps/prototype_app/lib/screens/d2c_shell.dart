import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../domain/models.dart';
import '../providers/account_providers.dart';
import '../providers/cart_providers.dart';
import '../providers/catalog_providers.dart';
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
        BrowseSort.priceLowHigh => 'Price: Low to High',
        BrowseSort.priceHighLow => 'Price: High to Low',
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
    'New',
    'Premium',
    'Highly rated',
    'Free delivery',
  ];

  final TextEditingController _search = TextEditingController();
  String _query = '';
  String? _category;
  BrowseSort _sort = BrowseSort.relevance;
  final Set<String> _brands = <String>{};
  final Set<String> _prices = <String>{};
  final Set<String> _keys = <String>{};
  int _visible = _pageSize;

  int get _activeFilterCount => _brands.length + _prices.length + _keys.length;

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

  List<Product> _apply(List<Product> products) {
    var list = filterProductsByHomeCategory(products, _category);
    final q = _query.trim().toLowerCase();
    if (q.isNotEmpty) {
      list = list
          .where((p) =>
              p.title.toLowerCase().contains(q) ||
              (p.brand?.toLowerCase().contains(q) ?? false))
          .toList();
    }
    if (_brands.isNotEmpty) {
      list =
          list.where((p) => _brands.contains(p.brand?.toUpperCase())).toList();
    }
    if (_prices.isNotEmpty) {
      list = list.where((p) {
        final amount = (p.price?.amount ?? 0) / 100;
        return _prices.any((r) {
          if (r == 'Under ₹500') return amount < 500;
          if (r == '₹500 – ₹5,000') return amount >= 500 && amount <= 5000;
          return amount > 5000;
        });
      }).toList();
    }
    if (_keys.isNotEmpty) {
      list = list.where((p) => _keys.every((k) => _matchesKey(p, k))).toList();
    }
    switch (_sort) {
      case BrowseSort.priceLowHigh:
        list = List<Product>.of(list)
          ..sort(
              (a, b) => (a.price?.amount ?? 0).compareTo(b.price?.amount ?? 0));
      case BrowseSort.priceHighLow:
        list = List<Product>.of(list)
          ..sort(
              (a, b) => (b.price?.amount ?? 0).compareTo(a.price?.amount ?? 0));
      case BrowseSort.rating:
        list = List<Product>.of(list)
          ..sort((a, b) => (b.rating ?? 0).compareTo(a.rating ?? 0));
      case BrowseSort.relevance:
        break;
    }
    return list;
  }

  bool _matchesKey(Product p, String key) => switch (key) {
        'On discount' => p.discountPercent != null,
        'Bestseller' =>
          p.badges.any((b) => b.toLowerCase().contains('bestseller')),
        'Flash Deal' =>
          p.badges.any((b) => b.toLowerCase().contains('limited deal')),
        'Clearance' =>
          p.badges.any((b) => b.toLowerCase().contains('clearance')),
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
                SliverToBoxAdapter(child: _sortFilterRow()),
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

  Widget _sortFilterRow() {
    final colors = _colors(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(
          AgencySpacing.md, 0, AgencySpacing.md, AgencySpacing.sm),
      child: Row(
        children: <Widget>[
          Expanded(
            child: PopupMenuButton<BrowseSort>(
              initialValue: _sort,
              onSelected: (s) => setState(() => _sort = s),
              itemBuilder: (context) => <PopupMenuEntry<BrowseSort>>[
                for (final s in BrowseSort.values)
                  PopupMenuItem<BrowseSort>(
                    value: s,
                    child: Text(s.label),
                  ),
              ],
              child: _outlined(
                colors,
                icon: Icons.swap_vert,
                label: 'Sort: ${_sort.label}',
              ),
            ),
          ),
          const SizedBox(width: AgencySpacing.sm),
          Expanded(
            child: GestureDetector(
              onTap: _openFilters,
              child: _outlined(
                colors,
                icon: Icons.tune,
                label: _activeFilterCount == 0
                    ? 'Filter'
                    : 'Filter ($_activeFilterCount)',
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _outlined(AgencyColors colors,
      {required IconData icon, required String label}) {
    return Container(
      height: 40,
      padding: const EdgeInsets.symmetric(horizontal: AgencySpacing.md),
      decoration: BoxDecoration(
        color: colors.surfaceRaised,
        borderRadius: BorderRadius.circular(AgencyRadius.md),
        border: Border.all(color: colors.borderDefault),
      ),
      child: Row(
        children: <Widget>[
          Icon(icon, size: 16, color: colors.contentSecondary),
          const SizedBox(width: AgencySpacing.xs),
          Expanded(
            child: Text(label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w500,
                    color: colors.contentPrimary)),
          ),
          Icon(Icons.expand_more, size: 16, color: colors.contentSecondary),
        ],
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
      brand: product.brand,
      badges: product.badges,
      variant: ProductCardVariant.large,
      onPressed: () => context.push('/product/${product.id}'),
      onAddToCart: () async {
        final messenger = ScaffoldMessenger.of(context);
        await ref.read(cartProvider.notifier).addItem(
            offerId: product.offerId ?? '',
            variantId: product.variantId ?? product.id,
            quantity: 1);
        if (!mounted) return;
        messenger.showSnackBar(
          const SnackBar(content: Text('Added to cart')),
        );
      },
      wishlisted: wishlisted,
      onWishlist: () =>
          ref.read(wishlistProvider.notifier).toggle(product.id),
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
        imageUrl: categoryBannerImage(_category),
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

  /// "Recommended for you" horizontal rail inside the Browse scroll.
  Widget _recommendedStrip() {
    final products = ref.watch(productsProvider).value ?? const <Product>[];
    final items = products.take(8).toList();
    if (items.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        const Padding(
          padding: EdgeInsets.fromLTRB(AgencySpacing.md, AgencySpacing.sm,
              AgencySpacing.md, AgencySpacing.sm),
          child: SectionHeader(title: 'Recommended for you'),
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
                  brand: p.brand,
                  badges: p.badges,
                  variant: ProductCardVariant.compact,
                  onPressed: () => context.push('/product/${p.id}'),
                  onAddToCart: () async {
                    final messenger = ScaffoldMessenger.of(context);
                    await ref.read(cartProvider.notifier).addItem(
                        offerId: p.offerId ?? '',
                        variantId: p.variantId ?? p.id,
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

    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (sheetContext) {
        final colors = Theme.of(sheetContext).extension<AgencyColors>() ??
            AgencyColors.light;
        return StatefulBuilder(
          builder: (sheetContext, setSheet) => Padding(
            padding: EdgeInsets.only(
              left: AgencySpacing.md,
              right: AgencySpacing.md,
              bottom: MediaQuery.of(sheetContext).viewInsets.bottom +
                  AgencySpacing.md,
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Row(
                  children: <Widget>[
                    Text('Filters',
                        style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w700,
                            color: colors.contentPrimary)),
                    const Spacer(),
                    TextButton(
                      onPressed: () => setSheet(() {
                        brandsSel.clear();
                        pricesSel.clear();
                        keysSel.clear();
                      }),
                      child: const Text('Clear'),
                    ),
                  ],
                ),
                const SizedBox(height: AgencySpacing.xs),
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
                  'Key items',
                  _keyItems,
                  keysSel,
                  setSheet,
                ),
                const SizedBox(height: AgencySpacing.sm),
                SizedBox(
                  width: double.infinity,
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
                        _resetPaging();
                      });
                      Navigator.of(sheetContext).pop();
                    },
                    style: FilledButton.styleFrom(
                      backgroundColor: colors.actionPrimary,
                      minimumSize: const Size.fromHeight(48),
                    ),
                    child: const Text('Apply Filters'),
                  ),
                ),
              ],
            ),
          ),
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
