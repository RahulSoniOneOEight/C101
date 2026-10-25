import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../domain/b2b_trade_models.dart';
import '../providers/b2b_trade_providers.dart';

/// The **single** shared B2B trade product tile, used by B2B Home, the
/// Catalogue and Trade Offers & Deals so the card is identical everywhere.
///
/// The card reads the canonical RFQ quantity for the exact SKU whose price and
/// MOQ it displays. It shows a plus at zero and a stepper after the SKU is in
/// the RFQ, so screen-local quantity maps cannot drift from the basket.
Widget tradeProductTile(
  BuildContext context,
  WidgetRef ref,
  TradeProduct p, {
  required int selectedTierIndex,
  required ValueChanged<int> onTierSelected,
}) {
  final tiers = p.tiers
      .map((t) => TradeTierOption(
            quantity: t.quantity,
            priceLabel: t.unitPrice.formatted,
          ))
      .toList();
  final brand = p.product.brand?.trim();
  final selectedVariant = p.selectedVariant ?? p.product.defaultVariant;
  final sku = selectedVariant?.sku ?? p.product.id;
  final cart = ref.watch(b2bQuotationCartProvider);
  B2BQuotationLine? line;
  for (final candidate in cart.lines) {
    if (candidate.sku == sku) {
      line = candidate;
      break;
    }
  }
  final quantity = line?.quantity ?? 0;
  final tierIndex = p.tiers.isEmpty
      ? 0
      : selectedTierIndex.clamp(0, p.tiers.length - 1);
  final tierQuantity = p.tiers.isEmpty ? p.moq : p.tiers[tierIndex].quantity;
  final priceQuantity = quantity > 0 ? quantity : tierQuantity;

  return TradeProductCardCompact(
    title: p.product.title,
    // The grouped SKU count matters more than the variant list on a card: it
    // tells the buyer there are more SKUs inside this one product.
    brand: brand == null || brand.isEmpty
        ? p.product.variantLabel
        : '$brand · ${p.product.variantLabel}',
    moqLabel: 'MOQ ${p.moq}',
    badgeLabel: p.product.badges.firstOrNull,
    imageUrl: p.product.thumbnail,
    savingsLabel: p.savingsPercent == null ? null : '${p.savingsPercent}% off',
    tiers: tiers,
    selectedTierIndex: selectedTierIndex,
    onTierSelected: (index) {
      onTierSelected(index);
      final nextTier = p.tiers.isEmpty
          ? p.moq
          : p.tiers[index.clamp(0, p.tiers.length - 1)].quantity;
      if (quantity > 0) {
        ref
            .read(b2bQuotationCartProvider.notifier)
            .updateQuantity(sku, nextTier);
      }
    },
    unitPriceLabel: '${p.unitPriceFor(priceQuantity).formatted}/pc',
    // Only a real list price may be struck through. Falling back to the selling
    // price would print "₹4750 ₹4750" and imply a discount that does not exist.
    mrpLabel: p.product.mrp == null ? null : p.mrp.formatted,
    quantity: quantity,
    onQuantityChanged: (next) {
      if (next < p.moq) {
        ref.read(b2bQuotationCartProvider.notifier).remove(sku);
      } else {
        ref
            .read(b2bQuotationCartProvider.notifier)
            .updateQuantity(sku, next);
      }
    },
    state: p.stockKnown && p.stockQty <= 0
        ? CommerceFixture.outOfStock
        : CommerceFixture.defaultState,
    onAdd: () {
      final addQuantity = quantity > 0 ? quantity : tierQuantity;
      ref.read(b2bQuotationCartProvider.notifier).addTradeProduct(
            p,
            quantity: addQuantity,
            variant: selectedVariant,
          );
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Added $addQuantity pcs of ${p.product.title}')),
      );
    },
    onTap: () => context.push('/b2b/pdp/${p.product.id}'),
  );
}
