import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../domain/models.dart';
import '../domain/account_models.dart';
import '../domain/conversation_models.dart';
import '../data/experience_api.dart';
import '../providers/account_providers.dart';
import '../providers/cart_actions.dart';
import '../providers/cart_providers.dart';
import '../providers/catalog_providers.dart';
import '../providers/conversation_dock_provider.dart';
import '../widgets/cart_feedback.dart';
import '../widgets/cart_product_card.dart';
import '../widgets/conversation_bell.dart';
import '../widgets/promotion_panel.dart';
import '../widgets/status_views.dart';

/// The active cart with quantity controls, a checkout summary, and a
/// related-product merchandising unit ("You may also like").
class CartScreen extends ConsumerWidget {
  const CartScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cartState = ref.watch(cartProvider);
    final products = ref.watch(productsProvider).value ?? const <Product>[];

    return _AutoDeliveryBinder(
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Cart'),
          actions: <Widget>[
            const ConversationBellButton(
                audience: ConversationAudience.household),
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
                    !inCart.contains(p.id) && !inCart.contains(p.cartVariantId))
                .take(8)
                .toList();

            return ListView(
              padding: const EdgeInsets.all(AgencySpacing.md),
              children: <Widget>[
                if (items.isEmpty)
                  const EmptyView(message: 'Your cart is empty')
                else ...<Widget>[
                  for (final item in items)
                    _CartLineWithDeals(item: item, catalogue: products),
                  const SizedBox(height: AgencySpacing.md),
                  PromotionPanel(cart: cart!),
                  if (cart.hasDiscount) _discountRow(context, cart),
                  _deliveryCard(context, ref, cart),
                  CheckoutSummary(
                    subtotal: cart.subtotal?.formatted ?? '—',
                    // One source of truth: the cart payload, never a hardcoded
                    // "Free" while checkout may charge a delivery fee.
                    shipping: (cart.shippingTotal?.amount ?? 0) > 0
                        ? (cart.shippingDiscountTotal?.amount ?? 0) > 0
                            ? '${cart.shippingTotal!.formatted} · offer applied'
                            : cart.shippingTotal!.formatted
                        : (cart.delivery?.applied.isNotEmpty ?? false)
                            ? 'Free'
                            : 'Set a delivery address',
                    total: cart.total?.formatted ?? '—',
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
      ),
    );
  }

  /// Per-seller delivery fees resolved from the bound address (U-009).
  ///
  /// The fee is shown in the cart as soon as an address is bound; checkout is
  /// read-only and only requires the address.
  Widget _deliveryCard(BuildContext context, WidgetRef ref, Cart cart) {
    final delivery = cart.delivery;
    final address = ref.watch(checkoutStartAddressProvider);
    if (delivery != null && delivery.applied.isNotEmpty) {
      return Padding(
        padding: const EdgeInsets.only(bottom: AgencySpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Text('Delivery', style: AgencyText.title),
            const SizedBox(height: AgencySpacing.xs),
            for (final line in delivery.lines)
              Row(
                children: <Widget>[
                  const Icon(Icons.local_shipping_outlined, size: 16),
                  const SizedBox(width: AgencySpacing.xs),
                  Expanded(
                    child: Text(
                      '${line.label} · ${line.isApplied ? line.amount.formatted : 'unavailable'}',
                      style: AgencyText.label,
                    ),
                  ),
                ],
              ),
            if ((cart.shippingDiscountTotal?.amount ?? 0) > 0)
              Text(
                'Delivery offer applied · −${cart.shippingDiscountTotal!.formatted}',
                style: AgencyText.label,
              ),
          ],
        ),
      );
    }
    if (address == null) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(bottom: AgencySpacing.md),
      child: Row(
        children: <Widget>[
          Expanded(
            child: Text(
              'Deliver to ${address.pincode} · ${address.label}',
              style: AgencyText.label,
            ),
          ),
          TextButton(
            onPressed: () => _bindDelivery(context, ref, cart, address),
            child: const Text('Check delivery fee'),
          ),
        ],
      ),
    );
  }

  Future<void> _bindDelivery(
    BuildContext context,
    WidgetRef ref,
    Cart cart,
    SavedAddress address,
  ) async {
    try {
      final api = ref.read(experienceApiProvider);
      final email = await api.currentSessionEmail() ?? '';
      if (email.isEmpty) return;
      final updated = await api.updateCartCustomerDetails(
        cart.id,
        email: email,
        shippingAddress: address.toCheckoutAddress(),
      );
      await ref.read(cartProvider.notifier).replaceFromServer(updated);
    } catch (_) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Could not resolve delivery for that address.'),
        ),
      );
    }
  }

  /// Engine-granted discount rows. Never computed from a code that was only
  /// typed: the amount comes from the cart response.
  Widget _discountRow(BuildContext context, Cart cart) {
    final colors =
        Theme.of(context).extension<AgencyColors>() ?? AgencyColors.light;
    return Padding(
      padding: const EdgeInsets.only(bottom: AgencySpacing.sm),
      child: Column(
        children: <Widget>[
          if ((cart.discountTotal?.amount ?? 0) > 0)
            Row(
              children: <Widget>[
                Icon(Icons.local_offer_outlined,
                    size: 15, color: colors.feedbackSuccess),
                const SizedBox(width: AgencySpacing.xs),
                Expanded(
                  child: Text(
                    'Discount · ${cart.promotions.map((p) => p.code).join(', ')}',
                    style:
                        TextStyle(fontSize: 13, color: colors.contentSecondary),
                  ),
                ),
                Text(
                  '-${cart.discountTotal!.formatted}',
                  style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: colors.feedbackSuccess),
                ),
              ],
            ),
          if ((cart.shippingDiscountTotal?.amount ?? 0) > 0)
            Row(
              children: <Widget>[
                const SizedBox(width: 19),
                Expanded(
                  child: Text('Shipping offer',
                      style: TextStyle(
                          fontSize: 12, color: colors.contentSecondary)),
                ),
                Text(
                  '-${cart.shippingDiscountTotal!.formatted}',
                  style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: colors.feedbackSuccess),
                ),
              ],
            ),
        ],
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
              child: CartProductCard(
                product: p,
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
                  final added = await addToCartSafely(
                    ref,
                    offerId: p.cartOfferId,
                    variantId: p.cartVariantId,
                  );
                  if (context.mounted) {
                    added
                        ? showCartAddedToast(context)
                        : showCartErrorToast(context);
                  }
                },
                onDiscuss: () =>
                    ref.read(conversationDockProvider.notifier).discuss(
                          ConversationAudience.household,
                          ConversationProductCapture.fromProduct(p),
                        ),
              ),
            );
          },
        ),
      ),
    );
  }
}

