import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../domain/b2b_trade_models.dart';
import '../domain/bought_together.dart';
import '../domain/models.dart';
import '../providers/b2b_trade_providers.dart';
import '../providers/cart_actions.dart';
import '../providers/catalog_providers.dart';
import '../widgets/cart_feedback.dart';

/// Reciprocal Bought Together section. Hidden when there is no ready pair or
/// when the optional read fails; it must never block the product page.
class BoughtTogetherSection extends ConsumerWidget {
  const BoughtTogetherSection({
    required this.current,
    this.channel = 'b2c',
    this.currentTrade,
    super.key,
  });

  final Product current;
  final String channel;
  final TradeProduct? currentTrade;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final pair = ref.watch(
      boughtTogetherProvider((id: current.id, channel: channel)),
    );
    return pair.maybeWhen(
      data: (value) {
        if (value == null || value.paired == null) return const SizedBox.shrink();
        return _content(context, ref, value);
      },
      orElse: () => const SizedBox.shrink(),
    );
  }

  Widget _content(BuildContext context, WidgetRef ref, BoughtTogether value) {
    final colors =
        Theme.of(context).extension<AgencyColors>() ?? AgencyColors.light;
    final paired = value.paired!;
    final isB2b = channel == 'b2b';
    final pairedTrade = isB2b ? tradeProductFromCatalogue(paired) : null;
    final currentTradeValue = currentTrade ??
        (isB2b ? tradeProductFromCatalogue(current) : null);
    final outOfStock = value.isOutOfStock;

    return Container(
      margin: const EdgeInsets.only(top: AgencySpacing.lg),
      padding: const EdgeInsets.all(AgencySpacing.md),
      decoration: BoxDecoration(
        color: colors.surfaceRaised,
        borderRadius: BorderRadius.circular(AgencyRadius.lg),
        border: Border.all(color: colors.borderDefault),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(
            'Bought together',
            style: TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w700,
              color: colors.contentPrimary,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            'Recommended with this item.',
            style: TextStyle(fontSize: 11, color: colors.contentSecondary),
          ),
          const SizedBox(height: AgencySpacing.sm),
          _productRow(
            context,
            colors: colors,
            product: current,
            trade: currentTradeValue,
            label: 'This item',
            isB2b: isB2b,
          ),
          Padding(
            padding: const EdgeInsets.symmetric(vertical: AgencySpacing.xs),
            child: Row(
              children: <Widget>[
                Expanded(child: Divider(color: colors.borderDefault)),
                Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: AgencySpacing.sm,
                  ),
                  child: Text(
                    '+ Pair with',
                    style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w600,
                      color: colors.contentSecondary,
                    ),
                  ),
                ),
                Expanded(child: Divider(color: colors.borderDefault)),
              ],
            ),
          ),
          _productRow(
            context,
            colors: colors,
            product: paired,
            trade: pairedTrade,
            label: 'Pair with',
            isB2b: isB2b,
            action: outOfStock
                ? _disabledAction(colors)
                : paired.variants.length == 1
                    ? _addAction(context, ref, paired, pairedTrade, isB2b)
                    : _chooseAction(context, paired, colors),
          ),
        ],
      ),
    );
  }

  Widget _productRow(
    BuildContext context, {
    required AgencyColors colors,
    required Product product,
    required TradeProduct? trade,
    required String label,
    required bool isB2b,
    Widget? action,
  }) {
    final price = isB2b
        ? trade?.unitPriceFor(trade.moq).formatted
        : product.price?.formatted;
    final meta = isB2b && trade != null
        ? 'MOQ ${trade.moq}'
        : product.brand?.trim().isNotEmpty == true
            ? product.brand!.trim()
            : null;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: <Widget>[
        ClipRRect(
          borderRadius: BorderRadius.circular(AgencyRadius.sm),
          child: SizedBox(
            width: 56,
            height: 56,
            child: product.thumbnail == null
                ? ColoredBox(
                    color: colors.surfaceInteractive,
                    child: Icon(
                      Icons.image_outlined,
                      size: 20,
                      color: colors.contentSecondary,
                    ),
                  )
                : Image.network(
                    product.thumbnail!,
                    fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) => ColoredBox(
                      color: colors.surfaceInteractive,
                      child: Icon(
                        Icons.image_outlined,
                        size: 20,
                        color: colors.contentSecondary,
                      ),
                    ),
                  ),
          ),
        ),
        const SizedBox(width: AgencySpacing.sm),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Text(
                label,
                style: TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.w600,
                  color: colors.contentSecondary,
                ),
              ),
              Text(
                product.title,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: colors.contentPrimary,
                ),
              ),
              Text(
                <String>[
                  if (price != null) price,
                  if (meta != null) meta,
                ].join(' · '),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 11, color: colors.contentSecondary),
              ),
            ],
          ),
        ),
        if (action != null) ...<Widget>[
          const SizedBox(width: AgencySpacing.sm),
          action,
        ],
      ],
    );
  }

  Widget _addAction(
    BuildContext context,
    WidgetRef ref,
    Product paired,
    TradeProduct? pairedTrade,
    bool isB2b,
  ) {
    return FilledButton(
      onPressed: () async {
        if (isB2b && pairedTrade != null) {
          ref.read(b2bQuotationCartProvider.notifier).addTradeProduct(
                pairedTrade,
                quantity: pairedTrade.moq,
                variant: pairedTrade.selectedVariant,
              );
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('${paired.title} added to RFQ')),
          );
          return;
        }
        final added = await addToCartSafely(
          ref,
          offerId: paired.cartOfferId,
          variantId: paired.cartVariantId,
        );
        if (context.mounted) {
          added ? showCartAddedToast(context) : showCartErrorToast(context);
        }
      },
      style: FilledButton.styleFrom(
        minimumSize: const Size(88, 40),
        padding: const EdgeInsets.symmetric(horizontal: 12),
      ),
      child: Text(isB2b ? 'Add to RFQ' : 'Add', style: const TextStyle(fontSize: 12)),
    );
  }

  Widget _chooseAction(
    BuildContext context,
    Product paired,
    AgencyColors colors,
  ) {
    return OutlinedButton(
      onPressed: () => context.push(
        channel == 'b2b' ? '/b2b/pdp/${paired.id}' : '/product/${paired.id}',
      ),
      style: OutlinedButton.styleFrom(
        minimumSize: const Size(96, 40),
        padding: const EdgeInsets.symmetric(horizontal: 10),
        side: BorderSide(color: colors.borderDefault),
      ),
      child: const Text('Choose', style: TextStyle(fontSize: 12)),
    );
  }

  Widget _disabledAction(AgencyColors colors) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: colors.surfaceInteractive,
        borderRadius: BorderRadius.circular(AgencyRadius.sm),
      ),
      child: Text(
        'Out of stock',
        style: TextStyle(fontSize: 11, color: colors.contentSecondary),
      ),
    );
  }
}
