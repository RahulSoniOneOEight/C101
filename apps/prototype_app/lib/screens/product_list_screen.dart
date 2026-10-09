import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../domain/merchandising.dart';
import '../domain/models.dart';
import '../providers/account_providers.dart';
import '../providers/cart_providers.dart';
import '../providers/catalog_providers.dart';
import '../widgets/home_header.dart';
import '../widgets/merchandising_sections.dart';
import '../widgets/notification_bell.dart';
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

  /// Selected category label; null means "All".
  String? _category;
  int _visible = _pageSize;

  void _selectCategory(String? label) => setState(() {
        _category = label;
        _visible = _pageSize;
      });

  void _loadMore(int total) {
    if (_visible >= total) return;
    setState(() => _visible += _pageSize);
  }

  Future<void> _addToCart(Product product) async {
    await ref
        .read(cartProvider.notifier)
        .addItem(
            offerId: product.offerId ?? '',
            variantId: product.variantId ?? product.id,
            quantity: 1);
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Added to cart')),
    );
  }

  void _openProduct(Product product) => context.push('/product/${product.id}');

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

  void _openCategory(String? label) => context.push(
      label == null ? '/browse' : '/browse?category=${Uri.encodeComponent(label)}');

  /// Opens Browse pre-filtered to the collection behind a module or banner.
  VoidCallback _openTag(String tag) =>
      () => context.push('/browse?tag=${Uri.encodeComponent(tag)}');

  /// "See All" target for a headed module. Flash Deals / Best Sellers open the
  /// matching Browse filter; other sections open the full catalogue.
  VoidCallback? _seeAllFor(MerchandisingModule module) {
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
    final modules = ref.watch(homeModulesProvider);
    final productsState = ref.watch(productsProvider);
    final itemCount = ref.watch(cartProvider).value?.itemCount ?? 0;

    return Scaffold(
      appBar: AppBar(
        title: const Text('BuildKart'),
        actions: <Widget>[
          const NotificationBell(),
          IconButton(
            tooltip: 'B2B trade',
            onPressed: () => context.go('/b2b'),
            icon: const Icon(Icons.business_outlined),
          ),
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
        error: (error, _) => ErrorView(
            error: error, onRetry: () => ref.invalidate(productsProvider)),
        data: (products) {
          if (products.isEmpty) {
            return const EmptyView(
                message: 'No products yet — seed your Medusa catalog.');
          }
          final filtered = filterProductsByHomeCategory(products, _category);
          return NotificationListener<ScrollNotification>(
            onNotification: (n) {
              if (n.metrics.pixels >= n.metrics.maxScrollExtent - 500) {
                _loadMore(filtered.length);
              }
              return false;
            },
            child: ListView(
              padding: const EdgeInsets.only(bottom: AgencySpacing.md),
              children: <Widget>[
                Padding(
                  padding: const EdgeInsets.all(AgencySpacing.md),
                  child: HomeHeader(
                    onSearch: () => context.push('/search'),
                    onLocation: () => context.push('/addresses'),
                    onHeroTap: (tag) => context.push(
                        '/browse?tag=${Uri.encodeComponent(tag)}'),
                  ),
                ),
                for (final module in modules)
                  Padding(
                    padding: const EdgeInsets.symmetric(
                        horizontal: AgencySpacing.md),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        MerchandisingModuleView(
                          module: module,
                          onProductTap: _openProduct,
                          onAddToCart: _addToCart,
                          onSeeAll: _seeAllFor(module),
                          onBannerTap: _openTag('Clearance Sale'),
                          onToggleWishlist: _toggleWishlist,
                          isWishlisted: _isWishlisted,
                        ),
                        const SizedBox(height: AgencySpacing.md),
                      ],
                    ),
                  ),
                _catalogSection(filtered),
              ],
            ),
          );
        },
      ),
    );
  }

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
            imageUrl: categoryBannerImage(_category),
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
                mainAxisSpacing: AgencySpacing.sm,
                crossAxisSpacing: AgencySpacing.sm,
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
    return ProductCard(
      title: product.title,
      priceLabel: product.price?.formatted ?? 'Price on request',
      previousPriceLabel: product.mrp?.formatted,
      discountLabel: product.discountPercent == null
          ? null
          : '${product.discountPercent}% off',
      imageUrl: product.thumbnail,
      brand: product.brand,
      badges: product.badges.isEmpty
          ? const <String>['Assured']
          : product.badges,
      variant: ProductCardVariant.large,
      onPressed: () => _openProduct(product),
      onAddToCart: () => _addToCart(product),
      wishlisted: _isWishlisted(product),
      onWishlist: () => _toggleWishlist(product),
    );
  }
}
