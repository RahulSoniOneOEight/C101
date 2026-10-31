import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../domain/merchandising.dart';
import '../domain/models.dart';
import '../domain/conversation_models.dart';
import '../providers/account_providers.dart';
import '../providers/cart_actions.dart';
import '../providers/cart_providers.dart';
import '../providers/catalog_providers.dart';
import '../providers/conversation_dock_provider.dart';
import '../widgets/cart_feedback.dart';
import '../widgets/cart_product_card.dart';
import '../widgets/home_header.dart';
import '../widgets/home_pinned_bar.dart';
import '../widgets/merchandising_sections.dart';
import '../widgets/quick_add_sheet.dart';
import '../widgets/status_views.dart';

/// Home entry point: a merchandised scroll feed of modules.
///
/// The module list drives Flash Deals → Best Sellers → the Clearance banner.
/// The final module is rendered as **one** "Browse Categories" section: an
/// icon-led single-select category rail plus the product cards beneath it, with
/// a long scroll (auto-loading pages). Selecting a category filters the cards.
class ProductListScreen extends ConsumerStatefulWidget {
  const ProductListScreen({super.key});

  @override
  ConsumerState<ProductListScreen> createState() => _ProductListScreenState();
}

class _ProductListScreenState extends ConsumerState<ProductListScreen> {
  static const int _pageSize = 6;

  /// How far the products sheet rides up over the header gradient.
  static const double _productsOverlap = 24;
  static const double _productsRadius = 24;

  /// Home gutter. Slightly tighter than the app default (16) so the product rails sit closer to the
  /// full-bleed banner above them without touching the screen edge.
  static const double _gutter = 12;

  /// Space between product tiles on the home rails and grid.
  static const double _tileGap = 10;

  /// Selected category label; null means "All".
  String? _category;
  int _visible = _pageSize;

  final ScrollController _scroll = ScrollController();
  final ValueNotifier<double> _barProgress = ValueNotifier<double>(0);
  final GlobalKey _productsKey = GlobalKey(debugLabel: 'home-products');
  final GlobalKey _barKey = GlobalKey(debugLabel: 'home-pinned-bar');

  /// Measured once per layout; the progress denominator is derived from these rather than guessed.
  double _barHeight = 0;
  double _productsTop = 0;
  bool _measureScheduled = false;

  @override
  void initState() {
    super.initState();
    _scroll.addListener(_syncBarProgress);
    WidgetsBinding.instance.addPostFrameCallback((_) => _measure());
  }

  @override
  void dispose() {
    _scroll
      ..removeListener(_syncBarProgress)
      ..dispose();
    _barProgress.dispose();
    super.dispose();
  }

  /// Reads the pinned bar height and the products section's offset in scroll-content coordinates.
  void _measure() {
    if (!mounted) return;
    final barBox = _barKey.currentContext?.findRenderObject() as RenderBox?;
    final productsBox =
        _productsKey.currentContext?.findRenderObject() as RenderBox?;
    if (barBox == null || productsBox == null) return;

    final barHeight = barBox.size.height;
    final productsTop = productsBox.localToGlobal(Offset.zero).dy +
        (_scroll.hasClients ? _scroll.offset : 0);
    final changed = (barHeight - _barHeight).abs() > 0.5 ||
        (productsTop - _productsTop).abs() > 0.5;
    _barHeight = barHeight;
    _productsTop = productsTop;

    if (changed) {
      // The header reserves the bar's measured height, so it must render once the measurement lands.
      setState(() {});
    }
    _syncBarProgress();
  }

