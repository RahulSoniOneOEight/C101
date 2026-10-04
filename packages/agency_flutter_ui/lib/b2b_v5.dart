part of 'agency_flutter_ui.dart';

/// B2B Home **V5** trade widgets (BuildKart).
///
/// Flutter bindings of the Penpot V5 components:
/// `CartPlusIconButton`, `QuantityStepper`, `FilterChip`,
/// `ProcurementListFilterBar`, `CompactQuickOrderSKUCard`, `TradeProductCard Compact`.
///
/// Presentation-only: primitives + callbacks, so the app layer binds models.
/// All colours/spacing/radius resolve through the shared design system.

/// Shared grid extent for the compact trade product tile so B2B Home, the
/// Catalogue and Trade Offers & Deals render the **same** card height. Sized to
/// the card's actual content (badge + image + brand/title + tiers + price +
/// stepper/Cart-Plus/RFQ-Plus row) so no blank space appears beneath the last
/// action.
const double kB2bProductCardExtent = 334;

// ---------------------------------------------------------------------------
// B2B / CartPlusIconButton  (5 states)
// ---------------------------------------------------------------------------
/// State axis for [CartPlusIconButton], mirroring the Penpot
/// `CartPlusIconButton State=` variants.
enum CartPlusState { normal, loading, added, unavailable, error }

/// Compact circular cart-plus action. Minimum 44px hit target.
class CartPlusIconButton extends StatelessWidget {
  const CartPlusIconButton({
    this.state = CartPlusState.normal,
    this.onPressed,
    this.size = 44,
    this.semanticLabel = 'Add to order',
    super.key,
  });

  final CartPlusState state;
  final VoidCallback? onPressed;
  final double size;
  final String semanticLabel;

  bool get _enabled =>
      state == CartPlusState.normal || state == CartPlusState.added;

