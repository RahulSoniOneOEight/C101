import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../data/demo_gallery.dart';
import '../domain/models.dart';
import '../domain/conversation_models.dart';
import '../widgets/cart_feedback.dart';
import '../widgets/cart_product_card.dart';
import '../widgets/bought_together_section.dart';
import '../widgets/market_comparison.dart';
import '../widgets/fulfilment_promise_card.dart';
import '../providers/account_providers.dart';
import '../providers/cart_actions.dart';
import '../providers/catalog_providers.dart';
import '../providers/conversation_dock_provider.dart';
import '../widgets/conversation_bell.dart';
import '../widgets/status_views.dart';

/// Product detail with an add-to-cart action against the default variant.
class ProductDetailScreen extends ConsumerWidget {
  const ProductDetailScreen({super.key, required this.productId});

  final String productId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final product = ref.watch(productProvider(productId));
    ref.listen(productProvider(productId), (previous, next) {
      final value = next.value;
      if (value != null) {
        ref.read(recentlyViewedProvider.notifier).add(value.id);
      }
    });
    // A direct PDP load can already have the product resolved before this
    // screen subscribes. Record it once after the first frame so the in-chat
    // Recently viewed swimlane is populated in that path too.
    if (product.value != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        final value = ref.read(productProvider(productId)).value;
        if (value != null) {
          ref.read(recentlyViewedProvider.notifier).add(value.id);
        }
      });
    }
    return Scaffold(
      appBar: AppBar(
        actions: <Widget>[
          const ConversationBellButton(
              audience: ConversationAudience.household),
          Consumer(builder: (context, ref, _) {
            final saved = ref.watch(wishlistProvider).contains(productId);
            return IconButton(
              tooltip: saved ? 'Remove from wishlist' : 'Save to wishlist',
              onPressed: () =>
                  ref.read(wishlistProvider.notifier).toggle(productId),
              icon: Icon(saved ? Icons.favorite : Icons.favorite_border,
                  color: saved
                      ? Theme.of(context).extension<AgencyColors>()?.promotion
                      : null),
            );
          }),
        ],
      ),
      body: product.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => ErrorView(
          error: error,
          onRetry: () => ref.invalidate(productProvider(productId)),
        ),
        data: (p) => _ProductDetail(product: p),
      ),
    );
  }
}

class _ProductDetail extends ConsumerStatefulWidget {
  const _ProductDetail({required this.product});

  final Product product;

  @override
  ConsumerState<_ProductDetail> createState() => _ProductDetailState();
}

class _ProductDetailState extends ConsumerState<_ProductDetail> {
  /// Selected seller offer id. Defaults to the best-price offer.
  String? _selectedSellerId;

  /// Selected SKU of a grouped product. Defaults to the product's first
  /// sellable variant.
  String? _selectedVariantId;

  /// U-017 gallery state.
  final PageController _galleryController = PageController();
  int _galleryIndex = 0;

  /// Sticky buy bar appears once the buy box scrolls away.
  final ScrollController _scroll = ScrollController();
  bool _showSticky = false;

  @override
  void initState() {
    super.initState();
    _scroll.addListener(() {
      final show = _scroll.offset > 420;
      if (show != _showSticky) setState(() => _showSticky = show);
    });
  }