  /// Measures after the next frame, coalescing repeated requests into one callback.
  void _scheduleMeasure() {
    if (_measureScheduled) return;
    _measureScheduled = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _measureScheduled = false;
      _measure();
    });
  }

  /// t = offset / (productsTop − overlap − barHeight), clamped to 0..1.
  void _syncBarProgress() {
    final travel = _productsTop - _productsOverlap - _barHeight;
    if (!_scroll.hasClients || travel <= 0) {
      _barProgress.value = 0;
      return;
    }
    final next = (_scroll.offset / travel).clamp(0.0, 1.0);
    if ((next - _barProgress.value).abs() > 0.001) {
      _barProgress.value = next;
    }
  }

  void _selectCategory(String? label) => setState(() {
        _category = label;
        _visible = _pageSize;
      });

  void _loadMore(int total) {
    if (_visible >= total) return;
    setState(() => _visible += _pageSize);
  }

  Future<void> _addToCart(Product product) async {
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
    added
        ? showCartAddedToast(context)
        : showCartErrorToast(context, 'Could not add to cart. Please retry.');
  }

  void _openProduct(Product product) => context.push('/product/${product.id}');

  void _discuss(Product product) =>
      ref.read(conversationDockProvider.notifier).discuss(
            ConversationAudience.household,
            ConversationProductCapture.fromProduct(product),
          );

  bool _isWishlisted(Product product) =>
      ref.watch(wishlistProvider).contains(product.id);

  Future<void> _toggleWishlist(Product product) async {
    await ref.read(wishlistProvider.notifier).toggle(product.id);
    if (!mounted) return;
    final saved = ref.read(wishlistProvider).contains(product.id);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
          content: Text(saved ? 'Saved to wishlist' : 'Removed from wishlist')),
    );
  }

  void _openCategory(String? label) => context.push(label == null
      ? '/browse'
      : '/browse?category=${Uri.encodeComponent(label)}');

  /// Opens Browse pre-filtered to the collection behind a module or banner.
  VoidCallback _openTag(String tag) =>
      () => context.push('/browse?tag=${Uri.encodeComponent(tag)}');

  /// "See All" target for a headed module. Flash Deals / Best Sellers open the
  /// matching Browse filter; other sections open the full catalogue.
  VoidCallback? _seeAllFor(MerchandisingModule module) {
    // The layout may configure where "See All" goes; that wins over the local tag heuristic.
    final destination = module.seeAllUri;
    if (destination != null && destination.isNotEmpty) {
      return () => context.push(destination);
    }
    if (module.title == null) return null;
    final tag = switch (module.title) {
      'Flash Deals' => 'Flash Deals',
      'Best Sellers' => 'Best Sellers',
      _ => null,
    };
    return tag == null ? () => context.push('/browse') : _openTag(tag);
  }

  @override
  Widget build(BuildContext context) {
    final productsState = ref.watch(productsProvider);
    final itemCount = ref.watch(cartProvider).value?.itemCount ?? 0;
    final palette = context.homePalette;

    return Scaffold(
      backgroundColor: palette.surface,
      body: ValueListenableBuilder<double>(
        valueListenable: _barProgress,
        child: Stack(
          children: <Widget>[
            Positioned.fill(
              child: productsState.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (error, _) => ErrorView(
                    error: error,
                    onRetry: () => ref.invalidate(productsProvider)),
                data: (products) {
                  if (products.isEmpty) {
                    return const EmptyView(
                        message: 'No products yet — seed your Medusa catalog.');
                  }
                  return _homeContent(
                    filterProductsByHomeCategory(products, _category),
                  );
                },
              ),
            ),
            Positioned(
              top: 0,
              left: 0,
              right: 0,
              child: HomePinnedBar(
                key: _barKey,
                progress: _barProgress,
                cartCount: itemCount,
                onSearch: () => context.push('/search'),
                onCart: () => context.push('/cart'),
                onTrade: () => context.go('/b2b'),
              ),
            ),
          ],
        ),
        builder: (context, t, child) => AnnotatedRegion<SystemUiOverlayStyle>(
          value: t >= HomePinnedBar.lightThreshold
              ? SystemUiOverlayStyle.dark
              : SystemUiOverlayStyle.light,
          child: child!,
        ),
      ),
    );
  }

  /// Header gradient, then the products sheet that rides 24 up over it.
  Widget _homeContent(List<Product> filtered) {
    final palette = context.homePalette;
    final modules = ref.watch(homeModulesProvider);
    final headerHeight =
        HomeHeader.heightForWidth(MediaQuery.sizeOf(context).width);
    _scheduleMeasure();

    return NotificationListener<ScrollNotification>(
      onNotification: (n) {
        if (n.metrics.pixels >= n.metrics.maxScrollExtent - 500) {
          _loadMore(filtered.length);
        }
        return false;
      },
      child: ListView(
        key: const ValueKey<String>('home-scroll'),
        controller: _scroll,
        padding: EdgeInsets.zero,
        children: <Widget>[
          SizedBox(
            height: headerHeight - _productsOverlap,
            child: OverflowBox(
              alignment: Alignment.topCenter,
              minHeight: 0,
              maxHeight: headerHeight,
              child: HomeHeader(
                topInset: _barHeight,
                bottomInset: _productsOverlap,
                rotationMs: ref.watch(heroRotationMsProvider('b2c')).value ?? 0,
                banners: ref.watch(heroBannersProvider),
                onLocation: () => context.push('/addresses'),
                onBannerAction: (uri) => context.push(uri),
              ),
            ),
          ),
          Container(
            key: _productsKey,
            decoration: BoxDecoration(
              color: palette.surface,
              borderRadius: const BorderRadius.vertical(
                top: Radius.circular(_productsRadius),
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: <Widget>[
                Padding(
                  padding: const EdgeInsets.fromLTRB(
                    _gutter,
                    _gutter,
                    _gutter,
                    0,
                  ),
                  child: _discoveryEntry(),
                ),
                for (final module in modules)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(
                      _gutter,
                      _gutter,
                      _gutter,
                      0,
                    ),
                    child: MerchandisingModuleView(
                      module: module,
                      onProductTap: _openProduct,
                      onAddToCart: _addToCart,
                      onDiscuss: _discuss,
                      onSeeAll: _seeAllFor(module),
                      onBannerTap: _openTag('Clearance Sale'),
                      onBannerAction: (uri) => context.push(uri),
                      onToggleWishlist: _toggleWishlist,
                      isWishlisted: _isWishlisted,
                    ),
                  ),
                Padding(
                  padding: const EdgeInsets.all(_gutter),
                  child: _catalogSection(filtered),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _discoveryEntry() {
    final colors =
        Theme.of(context).extension<AgencyColors>() ?? AgencyColors.light;
    final products = ref.watch(productsProvider).value ?? const <Product>[];
    final categoryCount = ref.watch(presentationProvider).categories.length;
    final brandCount = brandsOf(products).length;
    return Container(
      padding: const EdgeInsets.all(AgencySpacing.md),
      decoration: BoxDecoration(
        color: colors.surfaceRaised,
        borderRadius: BorderRadius.circular(AgencyRadius.lg),
        border: Border.all(color: colors.borderDefault),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            children: <Widget>[
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text('Find the right aisle',
                        style: TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w700,
                            color: colors.contentPrimary)),
                    Text('Shop by task, category or brand',
                        style: TextStyle(
                            fontSize: 11, color: colors.contentSecondary)),
                  ],
                ),
              ),
              TextButton(
                onPressed: () => context.push('/discover'),
                child: const Text('Explore all'),
              ),
            ],
          ),
          const SizedBox(height: AgencySpacing.xs),
          Row(
            children: <Widget>[
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => context.push('/discover'),
                  icon: const Icon(Icons.grid_view_outlined, size: 17),
                  label: Text('$categoryCount categories',
                      maxLines: 1, overflow: TextOverflow.ellipsis),
                  style: OutlinedButton.styleFrom(
                    minimumSize: const Size.fromHeight(44),
                    padding: const EdgeInsets.symmetric(horizontal: 8),
                    textStyle: const TextStyle(fontSize: 12),
                  ),
                ),
              ),
              const SizedBox(width: AgencySpacing.sm),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => context.push('/discover?tab=brands'),
                  icon: const Icon(Icons.sell_outlined, size: 17),
                  label: Text('$brandCount brands',
                      maxLines: 1, overflow: TextOverflow.ellipsis),
                  style: OutlinedButton.styleFrom(
                    minimumSize: const Size.fromHeight(44),
                    padding: const EdgeInsets.symmetric(horizontal: 8),
                    textStyle: const TextStyle(fontSize: 12),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: AgencySpacing.xs),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: <Widget>[
                _projectChip('Paint a room'),
                _projectChip('Fix a leaking pipe'),
                _projectChip('Drill into concrete'),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _projectChip(String prompt) => Padding(
        padding: const EdgeInsets.only(right: AgencySpacing.xs),
        child: ActionChip(
          avatar: const Icon(Icons.auto_awesome, size: 14),
          label: Text(prompt, style: const TextStyle(fontSize: 10)),
          onPressed: () => context.push(
            '/search?mode=ai&q=${Uri.encodeComponent(prompt)}',
          ),
        ),
      );

  /// The single "Browse Categories" section: icon-led category filter + the
  /// product cards below, sharing one shaded unit and one long scroll.
  Widget _catalogSection(List<Product> filtered) {
    final categories = ref.watch(categoriesProvider);
    final rail = <Category>[
      const Category(label: 'All', icon: Icons.apps_outlined),
      ...categories,
    ];
    final visible = filtered.take(_visible).toList();
    final hasMore = _visible < filtered.length;

    return MerchandisingUnitCard(
      title: 'Browse Categories',
      onSeeAll: () => context.push('/browse'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          MerchandisingBanner(
            imageUrl: ref.watch(categoryBannerImageProvider(_category)),
            title: _category ?? 'Shop by category',
            subtitle: 'Top picks in this aisle',
            ctaLabel: 'Explore',
            onCta: () => _openCategory(_category),
          ),
          const SizedBox(height: AgencySpacing.sm),
          CategoryIconRail(
            categories: rail,
            selectedLabel: _category ?? 'All',
            onSelected: (c) =>
                _selectCategory(c.label == 'All' ? null : c.label),
          ),
          const SizedBox(height: AgencySpacing.sm),
          if (filtered.isEmpty)
            _emptyCategory()
          else ...<Widget>[
            GridView.builder(
              shrinkWrap: true,
              primary: false,
              physics: const NeverScrollableScrollPhysics(),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2,
                mainAxisSpacing: _tileGap,
                crossAxisSpacing: _tileGap,
                mainAxisExtent: 296,
              ),
              itemCount: visible.length,
              itemBuilder: (context, i) => _card(visible[i]),
            ),
            const SizedBox(height: AgencySpacing.sm),
            if (hasMore)
              PinWorkflowAction(
                label: 'Load more products',
                hierarchy: PinWorkflowHierarchy.secondary,
                onPressed: () => _loadMore(filtered.length),
              ),
          ],
        ],
      ),
    );
  }

  Widget _emptyCategory() {
    final colors =
        Theme.of(context).extension<AgencyColors>() ?? AgencyColors.light;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(AgencySpacing.lg),
      decoration: BoxDecoration(
        color: colors.surfaceRaised,
        borderRadius: BorderRadius.circular(AgencyRadius.lg),
        border: Border.all(color: colors.borderDefault),
      ),
      child: Column(
        children: <Widget>[
          Icon(Icons.inventory_2_outlined,
              size: 32, color: colors.contentSecondary),
          const SizedBox(height: AgencySpacing.sm),
          Text('No ${_category ?? ''} products yet',
              textAlign: TextAlign.center,
              style: AgencyText.title
                  .copyWith(fontSize: 16, color: colors.contentPrimary)),
          const SizedBox(height: AgencySpacing.xs),
          Text('Try another category or browse the full catalog.',
              textAlign: TextAlign.center,
              style: AgencyText.label.copyWith(color: colors.contentSecondary)),
          const SizedBox(height: AgencySpacing.sm),
          TextButton.icon(
            onPressed: () => _selectCategory(null),
            icon: const Icon(Icons.grid_view_outlined, size: 18),
            label: const Text('View All'),
          ),
        ],
      ),
    );
  }

  Widget _card(Product product) {
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
      onPressed: () => _openProduct(product),
      onAddToCart: () => _addToCart(product),
      onDiscuss: () => _discuss(product),
      wishlisted: _isWishlisted(product),
      onWishlist: () => _toggleWishlist(product),
    );
  }
}