  @override
  Widget build(BuildContext context) {
    final colors = _colors(context);
    final background = switch (state) {
      CartPlusState.normal => colors.actionPrimary,
      CartPlusState.loading => colors.actionPrimary,
      CartPlusState.unavailable => colors.actionPrimary,
      CartPlusState.added => colors.feedbackSuccess,
      CartPlusState.error => colors.feedbackError,
    };
    final Widget icon = switch (state) {
      CartPlusState.loading => SizedBox(
          width: size * 0.45,
          height: size * 0.45,
          child: CircularProgressIndicator(
            strokeWidth: 2,
            valueColor: AlwaysStoppedAnimation<Color>(colors.contentInverse),
          ),
        ),
      CartPlusState.added =>
        Icon(Icons.check, size: size * 0.45, color: colors.contentInverse),
      CartPlusState.error => Icon(Icons.error_outline,
          size: size * 0.45, color: colors.contentInverse),
      CartPlusState.normal || CartPlusState.unavailable => Icon(
          Icons.add_shopping_cart,
          size: size * 0.45,
          color: colors.contentInverse),
    };

    return Semantics(
      button: _enabled,
      enabled: _enabled,
      label: semanticLabel,
      child: Opacity(
        opacity: state == CartPlusState.unavailable ? 0.6 : 1,
        child: Material(
          color: background,
          shape: const CircleBorder(),
          child: InkWell(
            customBorder: const CircleBorder(),
            onTap: _enabled ? onPressed : null,
            child: SizedBox(
              width: size,
              height: size,
              child: Center(child: icon),
            ),
          ),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// B2B / RFQPlusIconButton  (5 states)
// ---------------------------------------------------------------------------
/// State axis for [RFQPlusIconButton], mirroring the Penpot
/// `RFQPlusIconButton State=` variants.
enum RFQPlusState { normal, loading, added, unavailable, error }

/// Compact circular document-plus action that adds the current SKU/variant and
/// quantity to the shared RFQ basket. Used beside [CartPlusIconButton] in trade
/// product tiles and PDPs so purchasing states stay independent.
class RFQPlusIconButton extends StatelessWidget {
  const RFQPlusIconButton({
    this.state = RFQPlusState.normal,
    this.onPressed,
    this.size = 44,
    this.semanticLabel = 'Add to RFQ',
    super.key,
  });

  final RFQPlusState state;
  final VoidCallback? onPressed;
  final double size;
  final String semanticLabel;

  bool get _enabled =>
      state == RFQPlusState.normal || state == RFQPlusState.added;

  @override
  Widget build(BuildContext context) {
    final colors = _colors(context);
    final background = switch (state) {
      RFQPlusState.normal => colors.actionPrimary,
      RFQPlusState.loading => colors.actionPrimary,
      RFQPlusState.unavailable => colors.actionPrimary,
      RFQPlusState.added => colors.feedbackSuccess,
      RFQPlusState.error => colors.feedbackError,
    };
    final Widget icon = switch (state) {
      RFQPlusState.loading => SizedBox(
          width: size * 0.45,
          height: size * 0.45,
          child: CircularProgressIndicator(
            strokeWidth: 2,
            valueColor: AlwaysStoppedAnimation<Color>(colors.contentInverse),
          ),
        ),
      RFQPlusState.added =>
        Icon(Icons.check, size: size * 0.45, color: colors.contentInverse),
      RFQPlusState.error => Icon(Icons.error_outline,
          size: size * 0.45, color: colors.contentInverse),
      RFQPlusState.normal || RFQPlusState.unavailable => Icon(
          Icons.note_add_outlined,
          size: size * 0.45,
          color: colors.contentInverse),
    };

    return Semantics(
      button: _enabled,
      enabled: _enabled,
      label: semanticLabel,
      child: Opacity(
        opacity: state == RFQPlusState.unavailable ? 0.6 : 1,
        child: Material(
          color: background,
          shape: const CircleBorder(),
          child: InkWell(
            customBorder: const CircleBorder(),
            onTap: _enabled ? onPressed : null,
            child: SizedBox(
              width: size,
              height: size,
              child: Center(child: icon),
            ),
          ),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// B2B / QuantityStepper
// ---------------------------------------------------------------------------

/// Shared compact quantity stepper (`− value +`). [compact] renders the
/// card-sized variant used inside product/quick-order tiles; [dense] renders an
/// extra-tight variant for the narrowest (≤360px) two-column tiles.
class QuantityStepper extends StatelessWidget {
  const QuantityStepper({
    required this.value,
    this.min = 1,
    this.max,
    this.compact = false,
    this.dense = false,
    this.onChanged,
    super.key,
  });

  final int value;
  final int min;
  final int? max;
  final bool compact;
  final bool dense;
  final ValueChanged<int>? onChanged;

  @override
  Widget build(BuildContext context) {
    final colors = _colors(context);
    final height = dense ? 28.0 : (compact ? 30.0 : 36.0);
    final button = dense ? 24.0 : (compact ? 26.0 : 32.0);
    final icon = dense ? 12.0 : (compact ? 15.0 : 18.0);
    final canDec = value > min && onChanged != null;
    final canInc = (max == null || value < max!) && onChanged != null;

    Widget step(IconData data, bool enabled, VoidCallback onTap) => InkWell(
          customBorder: const CircleBorder(),
          onTap: enabled ? onTap : null,
          child: SizedBox(
            width: button,
            height: height,
            child: Icon(
              data,
              size: icon,
              color: enabled ? colors.contentPrimary : colors.contentSecondary,
            ),
          ),
        );

    return Semantics(
      label: 'Quantity $value',
      child: Container(
        height: height,
        decoration: BoxDecoration(
          color: colors.surfaceRaised,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: colors.borderDefault),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            step(Icons.remove, canDec, () => onChanged!(value - 1)),
            SizedBox(
              width: dense ? 16 : (compact ? 18 : 28),
              child: Text(
                '$value',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: dense ? 10 : (compact ? 12 : 14),
                  fontWeight: FontWeight.w600,
                  color: colors.contentPrimary,
                ),
              ),
            ),
            step(Icons.add, canInc, () => onChanged!(value + 1)),
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// B2B / FilterChip + ProcurementListFilterBar
// ---------------------------------------------------------------------------

/// Multi-select procurement filter chip. Shows a leading check when selected.
class TradeFilterChip extends StatelessWidget {
  const TradeFilterChip({
    required this.label,
    this.selected = false,
    this.onTap,
    super.key,
  });

  final String label;
  final bool selected;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = _colors(context);
    final fg = selected ? colors.contentInverse : colors.contentPrimary;
    return Semantics(
      button: onTap != null,
      selected: selected,
      label: label,
      child: InkWell(
        borderRadius: BorderRadius.circular(999),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          decoration: BoxDecoration(
            color: selected ? colors.actionPrimary : colors.surfaceInteractive,
            borderRadius: BorderRadius.circular(999),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              if (selected) ...<Widget>[
                Icon(Icons.check, size: 14, color: fg),
                const SizedBox(width: 4),
              ],
              Text(
                label,
                style: TextStyle(
                    fontSize: 14, fontWeight: FontWeight.w500, color: fg),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Horizontal, scrollable row of multi-select [TradeFilterChip]s.
class ProcurementListFilterBar extends StatelessWidget {
  const ProcurementListFilterBar({
    required this.filters,
    this.selected = const <String>{},
    this.onToggle,
    super.key,
  });

  final List<String> filters;
  final Set<String> selected;
  final ValueChanged<String>? onToggle;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 37,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: filters.length,
        separatorBuilder: (_, __) => const SizedBox(width: AgencySpacing.sm),
        itemBuilder: (context, index) {
          final filter = filters[index];
          return TradeFilterChip(
            label: filter,
            selected: selected.contains(filter),
            onTap: onToggle == null ? null : () => onToggle!(filter),
          );
        },
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// B2B / CompactQuickOrderSKUCard
// ---------------------------------------------------------------------------

/// Product-led quick-order card: thumbnail, name, SKU, price, quantity
/// stepper and a cart-plus action. Used in the 2-up quick-order grid.
class CompactQuickOrderSkuCard extends StatelessWidget {
  const CompactQuickOrderSkuCard({
    required this.title,
    required this.sku,
    required this.priceLabel,
    this.imageUrl,
    this.quantity = 1,
    this.minQuantity = 1,
    this.onQuantityChanged,
    this.onAdd,
    this.onTap,
    super.key,
  });

  final String title;
  final String sku;
  final String priceLabel;
  final String? imageUrl;
  final int quantity;
  final int minQuantity;
  final ValueChanged<int>? onQuantityChanged;
  final VoidCallback? onAdd;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = _colors(context);
    return Container(
      padding: const EdgeInsets.all(AgencySpacing.sm),
      decoration: BoxDecoration(
        color: colors.surfaceRaised,
        borderRadius: BorderRadius.circular(AgencyRadius.lg),
        border: Border.all(color: colors.borderDefault),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          InkWell(
            onTap: onTap,
            borderRadius: BorderRadius.circular(AgencyRadius.sm),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                _Thumb(imageUrl: imageUrl, size: 48),
                const SizedBox(width: AgencySpacing.sm),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Text(
                        title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: colors.contentPrimary,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        sku,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                            fontSize: 11, color: colors.contentSecondary),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        priceLabel,
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: colors.actionPrimary,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: AgencySpacing.sm),
          Row(
            children: <Widget>[
              QuantityStepper(
                value: quantity,
                min: minQuantity,
                compact: true,
                onChanged: onQuantityChanged,
              ),
              const Spacer(),
              CartPlusIconButton(onPressed: onAdd),
            ],
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// B2B / TradeProductCard Compact (V5)
// ---------------------------------------------------------------------------

/// Image-led compact trade product tile for the Home grid: dominant media (+
/// stock/savings pill), compact brand/MOQ and 2-line title, qty-only tier chips,
/// dealer price, and a
/// quantity-stepper + cart-plus action row. No fulfilment text, no repeated
/// per-tier unit prices, no large Add button (all removed in V5).
class TradeProductCardCompact extends StatelessWidget {
  const TradeProductCardCompact({
    required this.title,
    required this.unitPriceLabel,
    this.brand,
    this.moqLabel,
    this.mrpLabel,
    this.imageUrl,
    this.stockLabel,
    this.savingsLabel,
    this.tiers = const <TradeTierOption>[],
    this.selectedTierIndex = 0,
    this.onTierSelected,
    this.quantity = 1,
    this.onQuantityChanged,
    this.onAdd,
    this.onTap,
    this.state = CommerceFixture.defaultState,
    super.key,
  });

  final String title;
  final String unitPriceLabel;
  final String? brand;
  final String? moqLabel;
  final String? mrpLabel;
  final String? imageUrl;
  final String? stockLabel;
  final String? savingsLabel;
  final List<TradeTierOption> tiers;
  final int selectedTierIndex;
  final ValueChanged<int>? onTierSelected;
  final int quantity;
  final ValueChanged<int>? onQuantityChanged;
  final VoidCallback? onAdd;

  final VoidCallback? onTap;
  final CommerceFixture state;

  @override
  Widget build(BuildContext context) {
    final colors = _colors(context);
    final outOfStock = state == CommerceFixture.outOfStock;
    return Container(
      padding: const EdgeInsets.all(AgencySpacing.sm),
      decoration: BoxDecoration(
        color: colors.surfaceRaised,
        borderRadius: BorderRadius.circular(AgencyRadius.lg),
        border: Border.all(color: colors.borderDefault),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          InkWell(
            onTap: onTap,
            borderRadius: BorderRadius.circular(AgencyRadius.sm),
            child: Stack(
              children: <Widget>[
                _Thumb(imageUrl: imageUrl, size: null, height: 168),
                Positioned(
                  top: AgencySpacing.sm,
                  left: AgencySpacing.sm,
                  right: AgencySpacing.sm,
                  child: Row(
                    children: <Widget>[
                      // V5: a single trust badge only — the discount. Stock is
                      // shown via the out-of-stock state, not a second pill.
                      if (outOfStock)
                        _Pill(
                          label: 'Out of stock',
                          background: colors.feedbackError,
                          foreground: colors.contentInverse,
                        )
                      else if (savingsLabel != null)
                        _Pill(
                          label: savingsLabel!,
                          background: colors.promotion,
                          foreground: colors.promotionInverse,
                        ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: AgencySpacing.xs),
          Row(
            children: <Widget>[
              Expanded(
                child: Text(
                  brand ?? '',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style:
                      TextStyle(fontSize: 10, color: colors.contentSecondary),
                ),
              ),
              if (moqLabel != null)
                Text(moqLabel!,
                    style: TextStyle(
                        fontSize: 10, color: colors.contentSecondary)),
            ],
          ),
          InkWell(
            onTap: onTap,
            child: SizedBox(
              height: 28,
              child: Text(
                title,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 12,
                  height: 1.15,
                  fontWeight: FontWeight.w600,
                  color: colors.contentPrimary,
                ),
              ),
            ),
          ),
          if (tiers.isNotEmpty) ...<Widget>[
            const SizedBox(height: AgencySpacing.xs),
            Row(
              children: <Widget>[
                for (var i = 0; i < tiers.length; i++) ...<Widget>[
                  if (i > 0) const SizedBox(width: AgencySpacing.xs),
                  Expanded(
                    child: InkWell(
                      onTap: (outOfStock || onTierSelected == null)
                          ? null
                          : () => onTierSelected!(i),
                      borderRadius: BorderRadius.circular(AgencyRadius.sm),
                      child: Container(
                        padding: const EdgeInsets.symmetric(vertical: 3),
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: i == selectedTierIndex
                              ? colors.actionPrimary
                              : colors.surfaceInteractive,
                          borderRadius: BorderRadius.circular(AgencyRadius.sm),
                        ),
                        child: Text(
                          '${tiers[i].quantity}',
                          style: TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.w500,
                            color: i == selectedTierIndex
                                ? colors.contentInverse
                                : colors.contentPrimary,
                          ),
                        ),
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ],
          const SizedBox(height: AgencySpacing.xs),
          Row(
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: <Widget>[
              Flexible(
                flex: 2,
                child: Text(
                  unitPriceLabel,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    color: colors.actionPrimary,
                  ),
                ),
              ),
              if (mrpLabel != null) ...<Widget>[
                const SizedBox(width: AgencySpacing.xs),
                Flexible(
                  flex: 1,
                  child: Text(
                    mrpLabel!,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 10,
                      color: colors.contentSecondary,
                      decoration: TextDecoration.lineThrough,
                    ),
                  ),
                ),
              ],
            ],
          ),
          const SizedBox(height: AgencySpacing.xs),
          SizedBox(
            key: const Key('tradeCardActions'),
            height: 40,
            child: Row(
              children: <Widget>[
                QuantityStepper(
                  value: quantity,
                  compact: true,
                  onChanged: onQuantityChanged,
                ),
                const Spacer(),
                CartPlusIconButton(
                  size: 40,
                  state: outOfStock
                      ? CartPlusState.unavailable
                      : CartPlusState.normal,
                  onPressed: outOfStock ? null : onAdd,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// B2B / Merchandising unit card
// ---------------------------------------------------------------------------

/// A distinct merchandising **unit**: a shaded card that groups a titled
/// section (Buy Again, Trade Offers & Deals, Categories + Products) so each
/// unit reads as one identifiable module rather than free-floating content.
class MerchandisingUnitCard extends StatelessWidget {
  const MerchandisingUnitCard({
    required this.child,
    this.title,
    this.tag,
    this.seeAllLabel = 'See All',
    this.onSeeAll,
    super.key,
  });

  final Widget child;
  final String? title;
  final String? tag;
  final String seeAllLabel;
  final VoidCallback? onSeeAll;

  @override
  Widget build(BuildContext context) {
    final colors = _colors(context);
    return Container(
      margin: const EdgeInsets.symmetric(
          horizontal: AgencySpacing.md, vertical: AgencySpacing.sm),
      padding: const EdgeInsets.all(AgencySpacing.md),
      decoration: BoxDecoration(
        color: colors.surfaceInteractive,
        borderRadius: BorderRadius.circular(AgencyRadius.lg),
        border: Border.all(color: colors.borderDefault),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          if (title != null) ...<Widget>[
            SectionHeader(
              title: title!,
              tag: tag,
              seeAllLabel: seeAllLabel,
              onSeeAll: onSeeAll,
            ),
            const SizedBox(height: AgencySpacing.xs),
          ],
          child,
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Shared small parts
// ---------------------------------------------------------------------------

class _Thumb extends StatelessWidget {
  const _Thumb({this.imageUrl, this.size, this.height});

  final String? imageUrl;
  final double? size;
  final double? height;

  @override
  Widget build(BuildContext context) {
    final colors = _colors(context);
    return Container(
      width: size,
      height: height ?? size,
      decoration: BoxDecoration(
        color: colors.surfacePage,
        borderRadius: BorderRadius.circular(AgencyRadius.sm),
      ),
      clipBehavior: Clip.antiAlias,
      child: imageUrl == null
          ? Icon(Icons.image_outlined, size: 20, color: colors.contentSecondary)
          : Padding(
              padding: const EdgeInsets.all(4),
              child: Image.network(
                imageUrl!,
                fit: BoxFit.contain,
                loadingBuilder: (context, child, progress) => progress == null
                    ? child
                    : Center(
                        child: SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            valueColor: AlwaysStoppedAnimation<Color>(
                                colors.contentSecondary),
                          ),
                        ),
                      ),
                errorBuilder: (_, __, ___) => Icon(Icons.image_outlined,
                    size: 20, color: colors.contentSecondary),
              ),
            ),
    );
  }
}

class _Pill extends StatelessWidget {
  const _Pill({
    required this.label,
    required this.background,
    required this.foreground,
  });

  final String label;
  final Color background;
  final Color foreground;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: TextStyle(
            fontSize: 10, fontWeight: FontWeight.w500, color: foreground),
      ),
    );
  }
}
