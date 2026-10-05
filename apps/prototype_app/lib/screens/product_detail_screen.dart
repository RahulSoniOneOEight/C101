import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../domain/models.dart';
import '../providers/cart_providers.dart';
import '../providers/catalog_providers.dart';
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
    return Scaffold(
      appBar: AppBar(),
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

  Product get product => widget.product;

  @override
  Widget build(BuildContext context) {
    final colors =
        Theme.of(context).extension<AgencyColors>() ?? AgencyColors.light;
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

    return ListView(
      padding: const EdgeInsets.all(AgencySpacing.md),
      children: <Widget>[
        _hero(context),
        const SizedBox(height: AgencySpacing.md),
        if (product.brand != null) ...<Widget>[
          Text(product.brand!,
              style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: colors.contentSecondary)),
          const SizedBox(height: 2),
        ],
        Text(product.title,
            style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w600,
                color: colors.contentPrimary)),
        const SizedBox(height: AgencySpacing.sm),
        _priceRow(context, selected),
        const SizedBox(height: AgencySpacing.md),
        _actions(context, ref, canAdd, selected),
        const SizedBox(height: AgencySpacing.lg),
        _benchmark(context),
        const SizedBox(height: AgencySpacing.lg),
        if (sellers.isNotEmpty) ...<Widget>[
          _sellerSection(context, sellers, selected),
          const SizedBox(height: AgencySpacing.lg),
        ],
        _specs(context),
        if (relatedProducts.isNotEmpty) ...<Widget>[
          const SizedBox(height: AgencySpacing.lg),
          _related(context, relatedProducts),
        ],
      ],
    );
  }

  Widget _hero(BuildContext context) {
    final colors =
        Theme.of(context).extension<AgencyColors>() ?? AgencyColors.light;
    return Container(
      height: 260,
      decoration: BoxDecoration(
        color: colors.surfacePage,
        borderRadius: BorderRadius.circular(AgencyRadius.lg),
      ),
      child: product.thumbnail == null
          ? Center(
              child: Icon(Icons.image_outlined,
                  size: 56, color: colors.contentSecondary))
          : ClipRRect(
              borderRadius: BorderRadius.circular(AgencyRadius.lg),
              child: Image.network(product.thumbnail!,
                  fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => Center(
                      child: Icon(Icons.image_outlined,
                          size: 56, color: colors.contentSecondary))),
            ),
    );
  }

  Widget _priceRow(BuildContext context, ProductSeller? seller) {
    final colors =
        Theme.of(context).extension<AgencyColors>() ?? AgencyColors.light;
    final price = seller?.price ?? product.price;
    final mrp = seller?.mrp ?? product.mrp;
    final discount = seller?.discountPercent ?? product.discountPercent;
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
      BuildContext context, WidgetRef ref, bool canAdd, ProductSeller? seller) {
    final colors =
        Theme.of(context).extension<AgencyColors>() ?? AgencyColors.light;
    final unitPrice = seller?.price;
    return Row(
      children: <Widget>[
        Expanded(
          child: OutlinedButton.icon(
            onPressed: canAdd
                ? () async {
                    final messenger = ScaffoldMessenger.of(context);
                    await ref.read(cartProvider.notifier).addItem(
                        offerId: seller?.id ?? '',
                        variantId: product.variantId ?? product.id,
                        quantity: 1,
                        unitPrice: unitPrice);
                    if (context.mounted) {
                      messenger.showSnackBar(SnackBar(
                          content: Text(seller == null
                              ? 'Added to cart'
                              : 'Added to cart · ${seller.name}')));
                    }
                  }
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
            onPressed: canAdd
                ? () async {
                    await ref.read(cartProvider.notifier).addItem(
                        offerId: seller?.id ?? '',
                        variantId: product.variantId ?? product.id,
                        quantity: 1,
                        unitPrice: unitPrice);
                    if (context.mounted) context.push('/checkout');
                  }
                : null,
            style: FilledButton.styleFrom(
              backgroundColor: colors.actionPrimary,
              minimumSize: const Size.fromHeight(48),
            ),
            child: const Text('Buy Now'),
          ),
        ),
      ],
    );
  }

  Widget _benchmark(BuildContext context) {
    final colors =
        Theme.of(context).extension<AgencyColors>() ?? AgencyColors.light;
    final price = product.price;
    final mrp = product.mrp ?? price;
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

  Widget _specs(BuildContext context) {
    final colors =
        Theme.of(context).extension<AgencyColors>() ?? AgencyColors.light;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Text('Product specifications',
            style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: colors.contentPrimary)),
        const SizedBox(height: AgencySpacing.sm),
        for (final spec in const <(String, String)>[
          ('Brand', 'BuildPro'),
          ('Model', 'BDK-18V'),
          ('Warranty', '1 year'),
          ('Delivery', 'Free · Mon'),
        ])
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: Row(
              children: <Widget>[
                SizedBox(
                  width: 120,
                  child: Text(spec.$1,
                      style: TextStyle(
                          fontSize: 12, color: colors.contentSecondary)),
                ),
                Expanded(
                  child: Text(spec.$2,
                      style: TextStyle(
                          fontSize: 12, color: colors.contentPrimary)),
                ),
              ],
            ),
          ),
      ],
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
              child: ProductCard(
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
              ),
            ),
          ),
        ),
      ],
    );
  }
}