  @override
  void dispose() {
    _galleryController.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Product get product => widget.product;

  @override
  Widget build(BuildContext context) {
    final canAdd = product.price != null;
    final related = ref.watch(productsProvider).value ?? const <Product>[];
    final relatedProducts =
        related.where((p) => p.id != product.id).take(6).toList();

    // A product can be offered by multiple sellers; the best-price offer is the
    // default selection.
    final sellers = ref.watch(productSellersProvider(product.id));
    if (sellers.isNotEmpty) {
      final ids = sellers.map((s) => s.id).toSet();
      if (_selectedSellerId == null || !ids.contains(_selectedSellerId)) {
        _selectedSellerId = sellers
            .firstWhere((s) => s.isBestPrice, orElse: () => sellers.first)
            .id;
      }
    }
    ProductSeller? selected;
    for (final s in sellers) {
      if (s.id == _selectedSellerId) selected = s;
    }

    // A grouped product owns several SKUs. The selected variant drives price,
    // offer and add-to-cart identity so no SKU inherits another SKU's price.
    final variants = product.variants;
    final selectedVariant = variants.isEmpty
        ? null
        : variants.firstWhere(
            (v) => v.id == _selectedVariantId,
            orElse: () => product.defaultVariant ?? variants.first,
          );
    final effectivePrice =
        selectedVariant?.price ?? selected?.price ?? product.price;
    final effectiveMrp = selectedVariant?.mrp ?? selected?.mrp ?? product.mrp;
    final effectiveOfferId =
        selectedVariant?.offerId ?? selected?.id ?? product.offerId ?? '';
    final effectiveVariantId =
        selectedVariant?.id ?? product.variantId ?? product.id;

    return Stack(
      children: <Widget>[
        ListView(
          controller: _scroll,
          padding: const EdgeInsets.all(AgencySpacing.md),
          children: <Widget>[
            _gallery(context),
            const SizedBox(height: AgencySpacing.md),
            _identity(context, selectedVariant),
            const SizedBox(height: AgencySpacing.sm),
            _priceRow(context, selectedVariant, selected),
            _availability(context),
            const SizedBox(height: AgencySpacing.md),
            if (variants.isNotEmpty) ...<Widget>[
              _variantSection(context, variants, selectedVariant),
              const SizedBox(height: AgencySpacing.md),
            ],
            _actions(context, ref, canAdd, selected,
                variant: selectedVariant,
                offerId: effectiveOfferId,
                variantId: effectiveVariantId,
                unitPrice: effectivePrice,
                priceAvailable: effectivePrice != null),
            const SizedBox(height: AgencySpacing.md),
            const FulfilmentPromiseCard(),
            const SizedBox(height: AgencySpacing.lg),
            _keySpecs(context, selectedVariant),
            const SizedBox(height: AgencySpacing.lg),
            _description(context),
            const SizedBox(height: AgencySpacing.lg),
            _fullSpecs(context, selectedVariant),
            // Price comparison belongs below the facts, not above the buy box.
            if (product.catalogueImport == null) ...<Widget>[
              const SizedBox(height: AgencySpacing.lg),
              _benchmark(context, effectivePrice, effectiveMrp),
            ],
            if (effectivePrice != null) ...<Widget>[
              const SizedBox(height: AgencySpacing.md),
              MarketComparison(sellingPrice: effectivePrice),
            ],
            const SizedBox(height: AgencySpacing.lg),
            // A grouped product's seller is shown per SKU above; repeating the
            // list would print the same seller once per variant as if they
            // competed.
            if (sellers.isNotEmpty && variants.isEmpty) ...<Widget>[
              _sellerSection(context, sellers, selected),
              const SizedBox(height: AgencySpacing.lg),
            ],
            BoughtTogetherSection(current: product, sku: selectedVariant?.sku),
            if (relatedProducts.isNotEmpty) ...<Widget>[
              const SizedBox(height: AgencySpacing.lg),
              _related(context, relatedProducts),
            ],
            const SizedBox(height: 96),
          ],
        ),
        if (_showSticky)
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: _stickyBar(context, ref, canAdd, selected,
                variant: selectedVariant,
                offerId: effectiveOfferId,
                variantId: effectiveVariantId,
                unitPrice: effectivePrice,
                priceAvailable: effectivePrice != null),
          ),
      ],
    );
  }

