import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../domain/b2b_trade_models.dart';
import '../providers/b2b_trade_providers.dart';

/// The **single** shared B2B trade product tile, used by B2B Home, the
/// Catalogue and Trade Offers & Deals so the card is identical everywhere.
///
/// Content: discount badge · compact image · brand + MOQ · 2-line title ·
/// quantity tiers · dealer price + MRP · quantity stepper · compact Cart-Plus ·
/// optional compact RFQ. No delivery-location text and no large full-width
/// Add-to-Cart button.
///
/// Interactions are independent so purchasing controls never trigger the
/// product-detail navigation: image/title → PDP, tier chips → select tier,
/// stepper → quantity, Cart-Plus → add, RFQ → RFQ journey.
Widget tradeProductTile(
  BuildContext context,
  WidgetRef ref,
  TradeProduct p, {
  required int selectedTierIndex,
  required ValueChanged<int> onTierSelected,
  required int quantity,
  required ValueChanged<int> onQuantityChanged,
}) {
  final tiers = p.tiers
      .map((t) => TradeTierOption(
            quantity: t.quantity,
            priceLabel: t.unitPrice.formatted,
          ))
      .toList();
  return TradeProductCardCompact(
    title: p.product.title,
    brand: p.product.brand,
    moqLabel: 'MOQ ${p.moq}',
    imageUrl: p.product.thumbnail,
    savingsLabel: p.savingsPercent == null ? null : '${p.savingsPercent}% off',
    tiers: tiers,
    selectedTierIndex: selectedTierIndex,
    onTierSelected: onTierSelected,
    unitPriceLabel: '${p.unitPriceFor(quantity).formatted}/pc',
    mrpLabel: p.mrp.formatted,
    quantity: quantity,
    onQuantityChanged: onQuantityChanged,
    state: p.stockQty <= 0
        ? CommerceFixture.outOfStock
        : CommerceFixture.defaultState,
    onAdd: () {
      ref
          .read(b2bQuotationCartProvider.notifier)
          .addTradeProduct(p, quantity: quantity);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Added $quantity pcs of ${p.product.title}')),
      );
    },
    onTap: () => context.push('/b2b/pdp/${p.product.id}'),
  );
}
