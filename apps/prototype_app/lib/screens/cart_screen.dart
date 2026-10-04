import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../domain/models.dart';
import '../providers/cart_providers.dart';
import '../providers/catalog_providers.dart';
import '../widgets/status_views.dart';

/// The active cart with quantity controls, a checkout summary, and a
/// related-product merchandising unit ("You may also like").
class CartScreen extends ConsumerWidget {
  const CartScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cartState = ref.watch(cartProvider);
    final products = ref.watch(productsProvider).value ?? const <Product>[];

    return Scaffold(
      appBar: AppBar(
        title: const Text('Cart'),
        actions: <Widget>[
          IconButton(
            tooltip: 'My Orders',
            onPressed: () => context.push('/orders'),
            icon: const Icon(Icons.receipt_long_outlined),
          ),
        ],
      ),
      body: cartState.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => ErrorView(error: error),
        data: (cart) {
          final items = cart?.items ?? const <CartLineItem>[];
          final inCart = <String>{
            for (final item in items) item.id,
          };
          final related = products
              .where((p) =>
                  !inCart.contains(p.id) &&
                  !inCart.contains(p.variantId ?? p.id))
              .take(8)
              .toList();

          return ListView(
            padding: const EdgeInsets.all(AgencySpacing.md),
            children: <Widget>[
              if (items.isEmpty)
                const EmptyView(message: 'Your cart is empty')
              else ...<Widget>[
                for (final item in items)
                  PinCartLine(
                    title: item.title,
                    subtitle: item.unitPrice?.formatted,
                    quantity: item.quantity,
                    onIncrement: () => ref
                        .read(cartProvider.notifier)
                        .updateQuantity(item.id, item.quantity + 1),
                    onDecrement: () => ref
                        .read(cartProvider.notifier)
                        .updateQuantity(item.id, item.quantity - 1),
                    onRemove: () =>
                        ref.read(cartProvider.notifier).removeItem(item.id),
                  ),
                const SizedBox(height: AgencySpacing.md),
                CheckoutSummary(
                  subtotal: cart?.total?.formatted ?? '—',
                  shipping: 'Free',
                  total: cart?.total?.formatted ?? '—',
                  onContinue: () => context.push('/checkout'),
                ),
              ],
              const SizedBox(height: AgencySpacing.lg),
              _related(context, ref, related),
              const SizedBox(height: AgencySpacing.md),
              _ordersQuickLink(context),
            ],
          );
        },
      ),
    );
  }

  /// Quick link to Orders. Orders lives under Account, so surface it from the
  /// cart too for fast navigation (track shipments, reorder).
  Widget _ordersQuickLink(BuildContext context) {
    final colors =
        Theme.of(context).extension<AgencyColors>() ?? AgencyColors.light;
    return Material(
      color: colors.surfaceRaised,
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AgencyRadius.lg),
        side: BorderSide(color: colors.borderDefault),
      ),
      child: ListTile(
        leading: Icon(Icons.receipt_long_outlined, color: colors.actionPrimary),
        title: Text('My Orders',
            style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: colors.contentPrimary)),
        subtitle: Text('Track shipments and reorder past purchases',
            style: TextStyle(fontSize: 12, color: colors.contentSecondary)),
        trailing:
            Icon(Icons.chevron_right, size: 18, color: colors.contentSecondary),
        onTap: () => context.push('/orders'),
      ),
    );
  }

  Widget _related(BuildContext context, WidgetRef ref, List<Product> products) {
    if (products.isEmpty) return const SizedBox.shrink();
    return MerchandisingUnitCard(
      title: 'You may also like',
      onSeeAll: () => context.go('/browse'),
      child: SizedBox(
        height: 252,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          itemCount: products.length,
          separatorBuilder: (_, __) => const SizedBox(width: AgencySpacing.sm),
          itemBuilder: (context, i) {
            final p = products[i];
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
                  await ref
                      .read(cartProvider.notifier)
                      .addItem(variantId: p.variantId ?? p.id, quantity: 1);
                  if (context.mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Added to cart')),
                    );
                  }
                },
              ),
            );
          },
        ),
      ),
    );
  }
}