  /// Brand → name → short detail → SKU/variant (U-017 §2).
  Widget _identity(BuildContext context, ProductVariant? selectedVariant) {
    final colors =
        Theme.of(context).extension<AgencyColors>() ?? AgencyColors.light;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        if (product.brand != null)
          Text(product.brand!,
              style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: colors.contentSecondary)),
        const SizedBox(height: 2),
        Text(product.title,
            style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w600,
                color: colors.contentPrimary)),
        const SizedBox(height: 2),
        Text(
          'Short detail and highlights arrive with the real catalogue copy.',
          style: TextStyle(fontSize: 12, color: colors.contentSecondary),
        ),
        if (selectedVariant?.sku != null) ...<Widget>[
          const SizedBox(height: 4),
          Text(
            'SKU ${selectedVariant!.sku}'
            '${selectedVariant.label.isNotEmpty ? ' · ${selectedVariant.label}' : ''}',
            style: TextStyle(fontSize: 11, color: colors.contentSecondary),
          ),
        ],
      ],
    );
  }

  Widget _availability(BuildContext context) {
    final colors =
        Theme.of(context).extension<AgencyColors>() ?? AgencyColors.light;
    return Padding(
      padding: const EdgeInsets.only(top: 4),
      child: Row(
        children: <Widget>[
          Container(
            width: 7,
            height: 7,
            decoration:
                BoxDecoration(color: colors.trust, shape: BoxShape.circle),
          ),
          const SizedBox(width: 6),
          Expanded(
            child: Text(
              'In stock · Free delivery in 3–5 days',
              style: TextStyle(fontSize: 12, color: colors.contentSecondary),
            ),
          ),
        ],
      ),
    );
  }

  /// Small chip that keeps demo content honest (U-017 R5).
  Widget _demoChip(BuildContext context, String label) {
    final colors =
        Theme.of(context).extension<AgencyColors>() ?? AgencyColors.light;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: colors.surfaceInteractive,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(label,
          style: TextStyle(fontSize: 10, color: colors.contentSecondary)),
    );
  }

  Widget _keySpecs(BuildContext context, ProductVariant? selectedVariant) {
    final colors =
        Theme.of(context).extension<AgencyColors>() ?? AgencyColors.light;
    final rows = <(String, String)>[
      if (product.brand != null) ('Brand', product.brand!),
      if (selectedVariant?.sku != null) ('SKU', selectedVariant!.sku!),
      ('Material', 'Demo value'),
      ('Size', 'Demo value'),
      ('Grade', 'Demo value'),
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Wrap(
          spacing: AgencySpacing.sm,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: <Widget>[
            Text('Key specifications',
                style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: colors.contentPrimary)),
            _demoChip(context, 'Demo content'),
          ],
        ),
        const SizedBox(height: AgencySpacing.sm),
        for (final row in rows)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 3),
            child: Row(
              children: <Widget>[
                SizedBox(
                  width: 110,
                  child: Text(row.$1,
                      style: TextStyle(
                          fontSize: 12, color: colors.contentSecondary)),
                ),
                Expanded(
                  child: Text(row.$2,
                      style: TextStyle(
                          fontSize: 12, color: colors.contentPrimary)),
                ),
              ],
            ),
          ),
      ],
    );
  }

  Widget _description(BuildContext context) {
    final colors =
        Theme.of(context).extension<AgencyColors>() ?? AgencyColors.light;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Wrap(
          spacing: AgencySpacing.sm,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: <Widget>[
            Text('Description',
                style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: colors.contentPrimary)),
            _demoChip(context, 'Demo content'),
          ],
        ),
        const SizedBox(height: AgencySpacing.sm),
        Text(
          'This is placeholder description copy shown while the catalogue '
          'content is being prepared for staging.',
          style: TextStyle(
              fontSize: 12, height: 1.5, color: colors.contentSecondary),
        ),
        const SizedBox(height: AgencySpacing.sm),
        Text(
          'Real product copy, usage guidance and warranty details will replace '
          'this text before launch.',
          style: TextStyle(
              fontSize: 12, height: 1.5, color: colors.contentSecondary),
        ),
      ],
    );
  }

  Widget _fullSpecs(BuildContext context, ProductVariant? selectedVariant) {
    final colors =
        Theme.of(context).extension<AgencyColors>() ?? AgencyColors.light;
    final rows = <(String, String)>[
      if (product.brand != null) ('Brand', product.brand!),
      if (product.categoryLabel != null) ('Category', product.categoryLabel!),
      if (selectedVariant?.sku != null) ('SKU', selectedVariant!.sku!),
      if (selectedVariant?.sellerName != null)
        ('Seller', selectedVariant!.sellerName!),
      ('Model', 'Demo value'),
      ('Warranty', 'Demo value'),
      ('Country of origin', 'Demo value'),
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Wrap(
          spacing: AgencySpacing.sm,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: <Widget>[
            Text('Full specifications',
                style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: colors.contentPrimary)),
            _demoChip(context, 'Demo content'),
          ],
        ),
        const SizedBox(height: AgencySpacing.sm),
        for (final row in rows)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 3),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                SizedBox(
                  width: 130,
                  child: Text(row.$1,
                      style: TextStyle(
                          fontSize: 12, color: colors.contentSecondary)),
                ),
                Expanded(
                  child: Text(row.$2,
                      style: TextStyle(
                          fontSize: 12, color: colors.contentPrimary)),
                ),
              ],
            ),
          ),
      ],
    );
  }

  Widget _gallery(BuildContext context) {
    final colors =
        Theme.of(context).extension<AgencyColors>() ?? AgencyColors.light;
    final images = pdpImages(productId: product.id, thumbnail: product.thumbnail);
    if (images.isEmpty) {
      return AspectRatio(
        aspectRatio: 4 / 3,
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: colors.surfacePage,
            borderRadius: BorderRadius.circular(AgencyRadius.lg),
          ),
          child: Center(
            child: Icon(Icons.image_outlined,
                size: 56, color: colors.contentSecondary),
          ),
        ),
      );
    }
    return Column(
      children: <Widget>[
        AspectRatio(
          aspectRatio: 4 / 3,
          child: ClipRRect(
            borderRadius: BorderRadius.circular(AgencyRadius.lg),
            child: ColoredBox(
              color: colors.surfacePage,
              child: Stack(
                fit: StackFit.expand,
                children: <Widget>[
                  PageView.builder(
                    controller: _galleryController,
                    itemCount: images.length,
                    onPageChanged: (index) =>
                        setState(() => _galleryIndex = index),
                    itemBuilder: (context, index) {
                      final image = images[index];
                      return Semantics(
                        image: true,
                        label: image.representative
                            ? 'Representative image — not the exact product'
                            : '${product.title} image ${index + 1} of ${images.length}',
                        child: Image.network(
                          image.url,
                          fit: BoxFit.contain,
                          errorBuilder: (_, __, ___) => Center(
                            child: Icon(Icons.image_outlined,
                                size: 56, color: colors.contentSecondary),
                          ),
                        ),
                      );
                    },
                  ),
                  Positioned(
                    top: AgencySpacing.sm,
                    left: AgencySpacing.sm,
                    child: _overlayChip(
                      context,
                      '${_galleryIndex + 1} / ${images.length}',
                    ),
                  ),
                  if (images[_galleryIndex].representative)
                    Positioned(
                      left: AgencySpacing.sm,
                      bottom: AgencySpacing.sm,
                      child: _overlayChip(context, 'Representative image'),
                    ),
                ],
              ),
            ),
          ),
        ),
        if (images.length > 1) ...<Widget>[
          const SizedBox(height: AgencySpacing.sm),
          Row(
            children: <Widget>[
              for (var i = 0; i < images.length; i++)
                GestureDetector(
                  onTap: () => _galleryController.animateToPage(
                    i,
                    duration: const Duration(milliseconds: 220),
                    curve: Curves.easeOut,
                  ),
                  child: Container(
                    width: 7,
                    height: 7,
                    margin: const EdgeInsets.only(right: 6),
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: i == _galleryIndex
                          ? colors.actionPrimary
                          : colors.borderDefault,
                    ),
                  ),
                ),
              const Spacer(),
              for (var i = 0; i < images.length; i++)
                GestureDetector(
                  onTap: () => _galleryController.animateToPage(
                    i,
                    duration: const Duration(milliseconds: 220),
                    curve: Curves.easeOut,
                  ),
                  child: Container(
                    width: 44,
                    height: 44,
                    margin: const EdgeInsets.only(left: 6),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(AgencyRadius.sm),
                      border: Border.all(
                        color: i == _galleryIndex
                            ? colors.actionPrimary
                            : colors.borderDefault,
                        width: i == _galleryIndex ? 2 : 1,
                      ),
                    ),
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(AgencyRadius.sm - 1),
                      child: Image.network(
                        images[i].url,
                        fit: BoxFit.cover,
                        errorBuilder: (_, __, ___) => Icon(
                          Icons.image_outlined,
                          size: 16,
                          color: colors.contentSecondary,
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ],
      ],
    );
  }

  /// Small translucent chip used over the gallery image.
  Widget _overlayChip(BuildContext context, String label) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.55),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(label,
          style: const TextStyle(
              fontSize: 10,
              color: Colors.white,
              fontWeight: FontWeight.w600)),
    );
  }

  Future<void> _addToCart(
    BuildContext context,
    WidgetRef ref, {
    required bool buy,
    required String offerId,
    required String variantId,
    required Money? unitPrice,
  }) async {
    final added = await addToCartSafely(
      ref,
      offerId: offerId,
      variantId: variantId,
      unitPrice: unitPrice,
    );
    if (!context.mounted) return;
    if (buy) {
      if (added) {
        context.push('/checkout');
      } else {
        showCartErrorToast(
          context,
          'Could not start checkout. Please retry.',
        );
      }
      return;
    }
    added ? showCartAddedToast(context) : showCartErrorToast(context);
  }

  /// Sticky buy bar: price + Add + Buy only. Discuss never enters this bar.
  Widget _stickyBar(
    BuildContext context,
    WidgetRef ref,
    bool canAdd,
    ProductSeller? seller, {
    required ProductVariant? variant,
    required String offerId,
    required String variantId,
    required Money? unitPrice,
    required bool priceAvailable,
  }) {
    final colors =
        Theme.of(context).extension<AgencyColors>() ?? AgencyColors.light;
    return Material(
      key: const Key('pdp-sticky-bar'),
      elevation: 18,
      color: colors.surfaceRaised,
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(
              AgencySpacing.md, AgencySpacing.sm, AgencySpacing.md, AgencySpacing.sm),
          child: Row(
            children: <Widget>[
              Text(unitPrice?.formatted ?? 'Price on request',
                  style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      color: colors.contentPrimary)),
              const Spacer(),
              SizedBox(
                height: 40,
                child: OutlinedButton(
                  onPressed: priceAvailable && canAdd
                      ? () => _addToCart(
                            context,
                            ref,
                            buy: false,
                            offerId: offerId,
                            variantId: variantId,
                            unitPrice: unitPrice,
                          )
                      : null,
                  style: OutlinedButton.styleFrom(
                    side: BorderSide(color: colors.borderDefault),
                    foregroundColor: colors.actionPrimary,
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                  ),
                  child: const Text('Add'),
                ),
              ),
              const SizedBox(width: AgencySpacing.sm),
              SizedBox(
                height: 40,
                child: FilledButton(
                  onPressed: priceAvailable && canAdd
                      ? () => _addToCart(
                            context,
                            ref,
                            buy: true,
                            offerId: offerId,
                            variantId: variantId,
                            unitPrice: unitPrice,
                          )
                      : null,
                  style: FilledButton.styleFrom(
                    backgroundColor: colors.actionPrimary,
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                  ),
                  child: const Text('Buy'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _priceRow(
      BuildContext context, ProductVariant? variant, ProductSeller? seller) {
    final colors =
        Theme.of(context).extension<AgencyColors>() ?? AgencyColors.light;
    final price = variant?.price ?? seller?.price ?? product.price;
    final mrp = variant?.mrp ?? seller?.mrp ?? product.mrp;
    final int? discount;
    if (price != null && mrp != null && mrp.amount > price.amount) {
      discount = (((mrp.amount - price.amount) / mrp.amount) * 100).round();
    } else {
      discount = seller?.discountPercent ?? product.discountPercent;
    }
    return Row(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: <Widget>[
        Text(price?.formatted ?? 'Price on request',
            style: TextStyle(
                fontSize: 24,
                fontWeight: FontWeight.w700,
                color: colors.contentPrimary)),
        if (mrp != null) ...<Widget>[
          const SizedBox(width: AgencySpacing.sm),
          Text(mrp.formatted,
              style: TextStyle(
                  fontSize: 13,
                  color: colors.contentSecondary,
                  decoration: TextDecoration.lineThrough)),
        ],
        if (discount != null) ...<Widget>[
          const SizedBox(width: AgencySpacing.sm),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
            decoration: BoxDecoration(
              color: colors.promotion,
              borderRadius: BorderRadius.circular(999),
            ),
            child: Text('$discount% off',
                style: TextStyle(
                    fontSize: 11,
                    color: colors.promotionInverse,
                    fontWeight: FontWeight.w600)),
          ),
        ],
      ],
    );
  }

  Widget _actions(
    BuildContext context,
    WidgetRef ref,
    bool canAdd,
    ProductSeller? seller, {
    required ProductVariant? variant,
    required String offerId,
    required String variantId,
    required Money? unitPrice,
    required bool priceAvailable,
  }) {
    final colors =
        Theme.of(context).extension<AgencyColors>() ?? AgencyColors.light;
    return Column(
      children: <Widget>[
        Row(
          children: <Widget>[
            Expanded(
              child: OutlinedButton.icon(
                onPressed: priceAvailable && canAdd
                    ? () => _addToCart(context, ref,
                          buy: false,
                          offerId: offerId,
                          variantId: variantId,
                          unitPrice: unitPrice)
                    : null,
                icon: const Icon(Icons.add_shopping_cart, size: 18),
                label: const Text('Add to Cart'),
                style: OutlinedButton.styleFrom(
                  minimumSize: const Size.fromHeight(48),
                  side: BorderSide(color: colors.borderDefault),
                  foregroundColor: colors.actionPrimary,
                ),
              ),
            ),
            const SizedBox(width: AgencySpacing.sm),
            Expanded(
              child: FilledButton(
                onPressed: priceAvailable && canAdd
                    ? () => _addToCart(context, ref,
                          buy: true,
                          offerId: offerId,
                          variantId: variantId,
                          unitPrice: unitPrice)
                    : null,
                style: FilledButton.styleFrom(
                  backgroundColor: colors.actionPrimary,
                  minimumSize: const Size.fromHeight(48),
                ),
                child: const Text('Buy Now'),
              ),
            ),
          ],
        ),
        // Discuss is a secondary action under the buy controls — deliberately
        // not a third full-width button and never in the sticky bar (U-017 R2).
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(
            key: const Key('pdp-discuss'),
            onPressed: () =>
                ref.read(conversationDockProvider.notifier).discuss(
                      ConversationAudience.household,
                      ConversationProductCapture.fromProduct(
                        product,
                        variant: variant,
                        sellerName: seller?.name,
                        unitPrice: unitPrice,
                        variantId: variantId,
                        offerId: offerId,
                      ),
                    ),
            icon: const Icon(Icons.forum_outlined, size: 16),
            label: const Text('Discuss this product'),
            style: TextButton.styleFrom(
              foregroundColor: colors.actionPrimary,
              padding: const EdgeInsets.symmetric(horizontal: 4),
              minimumSize: const Size(0, 32),
              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              textStyle: const TextStyle(fontSize: 12),
            ),
          ),
        ),
      ],
    );
  }

  Widget _benchmark(BuildContext context, Money? price, Money? mrp) {
    final colors =
        Theme.of(context).extension<AgencyColors>() ?? AgencyColors.light;
    mrp ??= price;
    if (price == null || mrp == null) return const SizedBox.shrink();
    final save = Money(
        amount: mrp.amount - price.amount, currencyCode: price.currencyCode);
    final flipkart = Money(
        amount: (mrp.amount * 0.93).round(), currencyCode: price.currencyCode);
    final amazon = Money(
        amount: (mrp.amount * 0.95).round(), currencyCode: price.currencyCode);

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
          Text('Price comparison',
              style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: colors.contentPrimary)),
          const SizedBox(height: AgencySpacing.sm),
          _compareRow(context, 'Flipkart', flipkart.formatted),
          _compareRow(context, 'Amazon', amazon.formatted),
          _compareRow(context, 'Market Price', mrp.formatted),
          _compareRow(context, 'BuildKart', price.formatted, highlight: true),
          const Divider(height: AgencySpacing.lg),
          Row(
            children: <Widget>[
              Icon(Icons.savings_outlined, size: 16, color: colors.trust),
              const SizedBox(width: AgencySpacing.xs),
              Text('You save ${save.formatted}',
                  style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: colors.trust)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _compareRow(BuildContext context, String label, String value,
      {bool highlight = false}) {
    final colors =
        Theme.of(context).extension<AgencyColors>() ?? AgencyColors.light;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: <Widget>[
          Expanded(
            child: Text(label,
                style: TextStyle(
                    fontSize: 12,
                    color: highlight
                        ? colors.actionPrimary
                        : colors.contentSecondary,
                    fontWeight: highlight ? FontWeight.w600 : FontWeight.w400)),
          ),
          Text(value,
              style: TextStyle(
                  fontSize: 13,
                  color:
                      highlight ? colors.actionPrimary : colors.contentPrimary,
                  fontWeight: highlight ? FontWeight.w700 : FontWeight.w500)),
        ],
      ),
    );
  }

  /// Every SKU of a grouped product, each with its own price and SKU code.
  Widget _variantSection(BuildContext context, List<ProductVariant> variants,
      ProductVariant? selected) {
    final colors =
        Theme.of(context).extension<AgencyColors>() ?? AgencyColors.light;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Text('Variants (${variants.length})',
            style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: colors.contentPrimary)),
        const SizedBox(height: AgencySpacing.xs),
        Wrap(
          spacing: AgencySpacing.xs,
          runSpacing: AgencySpacing.xs,
          children: <Widget>[
            for (final variant in variants)
              ChoiceChip(
                // The SKU is printed on the chip, not only in a tooltip: on a
                // phone there is no hover, and the SKU is how a buyer identifies
                // one of the 500 source items inside a grouped card.
                label: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text(
                      variant.price == null
                          ? variant.label
                          : '${variant.label} · ${variant.price!.formatted}',
                      style: const TextStyle(fontSize: 12),
                    ),
                    if (variant.sku != null)
                      Text(
                        variant.sku!,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                            fontSize: 9, color: colors.contentSecondary),
                      ),
                  ],
                ),
                selected: variant.id == selected?.id,
                onSelected: (_) =>
                    setState(() => _selectedVariantId = variant.id),
              ),
          ],
        ),
        if (selected?.sku != null) ...<Widget>[
          const SizedBox(height: AgencySpacing.xs),
          Text(
              'Selected SKU: ${selected!.sku}'
              '${selected.sellerName == null ? '' : ' · ${selected.sellerName}'}',
              style: TextStyle(fontSize: 11, color: colors.contentSecondary)),
        ],
      ],
    );
  }

  Widget _sellerSection(BuildContext context, List<ProductSeller> sellers,
      ProductSeller? selected) {
    final colors =
        Theme.of(context).extension<AgencyColors>() ?? AgencyColors.light;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Text('Sold by (${sellers.length} sellers)',
            style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: colors.contentPrimary)),
        const SizedBox(height: AgencySpacing.sm),
        for (final s in sellers)
          _sellerRow(context, colors, s, s.id == selected?.id),
      ],
    );
  }

  Widget _sellerRow(BuildContext context, AgencyColors colors,
      ProductSeller seller, bool isSelected) {
    return InkWell(
      onTap: () => setState(() => _selectedSellerId = seller.id),
      borderRadius: BorderRadius.circular(AgencyRadius.lg),
      child: Container(
        margin: const EdgeInsets.only(bottom: AgencySpacing.sm),
        padding: const EdgeInsets.all(AgencySpacing.sm),
        decoration: BoxDecoration(
          color: isSelected ? colors.surfaceInteractive : colors.surfaceRaised,
          borderRadius: BorderRadius.circular(AgencyRadius.lg),
          border: Border.all(
              color: isSelected ? colors.actionPrimary : colors.borderDefault),
        ),
        child: Row(
          children: <Widget>[
            Icon(
              isSelected
                  ? Icons.radio_button_checked
                  : Icons.radio_button_unchecked,
              size: 18,
              color:
                  isSelected ? colors.actionPrimary : colors.contentSecondary,
            ),
            const SizedBox(width: AgencySpacing.sm),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Row(
                    children: <Widget>[
                      Flexible(
                        child: Text(seller.name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                                color: colors.contentPrimary)),
                      ),
                      if (seller.isBestPrice) ...<Widget>[
                        const SizedBox(width: AgencySpacing.xs),
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: colors.trust,
                            borderRadius: BorderRadius.circular(999),
                          ),
                          child: Text('Best price',
                              style: TextStyle(
                                  fontSize: 9,
                                  fontWeight: FontWeight.w600,
                                  color: colors.contentInverse)),
                        ),
                      ],
                    ],
                  ),
                  const SizedBox(height: 2),
                  Row(
                    children: <Widget>[
                      if (seller.verified) ...<Widget>[
                        Icon(Icons.verified, size: 13, color: colors.trust),
                        const SizedBox(width: 4),
                      ],
                      if (seller.rating != null) ...<Widget>[
                        Icon(Icons.star,
                            size: 12, color: colors.feedbackWarning),
                        const SizedBox(width: 2),
                        Text(seller.rating!.toStringAsFixed(1),
                            style: TextStyle(
                                fontSize: 11, color: colors.contentSecondary)),
                        const SizedBox(width: AgencySpacing.sm),
                      ],
                      if (seller.deliveryNote != null)
                        Flexible(
                          child: Text(seller.deliveryNote!,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                  fontSize: 11,
                                  color: colors.contentSecondary)),
                        ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(width: AgencySpacing.sm),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: <Widget>[
                Text(seller.price.formatted,
                    style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                        color: isSelected
                            ? colors.actionPrimary
                            : colors.contentPrimary)),
                if (seller.discountPercent != null)
                  Text('${seller.discountPercent}% off',
                      style: TextStyle(fontSize: 10, color: colors.promotion)),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _related(BuildContext context, List<Product> products) {
    final colors =
        Theme.of(context).extension<AgencyColors>() ?? AgencyColors.light;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Text('Related products',
            style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: colors.contentPrimary)),
        const SizedBox(height: AgencySpacing.sm),
        SizedBox(
          height: 300,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: products.length,
            separatorBuilder: (_, __) =>
                const SizedBox(width: AgencySpacing.sm),
            itemBuilder: (context, i) => SizedBox(
              width: 150,
              child: CartProductCard(
                product: products[i],
                title: products[i].title,
                priceLabel: products[i].price?.formatted ?? '',
                previousPriceLabel: products[i].mrp?.formatted,
                discountLabel: products[i].discountPercent == null
                    ? null
                    : '${products[i].discountPercent}% OFF',
                imageUrl: products[i].thumbnail,
                brand: products[i].brand,
                badges: products[i].badges,
                variant: ProductCardVariant.compact,
                onPressed: () => context.push('/product/${products[i].id}'),
                onDiscuss: () =>
                    ref.read(conversationDockProvider.notifier).discuss(
                          ConversationAudience.household,
                          ConversationProductCapture.fromProduct(products[i]),
                        ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}
