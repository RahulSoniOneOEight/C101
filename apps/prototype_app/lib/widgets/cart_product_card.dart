import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../domain/models.dart';
import '../providers/cart_providers.dart';

/// B2C product card bound to the canonical cart line.
///
/// The card shows a plus at zero and a compact stepper once the exact variant
/// is in the cart. Multi-variant cards deliberately stay on the plus path: the
/// caller opens the variant sheet, so the card never guesses which SKU to bind.
class CartProductCard extends ConsumerWidget {
  const CartProductCard({
    required this.product,
    required this.title,
    required this.priceLabel,
    this.imageUrl,
    this.brand,
    this.previousPriceLabel,
    this.discountLabel,
    this.rating,
    this.reviewCount,
    this.badges = const <String>[],
    this.deliveryNote,
    this.variant = ProductCardVariant.compact,
    this.onPressed,
    this.onAddToCart,
    this.onDiscuss,
    this.wishlisted = false,
    this.onWishlist,
    this.state = CommerceFixture.defaultState,
    super.key,
  });

  final Product product;
  final String title;
  final String priceLabel;
  final String? imageUrl;
  final String? brand;
  final String? previousPriceLabel;
  final String? discountLabel;
  final double? rating;
  final int? reviewCount;
  final List<String> badges;
  final String? deliveryNote;
  final ProductCardVariant variant;
  final VoidCallback? onPressed;
  final VoidCallback? onAddToCart;
  final VoidCallback? onDiscuss;
  final bool wishlisted;
  final VoidCallback? onWishlist;
  final CommerceFixture state;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final singleVariant = product.variants.length == 1
        ? product.variants.first
        : null;
    final lineKey = singleVariant?.id ?? product.cartVariantId;
    Cart? cart;
    try {
      cart = ref.watch(cartProvider).value;
    } catch (_) {
      // Presentation-only widget tests can render the card without a
      // ProviderScope; fall back to the stateless plus path.
      cart = null;
    }
    CartLineItem? line;
    if (singleVariant != null && cart != null) {
      for (final item in cart.items) {
        if (item.variantId == lineKey || item.id == lineKey) {
          line = item;
          break;
        }
      }
    }
    final quantity = line?.quantity ?? 0;
    final cartLine = line;

    return ProductCard(
      title: title,
      priceLabel: priceLabel,
      imageUrl: imageUrl,
      brand: brand,
      previousPriceLabel: previousPriceLabel,
      discountLabel: discountLabel,
      rating: rating,
      reviewCount: reviewCount,
      badges: badges,
      deliveryNote: deliveryNote,
      variant: variant,
      onPressed: onPressed,
      onAddToCart: onAddToCart,
      onDiscuss: onDiscuss,
      wishlisted: wishlisted,
      onWishlist: onWishlist,
      state: state,
      quantity: quantity > 0 ? quantity : null,
      onQuantityChanged: cartLine == null
          ? null
          : (next) async {
              final notifier = ref.read(cartProvider.notifier);
              if (next <= 0) {
                await notifier.removeItem(cartLine.id);
              } else {
                await notifier.updateQuantity(cartLine.id, next);
              }
            },
    );
  }
}