/// Resolves the per-seller delivery fee as soon as the cart opens with a saved
/// address, so the buyer does not have to tap "Check delivery fee" first.
class _AutoDeliveryBinder extends ConsumerStatefulWidget {
  const _AutoDeliveryBinder({required this.child});

  final Widget child;

  @override
  ConsumerState<_AutoDeliveryBinder> createState() =>
      _AutoDeliveryBinderState();
}

class _AutoDeliveryBinderState extends ConsumerState<_AutoDeliveryBinder> {
  bool _running = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _resolve());
  }

  Future<void> _resolve() async {
    if (_running) return;
    final cart = ref.read(cartProvider).value;
    final address = ref.read(checkoutStartAddressProvider);
    if (cart == null || cart.items.isEmpty || address == null) return;
    if (cart.delivery?.applied.isNotEmpty == true) return;
    _running = true;
    try {
      final updated =
          await ref.read(experienceApiProvider).applyDelivery(cart.id);
      await ref.read(cartProvider.notifier).replaceFromServer(updated);
    } catch (_) {
      // Checkout retries and surfaces a concrete error.
    } finally {
      _running = false;
    }
  }

  @override
  Widget build(BuildContext context) => widget.child;
}

/// A cart line with a per-SKU "Related deals" expander: tapping reveals a
/// horizontal rail of related products for that item.
class _CartLineWithDeals extends ConsumerStatefulWidget {
  const _CartLineWithDeals({required this.item, required this.catalogue});

  final CartLineItem item;
  final List<Product> catalogue;

  @override
  ConsumerState<_CartLineWithDeals> createState() => _CartLineWithDealsState();
}

class _CartLineWithDealsState extends ConsumerState<_CartLineWithDeals> {
  bool _open = false;

  List<Product> get _related {
    final line = widget.item;
    final candidates = widget.catalogue
        .where((p) => p.id != line.id && p.cartVariantId != line.id)
        .toList();
    // Same-brand products first, then the rest.
    final brand = line.title.split(' ').first.toLowerCase();
    candidates.sort((a, b) {
      final sa = (a.brand?.toLowerCase() == brand) ? 1 : 0;
      final sb = (b.brand?.toLowerCase() == brand) ? 1 : 0;
      return sb.compareTo(sa);
    });
    return candidates.take(6).toList();
  }

  @override
  Widget build(BuildContext context) {
    final item = widget.item;
    final related = _related;
    final product = catalogueProductForCartLine(item, widget.catalogue);
    final variant = product?.variants
        .where((candidate) => candidate.id == item.variantId)
        .firstOrNull;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        PinCartLine(
          title: item.title,
          subtitle: item.unitPrice?.formatted,
          imageUrl: cartLineImageUrl(item, widget.catalogue),
          quantity: item.quantity,
          onIncrement: () => ref
              .read(cartProvider.notifier)
              .updateQuantity(item.id, item.quantity + 1),
          onDecrement: () => ref
              .read(cartProvider.notifier)
              .updateQuantity(item.id, item.quantity - 1),
          onRemove: () => ref.read(cartProvider.notifier).removeItem(item.id),
          onDiscuss: product == null
              ? null
              : () => ref.read(conversationDockProvider.notifier).discuss(
                    ConversationAudience.household,
                    ConversationProductCapture.fromProduct(
                      product,
                      variant: variant,
                      quantity: item.quantity,
                      unitPrice: item.unitPrice,
                      variantId: item.variantId,
                      offerId: variant?.offerId ?? product.cartOfferId,
                    ),
                  ),
        ),
        if (related.isNotEmpty)
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              onPressed: () => setState(() => _open = !_open),
              icon:
                  Icon(_open ? Icons.expand_less : Icons.expand_more, size: 18),
              label: Text(_open ? 'Hide related deals' : 'Related deals'),
            ),
          ),
        if (_open)
          SizedBox(
            height: 244,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: related.length,
              separatorBuilder: (_, __) =>
                  const SizedBox(width: AgencySpacing.sm),
              itemBuilder: (context, i) {
                final p = related[i];
                return SizedBox(
                  width: 150,
                  child: CartProductCard(
                    product: p,
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
                      final added = await addToCartSafely(
                        ref,
                        offerId: p.cartOfferId,
                        variantId: p.cartVariantId,
                      );
                      if (context.mounted) {
                        added
                            ? showCartAddedToast(context)
                            : showCartErrorToast(context);
                      }
                    },
                    onDiscuss: () =>
                        ref.read(conversationDockProvider.notifier).discuss(
                              ConversationAudience.household,
                              ConversationProductCapture.fromProduct(p),
                            ),
                  ),
                );
              },
            ),
          ),
        const Divider(height: AgencySpacing.lg),
      ],
    );
  }
}
