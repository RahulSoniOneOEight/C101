import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../domain/app_notification.dart';
import '../domain/b2b_trade_models.dart';
import '../providers/b2b_trade_providers.dart';
import '../providers/notifications_providers.dart';
import '../providers/trade_offers_providers.dart';
import '../widgets/trade_product_tile.dart';

/// BuildKart B2B Trade Home — **V5**.
///
/// Each merchandising surface is a distinct **unit card** (shaded, titled) so
/// Buy Again, Trade Offers & Deals, and Categories + Products read as separate
/// modules. Quick order is driven by the kept procurement lists
/// (Seasonal / Kitchen Works / Floor Essentials).
class B2BHomeScreen extends ConsumerStatefulWidget {
  const B2BHomeScreen({super.key});

  @override
  ConsumerState<B2BHomeScreen> createState() => _B2BHomeScreenState();
}

class _B2BHomeScreenState extends ConsumerState<B2BHomeScreen> {
  /// The active quick-order list preset (name of a procurement list).
  String _selectedList = '';

  /// Per-SKU quick-order quantities (defaults to the product MOQ).
  final Map<String, int> _quickQty = <String, int>{};

  /// Per-product selected tier index and quantity for the trade grid.
  final Map<String, int> _selectedTier = <String, int>{};
  final Map<String, int> _gridQty = <String, int>{};

  /// The active Trade Offers & Deals collection shown in the Home preview.
  String? _activeOfferId;

  /// How many catalogue products the "Browse categories" unit has revealed.
  int _catVisible = 4;

  /// Selected trade-category id for the inline "Browse categories" filter
  /// (null = All). Drives the banner image and the product grid.
  String? _catId;

  @override
  Widget build(BuildContext context) {
    final catalogue = ref.watch(tradeCatalogueProvider);
    final cart = ref.watch(b2bQuotationCartProvider);
    final presets = ref.watch(quickOrderPresetsProvider);
    if (_selectedList.isEmpty && presets.isNotEmpty) {
      _selectedList = presets.first;
    }

    return Scaffold(
      body: SafeArea(
        child: CustomScrollView(
          slivers: <Widget>[
            SliverToBoxAdapter(
              child: B2BHeader(
                onSearchTap: () => context.push('/b2b/catalogue'),
                onNotificationsTap: () =>
                    context.push('/notifications?audience=b2b'),
                notificationCount: ref.watch(
                    unreadNotificationsProvider(NotificationAudience.b2b)),
                onCartTap: () => context.go('/b2b/cart'),
                onAccountTap: () => context.go('/b2b/account'),
              ),
            ),
            // ---- Quick order unit ----
            SliverToBoxAdapter(child: _quickOrderUnit(catalogue)),
            // ---- Buy Again unit ----
            SliverToBoxAdapter(child: _buyAgainUnit()),
            // ---- Trade Offers & Deals unit ----
            SliverToBoxAdapter(child: _offersUnit()),
            // ---- Categories + Products unit ----
            SliverToBoxAdapter(child: _categoriesUnit(catalogue)),
            // ---- Cart summary ----
            if (!cart.isEmpty) SliverToBoxAdapter(child: _cartSummary(cart)),
            const SliverToBoxAdapter(child: SizedBox(height: AgencySpacing.lg)),
          ],
        ),
      ),
    );
  }

  // ---- Quick order --------------------------------------------------------

