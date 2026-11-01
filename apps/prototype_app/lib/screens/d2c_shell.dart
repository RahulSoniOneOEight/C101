import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../domain/models.dart';
import '../domain/conversation_models.dart';
import '../providers/account_providers.dart';
import '../providers/cart_actions.dart';
import '../providers/cart_providers.dart';
import '../widgets/cart_feedback.dart';
import '../widgets/cart_product_card.dart';
import '../providers/catalog_providers.dart';
import '../providers/conversation_dock_provider.dart';
import '../theme/storefront_control_tokens.dart';
import '../widgets/conversation_bell.dart';
import '../widgets/conversation_dock.dart';
import '../widgets/home_pinned_bar.dart';
import '../widgets/storefront_control_bar.dart';
import '../widgets/notification_bell.dart';
import '../widgets/quick_add_sheet.dart';

/// Host scaffold for the D2C (consumer) section: persistent 4-tab bottom
/// navigation (Home / Browse / Cart / Account). Orders is reached from Account
/// rather than occupying its own tab.
class D2CShell extends ConsumerWidget {
  const D2CShell({
    required this.navigationShell,
    required this.currentPath,
    super.key,
  });

  final StatefulNavigationShell navigationShell;
  final String currentPath;

  bool get _conversationEnabled =>
      currentPath == '/' ||
      currentPath == '/browse' ||
      currentPath == '/search' ||
      currentPath == '/cart' ||
      currentPath.startsWith('/collections/') ||
      currentPath.startsWith('/product/');

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cartCount = ref.watch(cartProvider).value?.itemCount ?? 0;
    return Scaffold(
      body: ConversationDockHost(
        audience: ConversationAudience.household,
        enabled: _conversationEnabled,
        child: navigationShell,
      ),
      bottomNavigationBar: AppBottomNavigation(
        items: <BottomNavItem>[
          const BottomNavItem(label: 'Home', icon: Icons.home_outlined),
          const BottomNavItem(label: 'Browse', icon: Icons.grid_view_outlined),
          BottomNavItem(
            label: 'Cart',
            icon: Icons.shopping_cart_outlined,
            badgeCount: cartCount,
          ),
          const BottomNavItem(label: 'Account', icon: Icons.person_outline),
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
///
/// Only facets backed by real data are offered: Popularity has no order data and
/// Rating has no reviews, so neither is shown (U-019). Newest needs `created_at`
/// on the composed product — added when the API exposes it.
enum BrowseSort { relevance, priceLowHigh, priceHighLow, discount }

extension on BrowseSort {
  String get label => switch (this) {
        BrowseSort.relevance => 'Relevance',
        BrowseSort.priceLowHigh => 'Price ↑',
        BrowseSort.priceHighLow => 'Price ↓',
        BrowseSort.discount => 'Discount',
      };
}

/// Pins the Browse search field below the app bar, matching the Home bar's
/// staying power without changing the Browse control rail.
class _BrowseSearchHeaderDelegate extends SliverPersistentHeaderDelegate {
  const _BrowseSearchHeaderDelegate({
    required this.height,
    required this.backgroundColor,
    required this.child,
  });

  final double height;
  final Color backgroundColor;
  final Widget child;

  @override
  double get minExtent => height;

  @override
  double get maxExtent => height;

  @override
  Widget build(
    BuildContext context,
    double shrinkOffset,
    bool overlapsContent,
  ) {
    return Material(color: backgroundColor, child: child);
  }

  @override
  bool shouldRebuild(_BrowseSearchHeaderDelegate oldDelegate) =>
      oldDelegate.height != height ||
      oldDelegate.backgroundColor != backgroundColor ||
      oldDelegate.child != child;
}

/// Marketplace **Browse** tab: search + category filters + sort/filter
/// (brand, price, key items) over a long-scrolling product grid.
class BrowseScreen extends ConsumerStatefulWidget {
  const BrowseScreen(
      {this.initialTag, this.initialCategory, this.initialBrand, super.key});

  /// Optional collection tag carried from a home module's "See All" or a
  /// banner tap (e.g. "Flash Deals", "Best Sellers", "Clearance Sale").
  final String? initialTag;

  /// Optional category label to pre-select.
  final String? initialCategory;

  /// Optional brand from the discovery hub.
  final String? initialBrand;

  @override
  ConsumerState<BrowseScreen> createState() => _BrowseScreenState();
}

class _BrowseScreenState extends ConsumerState<BrowseScreen> {
  static const int _pageSize = 6;
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
  RangeValues? _priceRange;
  final Set<String> _keys = <String>{};
  final Set<String> _sellers = <String>{};
  final Set<String> _availability = <String>{};
  double? _minRating;
  int _visible = _pageSize;

  int get _activeFilterCount =>
      _brands.length +
      (_priceRange == null ? 0 : 1) +
      _keys.length +
      _sellers.length +
      _availability.length +
      (_category == null ? 0 : 1) +
      (_minRating == null ? 0 : 1);

  @override
  void initState() {
    super.initState();
    _category = widget.initialCategory;
    final brand = widget.initialBrand?.trim();
    if (brand != null && brand.isNotEmpty) _brands.add(brand);
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
    RangeValues? priceRange,
    required Set<String> keys,
    Set<String> sellers = const <String>{},
    Set<String> availability = const <String>{},
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
      final normalised = brands.map((brand) => brand.toLowerCase()).toSet();
      list = list
          .where((p) => normalised.contains((p.brand ?? '').toLowerCase()))
          .toList();
    }
    if (priceRange != null) {
      list = list.where((p) {
        final amount = (p.price?.amount ?? 0) / 100;
        return amount >= priceRange.start && amount <= priceRange.end;
      }).toList();
    }
    if (keys.isNotEmpty) {
      list = list.where((p) => keys.every((k) => _matchesKey(p, k))).toList();
    }
    if (sellers.isNotEmpty) {
      list = list.where((p) {
        final names = p.variants
            .map((variant) => variant.sellerName ?? '')
            .where((name) => name.isNotEmpty)
            .toSet();
        return names.any(sellers.contains);
      }).toList();
    }
    for (final key in availability) {
      list = list.where((p) => _matchesKey(p, key)).toList();
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
      priceRange: _priceRange,
      keys: _keys,
      sellers: _sellers,
      availability: _availability,
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
      case BrowseSort.discount:
        // Real list price only: products without a sourced MRP never rank here.
        return List<Product>.of(list)
          ..sort((a, b) =>
              (b.discountPercent ?? 0).compareTo(a.discountPercent ?? 0));
      case BrowseSort.relevance:
        return list;
    }
  }

  void _clearFilters() {
    setState(() {
      _brands.clear();
      _priceRange = null;
      _keys.clear();
      _sellers.clear();
      _availability.clear();
      _category = null;
      _minRating = null;
      _resetPaging();
    });
  }

  /// Removable chips for every active facet (U-019).
  Widget _activeFiltersBar(AgencyColors colors) {
    final chips = <Widget>[
      if (_category != null)
        _activeChip(colors, _category!, () => setState(() {
              _category = null;
              _resetPaging();
            })),
      for (final value in _brands)
        _activeChip(colors, value, () => setState(() {
              _brands.remove(value);
              _resetPaging();
            })),
      if (_priceRange != null)
        _activeChip(colors, _priceLabel(_priceRange!), () => setState(() {
              _priceRange = null;
              _resetPaging();
            })),
      for (final value in _sellers)
        _activeChip(colors, value, () => setState(() {
              _sellers.remove(value);
              _resetPaging();
            })),
      for (final value in _availability)
        _activeChip(colors, value, () => setState(() {
              _availability.remove(value);
              _resetPaging();
            })),
      for (final value in _keys)
        _activeChip(colors, value, () => setState(() {
              _keys.remove(value);
              _resetPaging();
            })),
    ];
    return Padding(
      padding: const EdgeInsets.fromLTRB(
          AgencySpacing.md, AgencySpacing.xs, AgencySpacing.md, 0),
      child: Row(
        children: <Widget>[
          Expanded(
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(children: chips),
            ),
          ),
          IconButton(
            tooltip: 'Clear filters',
            onPressed: _clearFilters,
            visualDensity: VisualDensity.compact,
            icon: Icon(Icons.backspace_outlined,
                size: 16, color: colors.contentSecondary),
          ),
        ],
      ),
    );
  }

  Widget _activeChip(AgencyColors colors, String label, VoidCallback onRemove) {
    return Padding(
      padding: const EdgeInsets.only(right: 6),
      child: InputChip(
        label: Text(label, style: const TextStyle(fontSize: 11)),
        labelPadding: const EdgeInsets.symmetric(horizontal: 2),
        onDeleted: onRemove,
        deleteIcon: const Icon(Icons.close, size: 14),
        deleteIconColor: colors.contentSecondary,
        visualDensity: VisualDensity.compact,
        materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
        padding: const EdgeInsets.symmetric(horizontal: 6),
      ),
    );
  }

  bool _matchesKey(Product p, String key) => switch (key) {
        'On discount' => p.discountPercent != null,
        'Bestseller' =>
          p.badges.any((b) => b.toLowerCase().contains('bestseller')),
        'Flash Deal' => p.badges.any((b) {
            final value = b.toLowerCase();
            return value.contains('limited deal') ||
                value.contains('flash deal');
          }),
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
    final colors = _colors(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Browse'),
        actions: <Widget>[
          const ConversationBellButton(
              audience: ConversationAudience.household),
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
                SliverPersistentHeader(
                  pinned: true,
                  delegate: _BrowseSearchHeaderDelegate(
                    height: HomePinnedBar.searchFieldHeight + AgencySpacing.md,
                    backgroundColor: colors.surfacePage,
                    child: _searchBar(),
                  ),
                ),
                SliverToBoxAdapter(child: _browseBanner()),
                SliverToBoxAdapter(child: _categoryFilters(categories)),
                SliverPersistentHeader(
                  // B2C Browse only: the sort/filter bar scrolls away with the
                  // results instead of eating 102 px forever (U-011 P0-4).
                  pinned: false,
                  delegate: StorefrontControlHeaderDelegate(
                    sortOptions: <String>[
                      for (final option in BrowseSort.values) option.label,
                    ],
                    selectedSort: _sort.label,
                    onSort: (label) => setState(() {
                      _sort = BrowseSort.values
                          .firstWhere((option) => option.label == label);
                      _resetPaging();
                    }),
                    quickFilters: _quickKeys,
                    selectedQuickFilters: _keys,
                    onToggleQuickFilter: (key) => setState(() {
                      if (!_keys.remove(key)) _keys.add(key);
                      _resetPaging();
                    }),
                    filterCount: _activeFilterCount,
                    onOpenFilters: _openFilters,
                    resultCount: results.length,
                    onClearFilters: _clearFilters,
                  ),
                ),
                if (_activeFilterCount > 0)
                  SliverToBoxAdapter(child: _activeFiltersBar(colors)),
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
                        childAspectRatio: 0.64,
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
    final border = OutlineInputBorder(
      borderRadius: BorderRadius.circular(HomePinnedBar.searchRadius),
      borderSide: BorderSide(color: context.homePalette.barBorder),
    );
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AgencySpacing.md,
        AgencySpacing.sm,
        AgencySpacing.md,
        AgencySpacing.sm,
      ),
      child: SizedBox(
        height: HomePinnedBar.searchFieldHeight,
        child: TextField(
          controller: _search,
          textInputAction: TextInputAction.search,
          style: TextStyle(fontSize: 13, color: colors.contentPrimary),
          decoration: InputDecoration(
            hintText: 'Search products, brands or SKU',
            hintStyle: TextStyle(fontSize: 13, color: colors.contentSecondary),
            prefixIcon: Icon(
              Icons.search,
              size: 18,
              color: colors.contentSecondary,
            ),
            isDense: true,
            filled: true,
            fillColor: Colors.white,
            contentPadding: const EdgeInsets.symmetric(vertical: 14),
            border: border,
            enabledBorder: border,
            focusedBorder: border,
            disabledBorder: border,
          ),
          onChanged: (v) => setState(() {
            _query = v;
            _resetPaging();
          }),
        ),
      ),
    );
  }

  Widget _categoryFilters(List<Category> categories) {
    // Icon-led single-select categories — same treatment as the Home tab.
    final rail = <Category>[
      const Category(label: 'All', icon: Icons.apps_outlined),
      ...categories,
    ];
    return LayoutBuilder(
      builder: (context, constraints) {
        // Five 64 px items with 8 px gaps fit a phone width; Home keeps 72/16.
        final compact = constraints.maxWidth <= 390;
        return Padding(
          padding: const EdgeInsets.symmetric(vertical: AgencySpacing.sm),
          child: CategoryIconRail(
            categories: rail,
            itemWidth: compact ? 64 : 72,
            gap: compact ? AgencySpacing.sm : AgencySpacing.md,
            selectedLabel: _category ?? 'All',
            onSelected: (c) => setState(() {
              _category = c.label == 'All' ? null : c.label;
              _resetPaging();
            }),
          ),
        );
      },
    );
  }

  Widget _card(Product product) {
    final wishlisted = ref.watch(wishlistProvider).contains(product.id);
    return CartProductCard(
      product: product,
      title: product.title,
      priceLabel: product.price?.formatted ?? 'Price on request',
      previousPriceLabel: product.mrpIsReal ? product.mrp?.formatted : null,
      discountLabel: product.mrpIsReal && product.discountPercent != null
          ? '${product.discountPercent}% off'
          : null,
      imageUrl: product.thumbnail,
      brand: product.brand,
      badges: product.b2cBadges,
      variant: ProductCardVariant.large,
      onPressed: () => context.push('/product/${product.id}'),
      onAddToCart: () => _quickAdd(product),
      onDiscuss: () => _discuss(product),
      wishlisted: wishlisted,
      onWishlist: () => ref.read(wishlistProvider.notifier).toggle(product.id),
    );
  }

  void _discuss(Product product) =>
      ref.read(conversationDockProvider.notifier).discuss(
            ConversationAudience.household,
            ConversationProductCapture.fromProduct(product),
          );

  Future<void> _quickAdd(Product product) async {
    final variants = purchasableQuickAddVariants(product);
    ProductVariant? selected;
    if (requiresVariantSelection(product)) {
      selected = await showVariantQuickAddSheet(context, product);
      if (selected == null || !mounted) return;
    } else if (variants.length == 1) {
      selected = variants.single;
    }
    final added = await addToCartSafely(
      ref,
      offerId: selected?.offerId ?? product.cartOfferId,
      variantId: selected?.id ?? product.cartVariantId,
      unitPrice: selected?.price ?? product.price,
    );
    if (!mounted) return;
    added ? showCartAddedToast(context) : showCartErrorToast(context);
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
          AgencySpacing.md, AgencySpacing.sm, AgencySpacing.md, AgencySpacing.sm),
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

  Future<void> _openFilters() async {
    final products = ref.read(productsProvider).value ?? const <Product>[];
    final brands = brandsOf(products);
    final brandsSel = <String>{..._brands};
    RangeValues? rangeSel = _priceRange;
    final keysSel = <String>{..._keys};
    final sellersSel = <String>{..._sellers};
    final availabilitySel = <String>{..._availability};
    final ratingSel = <String>{if (_minRating != null) '4★ & up'};

    double? ratingValue() => ratingSel.isEmpty ? null : 4.0;

    // Facet counts are computed over the current category + search scope so the
    // numbers never promise results the sheet cannot show (U-019).
    final base = _applyFilters(
      products,
      brands: const <String>{},
      priceRange: null,
      keys: const <String>{},
      minRating: null,
    );
    final railCategories = ref.read(categoriesProvider);
    final categoryCounts = <String, int>{
      for (final category in railCategories)
        category.label:
            filterProductsByHomeCategory(base, category.label).length,
      'Uncategorised':
          base.where((p) => (p.categoryLabel ?? '').trim().isEmpty).length,
    }..removeWhere((_, count) => count == 0);
    final sellerCounts = <String, int>{};
    for (final p in base) {
      final names = p.variants
          .map((variant) => variant.sellerName ?? '')
          .where((name) => name.isNotEmpty)
          .toSet();
      for (final name in names) {
        sellerCounts[name] = (sellerCounts[name] ?? 0) + 1;
      }
    }
    final availabilityCounts = <String, int>{
      'In stock': base.where((p) => _matchesKey(p, 'In stock')).length,
      'On discount': base.where((p) => p.discountPercent != null).length,
    };

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
              priceRange: rangeSel,
              keys: keysSel,
              sellers: sellersSel,
              availability: availabilitySel,
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
                              _categoryGroup(
                                sheetContext,
                                categoryCounts,
                                setSheet,
                              ),
                              _priceGroup(
                                sheetContext,
                                _priceBounds(base),
                                rangeSel,
                                (value) => setSheet(() => rangeSel = value),
                              ),
                              _countedGroup(
                                sheetContext,
                                'Brand',
                                <String, int>{
                                  for (final brand in brands)
                                    brand: base
                                        .where((p) =>
                                            (p.brand ?? '').toLowerCase() ==
                                            brand.toLowerCase())
                                        .length,
                                }..removeWhere((_, count) => count == 0),
                                brandsSel,
                                setSheet,
                              ),
                              if (sellerCounts.isNotEmpty)
                                _countedGroup(
                                  sheetContext,
                                  'Seller',
                                  sellerCounts,
                                  sellersSel,
                                  setSheet,
                                ),
                              _countedGroup(
                                sheetContext,
                                'Availability',
                                availabilityCounts,
                                availabilitySel,
                                setSheet,
                              ),
                              _filterGroup(
                                sheetContext,
                                'Key items',
                                _keyItems
                                    .where((key) =>
                                        key != 'In stock' &&
                                        key != 'On discount')
                                    .toList(),
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
                                rangeSel = null;
                                keysSel.clear();
                                sellersSel.clear();
                                availabilitySel.clear();
                                ratingSel.clear();
                                setState(() {
                                  _category = null;
                                  _resetPaging();
                                });
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
                                    _priceRange = rangeSel;
                                    _keys
                                      ..clear()
                                      ..addAll(keysSel);
                                    _sellers
                                      ..clear()
                                      ..addAll(sellersSel);
                                    _availability
                                      ..clear()
                                      ..addAll(availabilitySel);
                                    _minRating = ratingValue();
                                    _resetPaging();
                                  });
                                  Navigator.of(sheetContext).pop();
                                },
                                style: FilledButton.styleFrom(
                                  backgroundColor:
                                      StorefrontControlTokens.filterInk(
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

  /// Category facet with live counts; applying is immediate (the rail and the
  /// list stay in sync) and Reset clears it.
  Widget _categoryGroup(
    BuildContext context,
    Map<String, int> counts,
    void Function(void Function()) setSheet,
  ) {
    final entries = counts.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));
    return _groupShell(
      context,
      'Category',
      <Widget>[
        StorefrontControlChip(
          label: 'All categories',
          selected: _category == null,
          fill: StorefrontControlTokens.filterFill(context),
          ink: StorefrontControlTokens.filterInk(context),
          onTap: () => setSheet(() => setState(() {
                _category = null;
                _resetPaging();
              })),
        ),
        for (final entry in entries)
          StorefrontControlChip(
            label: '${entry.key} (${entry.value})',
            selected: _category == entry.key,
            fill: StorefrontControlTokens.filterFill(context),
            ink: StorefrontControlTokens.filterInk(context),
            onTap: () => setSheet(() => setState(() {
                  _category = entry.key;
                  _resetPaging();
                })),
          ),
      ],
    );
  }

  /// Multi-select facet rendered from a value → count map.
  Widget _countedGroup(
    BuildContext context,
    String title,
    Map<String, int> counts,
    Set<String> selected,
    void Function(void Function()) setSheet,
  ) {
    final entries = counts.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));
    return _groupShell(
      context,
      title,
      <Widget>[
        for (final entry in entries)
          StorefrontControlChip(
            label: '${entry.key} (${entry.value})',
            selected: selected.contains(entry.key),
            fill: StorefrontControlTokens.filterFill(context),
            ink: StorefrontControlTokens.filterInk(context),
            onTap: () => setSheet(() {
              if (!selected.remove(entry.key)) selected.add(entry.key);
            }),
          ),
      ],
    );
  }

  RangeValues _priceBounds(List<Product> products) {
    var min = double.infinity;
    var max = 0.0;
    for (final p in products) {
      final value = (p.price?.amount ?? 0) / 100;
      if (value <= 0) continue;
      if (value < min) min = value;
      if (value > max) max = value;
    }
    if (!min.isFinite || max <= 0) return const RangeValues(0, 100000);
    if (max <= min) max = min + 100;
    return RangeValues(min.floorToDouble(), max.ceilToDouble());
  }

  String _priceLabel(RangeValues range) =>
      '₹${range.start.round()} – ₹${range.end.round()}';

  Widget _priceGroup(
    BuildContext context,
    RangeValues bounds,
    RangeValues? selected,
    ValueChanged<RangeValues?> onChanged,
  ) {
    final colors = _colors(context);
    final current = selected == null
        ? bounds
        : RangeValues(
            selected.start.clamp(bounds.start, bounds.end),
            selected.end.clamp(bounds.start, bounds.end),
          );
    final span = bounds.end - bounds.start;
    final divisions = span <= 0 ? null : (span / 100).clamp(1, 200).round();
    RangeValues preset(double start, double end) => RangeValues(
          start.clamp(bounds.start, bounds.end),
          end.clamp(bounds.start, bounds.end),
        );
    return Padding(
      padding: const EdgeInsets.only(bottom: AgencySpacing.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text('Price',
              style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: colors.contentPrimary)),
          RangeSlider(
            values: current,
            min: bounds.start,
            max: bounds.end,
            divisions: divisions,
            labels: RangeLabels(
              '₹${current.start.round()}',
              '₹${current.end.round()}',
            ),
            onChanged: (value) => onChanged(value),
          ),
          Row(
            children: <Widget>[
              Text(_priceLabel(current),
                  style: TextStyle(
                      fontSize: 11, color: colors.contentSecondary)),
              const Spacer(),
              TextButton(
                onPressed: () => onChanged(null),
                style: TextButton.styleFrom(
                  minimumSize: const Size(0, 28),
                  padding: const EdgeInsets.symmetric(horizontal: 6),
                  textStyle: const TextStyle(fontSize: 11),
                ),
                child: const Text('Any price'),
              ),
            ],
          ),
          Wrap(
            spacing: AgencySpacing.sm,
            runSpacing: AgencySpacing.xs,
            children: <Widget>[
              for (final presetRange in <(String, RangeValues)>[
                ('< ₹500', preset(bounds.start, 500)),
                ('₹500 – ₹5,000', preset(500, 5000)),
                ('₹5,000+', preset(5000, bounds.end)),
              ])
                StorefrontControlChip(
                  label: presetRange.$1,
                  selected: selected != null &&
                      selected.start == presetRange.$2.start &&
                      selected.end == presetRange.$2.end,
                  fill: StorefrontControlTokens.filterFill(context),
                  ink: StorefrontControlTokens.filterInk(context),
                  onTap: () => onChanged(presetRange.$2),
                ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _groupShell(
    BuildContext context,
    String title,
    List<Widget> chips,
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
            children: chips,
          ),
        ],
      ),
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
                StorefrontControlChip(
                  label: o,
                  selected: selected.contains(o),
                  fill: StorefrontControlTokens.filterFill(context),
                  ink: StorefrontControlTokens.filterInk(context),
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