  Widget _quickOrderUnit(List<TradeProduct> catalogue) {
    final colours = context.colors;
    final presets = ref.watch(quickOrderPresetsProvider);
    final products = _listProducts(catalogue);
    return MerchandisingUnitCard(
      title: 'Quick order',
      seeAllLabel: 'View More',
      onSeeAll: () => context.push('/b2b/quick-order'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          ProcurementListFilterBar(
            filters: presets,
            selected: <String>{_selectedList},
            onToggle: (f) => setState(() => _selectedList = f),
          ),
          const SizedBox(height: AgencySpacing.sm),
          if (products.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: AgencySpacing.md),
              child: Text('No SKUs in this list yet.',
                  style:
                      TextStyle(fontSize: 13, color: colours.contentSecondary)),
            )
          else
            LayoutBuilder(
              builder: (context, constraints) {
                // Two rows × two visible columns. Further SKUs continue on the
                // horizontal axis, preserving four immediately visible tiles.
                const gap = AgencySpacing.sm;
                final tileWidth = (constraints.maxWidth - gap) / 2;
                return SizedBox(
                  // Two 130px cards plus the inter-row gap. This preserves the
                  // component's 44px cart target without clipping.
                  height: 268,
                  child: GridView.builder(
                    key: const Key('b2bHomeQuickOrderGrid'),
                    scrollDirection: Axis.horizontal,
                    gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: 2,
                      mainAxisSpacing: gap,
                      crossAxisSpacing: gap,
                      mainAxisExtent: tileWidth,
                    ),
                    itemCount: products.length,
                    itemBuilder: (context, i) {
                      final p = products[i];
                      final qty = _quickQty[p.product.id] ?? p.moq;
                      return CompactQuickOrderSkuCard(
                        title: p.product.title,
                        sku: p.product.id,
                        priceLabel: p.tradePrice.formatted,
                        imageUrl: p.product.thumbnail,
                        quantity: qty,
                        minQuantity: 1,
                        onQuantityChanged: (v) =>
                            setState(() => _quickQty[p.product.id] = v),
                        onAdd: () => _addProduct(p, qty),
                        onTap: () => context.push('/b2b/pdp/${p.product.id}'),
                      );
                    },
                  ),
                );
              },
            ),
          const SizedBox(height: AgencySpacing.sm),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: _addQuickOrder,
              style: FilledButton.styleFrom(
                backgroundColor: colours.actionPrimary,
                minimumSize: const Size.fromHeight(44),
              ),
              child: const Text('Add to Order'),
            ),
          ),
        ],
      ),
    );
  }

  /// Resolves the selected procurement list's SKUs to catalogue trade products.
  List<TradeProduct> _listProducts(List<TradeProduct> catalogue) {
    final lists = ref.watch(procurementListsProvider);
    final list = lists.where((l) => l.title == _selectedList).firstOrNull ??
        (lists.isNotEmpty ? lists.first : null);
    if (list == null) return const <TradeProduct>[];
    final resolved = <TradeProduct>[];
    for (final item in list.items) {
      for (final p in catalogue) {
        if (p.product.id == item.sku || p.product.title == item.name) {
          resolved.add(p);
          break;
        }
      }
    }
    return resolved;
  }

  void _addProduct(TradeProduct p, int qty) {
    ref
        .read(b2bQuotationCartProvider.notifier)
        .addTradeProduct(p, quantity: qty);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Added $qty pcs of ${p.product.title}')),
    );
  }

  void _addQuickOrder() {
    final products = _listProducts(ref.read(tradeCatalogueProvider));
    if (products.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('This list has no orderable SKUs')),
      );
      return;
    }
    final cart = ref.read(b2bQuotationCartProvider.notifier);
    for (final p in products) {
      cart.addTradeProduct(p, quantity: _quickQty[p.product.id] ?? p.moq);
    }
    context.go('/b2b/cart');
  }

  // ---- Buy Again ----------------------------------------------------------

  Widget _buyAgainUnit() {
    final products = ref.watch(frequentSavedProvider);
    return MerchandisingUnitCard(
      title: 'Buy Again',
      onSeeAll: () => context.push('/b2b/orders'),
      child: SizedBox(
        height: 150,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          itemCount: products.length,
          separatorBuilder: (_, __) => const SizedBox(width: AgencySpacing.sm),
          itemBuilder: (context, i) => BuyAgainCard(
            title: products[i].product.title,
            imageUrl: products[i].product.thumbnail,
            onTap: () => context.push('/b2b/pdp/${products[i].product.id}'),
            onAdd: () {
              ref
                  .read(b2bQuotationCartProvider.notifier)
                  .addTradeProduct(products[i]);
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                    content: Text('Reordered — added to your order')),
              );
            },
          ),
        ),
      ),
    );
  }

  // ---- Trade Offers & Deals ----------------------------------------------

  Widget _offersUnit() {
    final featured = ref.watch(featuredTradeOffersProvider);
    return MerchandisingUnitCard(
      title: 'Trade Offers & Deals',
      onSeeAll: () => context.push(_activeOfferId == null
          ? '/b2b/offers'
          : '/b2b/offers?collection=$_activeOfferId'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          _offersRow(featured),
          const SizedBox(height: AgencySpacing.sm),
          _offersLane(),
        ],
      ),
    );
  }

  Widget _offersLane() {
    final featured = ref.watch(featuredTradeOffersProvider);
    final activeId =
        _activeOfferId ?? (featured.isNotEmpty ? featured.first.id : null);
    final products = activeId == null
        ? const <TradeProduct>[]
        : ref.watch(tradeOffersForCollectionProvider(activeId));
    if (products.isEmpty) return const SizedBox.shrink();
    return SizedBox(
      height: 196,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: products.length,
        separatorBuilder: (_, __) => const SizedBox(width: AgencySpacing.sm),
        itemBuilder: (context, i) => HorizontalSKUCard(
          title: products[i].product.title,
          priceLabel: products[i].tradePrice.formatted,
          imageUrl: products[i].product.thumbnail,
          onAdd: () => _addProduct(products[i], products[i].moq),
          onTap: () => context.push('/b2b/pdp/${products[i].product.id}'),
        ),
      ),
    );
  }

  Widget _offersRow(List<TradeOfferCollection> featured) {
    if (featured.isEmpty) return const SizedBox.shrink();
    final activeId = _activeOfferId ?? featured.first.id;
    return Row(
      children: <Widget>[
        for (var i = 0; i < featured.length; i++) ...<Widget>[
          if (i > 0) const SizedBox(width: AgencySpacing.sm),
          Expanded(
            child: TradeOfferCollectionCard(
              title: featured[i].title,
              subtitle: featured[i].description,
              icon: featured[i].icon,
              accent: _accentOf(featured[i].accent),
              accentSurface: _accentSurfaceOf(featured[i].accent),
              selected: featured[i].id == activeId,
              onTap: () => setState(() => _activeOfferId = featured[i].id),
            ),
          ),
        ],
      ],
    );
  }

  Color _accentOf(TradeOfferAccent a) {
    final c = context.colors;
    return switch (a) {
      TradeOfferAccent.trust => c.trust,
      TradeOfferAccent.promotion => c.promotion,
      TradeOfferAccent.primary => c.actionPrimary,
      TradeOfferAccent.info => c.feedbackInfo,
    };
  }

  Color _accentSurfaceOf(TradeOfferAccent a) {
    final c = context.colors;
    return switch (a) {
      TradeOfferAccent.trust => c.trustSubtle,
      TradeOfferAccent.promotion => c.promotionSubtle,
      TradeOfferAccent.primary => c.surfaceInteractive,
      TradeOfferAccent.info => c.surfaceInteractive,
    };
  }

  // ---- Categories + Products ---------------------------------------------

  Widget _categoriesUnit(List<TradeProduct> catalogue) {
    final colours = context.colors;
    final tradeCategories = ref.watch(tradeDashboardProvider).categories;
    final selectedLabel = _catId == null
        ? null
        : tradeCategories
            .where((c) => c.id == _catId)
            .map((c) => c.label)
            .firstOrNull;
    final filtered = _catId == null
        ? catalogue
        : catalogue.where((p) => p.categoryId == _catId).toList();
    final shown = filtered.take(_catVisible).toList();
    final catalogueLink =
        _catId == null ? '/b2b/catalogue' : '/b2b/catalogue?category=$_catId';
    return MerchandisingUnitCard(
      title: 'Browse categories',
      onSeeAll: () => context.push(catalogueLink),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          MerchandisingBanner(
            imageUrl: b2bCategoryBannerImage(_catId),
            title: selectedLabel == null
                ? 'Trade catalogue'
                : '$selectedLabel supplies',
            subtitle: selectedLabel == null
                ? 'Negotiated tiers · MOQ · GST invoicing'
                : 'Wholesale rates for $selectedLabel',
            ctaLabel: 'Catalogue',
            onCta: () => context.push(catalogueLink),
          ),
          const SizedBox(height: AgencySpacing.sm),
          // Icon-led single-select categories — same icons + format as B2C.
          CategoryIconRail(
            categories: <Category>[
              const Category(label: 'All', icon: Icons.apps_outlined),
              for (final c in tradeCategories)
                Category(label: c.label, icon: c.icon),
            ],
            selectedLabel: selectedLabel ?? 'All',
            onSelected: (c) => setState(() {
              _catId = c.label == 'All'
                  ? null
                  : tradeCategories
                      .firstWhere((t) => t.label == c.label,
                          orElse: () => tradeCategories.first)
                      .id;
              _catVisible = 4;
            }),
          ),
          const SizedBox(height: AgencySpacing.sm),
          Text(selectedLabel == null ? 'Products' : '$selectedLabel products',
              style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: colours.contentPrimary)),
          const SizedBox(height: AgencySpacing.xs),
          if (shown.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: AgencySpacing.md),
              child: Text('No products in this category yet.',
                  style:
                      TextStyle(fontSize: 13, color: colours.contentSecondary)),
            )
          else
            GridView.builder(
              shrinkWrap: true,
              primary: false,
              physics: const NeverScrollableScrollPhysics(),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2,
                mainAxisSpacing: AgencySpacing.sm,
                crossAxisSpacing: AgencySpacing.sm,
                mainAxisExtent: kB2bProductCardExtent,
              ),
              itemCount: shown.length,
              itemBuilder: (context, i) => _productCard(shown[i]),
            ),
          const SizedBox(height: AgencySpacing.sm),
          PinWorkflowAction(
            label: _catVisible < filtered.length
                ? 'Load more products'
                : 'Open full catalogue',
            hierarchy: PinWorkflowHierarchy.secondary,
            onPressed: () {
              if (_catVisible < filtered.length) {
                setState(() => _catVisible += 4);
              } else {
                context.push(catalogueLink);
              }
            },
          ),
        ],
      ),
    );
  }

  Widget _productCard(TradeProduct p) {
    final selected = _selectedTier[p.product.id] ?? 0;
    final defaultQty = p.tiers.isEmpty
        ? p.moq
        : p.tiers[selected.clamp(0, p.tiers.length - 1)].quantity;
    final qty = _gridQty[p.product.id] ?? defaultQty;
    return tradeProductTile(
      context,
      ref,
      p,
      selectedTierIndex: selected,
      onTierSelected: (i) => setState(() {
        _selectedTier[p.product.id] = i;
        _gridQty.remove(p.product.id);
      }),
      quantity: qty,
      onQuantityChanged: (v) => setState(() => _gridQty[p.product.id] = v),
    );
  }

  Widget _cartSummary(B2BQuotationCart cart) {
    final colours = context.colors;
    return Padding(
      padding: const EdgeInsets.symmetric(
          horizontal: AgencySpacing.md, vertical: AgencySpacing.sm),
      child: Container(
        padding: const EdgeInsets.all(AgencySpacing.md),
        decoration: BoxDecoration(
          color: colours.surfaceRaised,
          borderRadius: BorderRadius.circular(AgencyRadius.lg),
          border: Border.all(color: colours.borderDefault),
        ),
        child: Row(
          children: <Widget>[
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Text('${cart.lines.length} items in cart',
                      style: TextStyle(
                          fontSize: 12, color: colours.contentSecondary)),
                  const SizedBox(height: 2),
                  Text(cart.total.formatted,
                      style: TextStyle(
                          fontSize: 19,
                          fontWeight: FontWeight.w700,
                          color: colours.actionPrimary)),
                ],
              ),
            ),
            FilledButton(
              onPressed: () => context.go('/b2b/cart'),
              style: FilledButton.styleFrom(
                backgroundColor: colours.actionPrimary,
              ),
              child: const Text('View Cart'),
            ),
          ],
        ),
      ),
    );
  }
}
