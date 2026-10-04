part of 'agency_flutter_ui.dart';

/// B2B Trade experience widgets (BuildKart B2B).
///
/// Flutter bindings of the Penpot `B2B / …` component family. Presentation-only:
/// they take primitive values + callbacks so the app layer binds real
/// models/providers and keeps pricing/cart/RFQ logic out of the widgets.
///
/// All colours/spacing/radius resolve through the shared design system
/// ([AgencyColors], [AgencySpacing], [AgencyRadius], [AgencyText]).

// ---------------------------------------------------------------------------
// Value types
// ---------------------------------------------------------------------------

/// Badge style for a [TradeSchemeCard] (maps to Penpot scheme variants).
enum TradeSchemeBadge { freeGoods, cashOffer, creditScheme }

/// Merchandising tag overlaid on a [TradeProductCard] media area, matching the
/// consumer home's "Bestseller"/"Premium" tags.
enum TradeTag { bestseller, premium }

/// A trade category shown in [TradeCategoryRail].
class TradeCategoryItem {
  const TradeCategoryItem({
    required this.id,
    required this.label,
    required this.icon,
  });

  final String id;
  final String label;
  final IconData icon;
}

/// A quantity-tier option: quantity + the per-unit trade price label.
class TradeTierOption {
  const TradeTierOption({required this.quantity, required this.priceLabel});

  final int quantity;
  final String priceLabel;
}

/// An item in [AppBottomNavigation].
class BottomNavItem {
  const BottomNavItem({required this.label, required this.icon});

  final String label;
  final IconData icon;
}

AgencyColors _colors(BuildContext context) =>
    Theme.of(context).extension<AgencyColors>() ?? AgencyColors.light;

// ---------------------------------------------------------------------------
// Small sub-widgets (StockBadge / SavingsBadge / TradePriceBlock / meta)
// ---------------------------------------------------------------------------

/// Stock status badge (top-left of a [TradeProductCard]).
///
/// Rendered as a pill with a colour background (trust/teal when in stock,
/// error/red when out of stock), matching the consumer home's badge style.
class StockBadge extends StatelessWidget {
  const StockBadge({required this.label, this.inStock = true, super.key});

  final String label;
  final bool inStock;

  @override
  Widget build(BuildContext context) {
    final colors = _colors(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: inStock ? colors.trust : colors.feedbackError,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: TextStyle(
            fontSize: 11,
            color: colors.contentInverse,
            fontWeight: FontWeight.w500),
      ),
    );
  }
}

/// Savings badge (top-right of a [TradeProductCard]).
///
/// Rendered as a promotion pill (orange background + inverse text), matching
/// the consumer home's discount badges.
class SavingsBadge extends StatelessWidget {
  const SavingsBadge({required this.label, super.key});

  final String label;

  @override
  Widget build(BuildContext context) {
    final colors = _colors(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: colors.promotion,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: TextStyle(
            fontSize: 11,
            color: colors.promotionInverse,
            fontWeight: FontWeight.w500),
      ),
    );
  }
}

/// Trade price block: selected per-unit price + MRP (struck) + total value.
class TradePriceBlock extends StatelessWidget {
  const TradePriceBlock({
    required this.unitPriceLabel,
    required this.mrpLabel,
    required this.totalLabel,
    this.compact = false,
    super.key,
  });

  final String unitPriceLabel;
  final String mrpLabel;
  final String totalLabel;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final colors = _colors(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Row(
          crossAxisAlignment: CrossAxisAlignment.baseline,
          textBaseline: TextBaseline.alphabetic,
          children: <Widget>[
            Flexible(
              child: Text(
                unitPriceLabel,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: compact ? 15 : 20,
                  color: colors.actionPrimary,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
            const SizedBox(width: AgencySpacing.sm),
            Flexible(
              child: Text(
                mrpLabel,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: compact ? 10 : 12,
                  color: colors.contentSecondary,
                  decoration: TextDecoration.lineThrough,
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 2),
        Text(totalLabel,
            style: TextStyle(
                fontSize: compact ? 10 : 11, color: colors.contentPrimary)),
      ],
    );
  }
}

/// Compact fulfilment + scheme metadata line.
class TradeFulfilmentMeta extends StatelessWidget {
  const TradeFulfilmentMeta(
      {required this.text, this.compact = false, super.key});

  final String text;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final colors = _colors(context);
    return Text(
      text,
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
      style:
          TextStyle(fontSize: compact ? 9 : 10, color: colors.contentSecondary),
    );
  }
}

// ---------------------------------------------------------------------------
// B2B / Header
// ---------------------------------------------------------------------------

class B2BHeader extends StatelessWidget {
  const B2BHeader({
    this.brandLabel = 'BK',
    this.tradeLabel = 'B2B',
    this.onSearchTap,
    this.onNotificationsTap,
    this.notificationCount = 0,
    this.onCartTap,
    this.onAccountTap,
    super.key,
  });

  final String brandLabel;
  final String tradeLabel;
  final VoidCallback? onSearchTap;

  /// Opens the notification centre; when null the bell is hidden.
  final VoidCallback? onNotificationsTap;
  final int notificationCount;
  final VoidCallback? onCartTap;
  final VoidCallback? onAccountTap;

  @override
  Widget build(BuildContext context) {
    final colors = _colors(context);
    return Surface(
      child: SizedBox(
        height: 56,
        child: Row(
          children: <Widget>[
            Container(
              width: 28,
              height: 28,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: colors.actionPrimary,
                borderRadius: BorderRadius.circular(AgencyRadius.sm),
              ),
              child: Text(brandLabel,
                  style: const TextStyle(
                      color: Colors.white,
                      fontSize: 11,
                      fontWeight: FontWeight.w600)),
            ),
            const SizedBox(width: AgencySpacing.sm),
            Text(tradeLabel,
                style: AgencyText.label.copyWith(
                    color: colors.contentPrimary, fontWeight: FontWeight.w600)),
            const Spacer(),
            if (onSearchTap != null)
              IconButton(
                onPressed: onSearchTap,
                tooltip: 'Search',
                icon: const Icon(Icons.search),
              ),
            if (onNotificationsTap != null)
              IconButton(
                onPressed: onNotificationsTap,
                tooltip: 'Notifications',
                icon: Badge(
                  isLabelVisible: notificationCount > 0,
                  label: Text('$notificationCount'),
                  child: const Icon(Icons.notifications_none),
                ),
              ),
            IconButton(
              onPressed: onCartTap,
              tooltip: 'Cart',
              icon: const Icon(Icons.shopping_cart_outlined),
            ),
            IconButton(
              onPressed: onAccountTap,
              tooltip: 'Account',
              icon: const Icon(Icons.person_outline),
            ),
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// B2B / Category Rail
// ---------------------------------------------------------------------------

class TradeCategoryRail extends StatelessWidget {
  const TradeCategoryRail({
    required this.categories,
    this.selectedId,
    this.onSelected,
    super.key,
  });

  final List<TradeCategoryItem> categories;
  final String? selectedId;
  final ValueChanged<TradeCategoryItem>? onSelected;

  @override
  Widget build(BuildContext context) {
    final colors = _colors(context);
    return SizedBox(
      height: 100,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: AgencySpacing.md),
        itemCount: categories.length,
        separatorBuilder: (_, __) => const SizedBox(width: AgencySpacing.sm),
        itemBuilder: (context, index) {
          final item = categories[index];
          final selected = item.id == selectedId;
          return InkWell(
            onTap: onSelected == null ? null : () => onSelected!(item),
            borderRadius: BorderRadius.circular(AgencyRadius.md),
            child: Container(
              width: 108,
              padding: const EdgeInsets.all(AgencySpacing.sm),
              decoration: BoxDecoration(
                color:
                    selected ? colors.surfaceInteractive : colors.surfaceRaised,
                borderRadius: BorderRadius.circular(AgencyRadius.md),
                border: Border.all(
                    color:
                        selected ? colors.actionPrimary : colors.borderDefault),
              ),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: <Widget>[
                  Icon(item.icon, color: colors.actionPrimary, size: 24),
                  const SizedBox(height: AgencySpacing.xs),
                  Text(item.label,
                      textAlign: TextAlign.center,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style:
                          TextStyle(fontSize: 9, color: colors.contentPrimary)),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// B2B / Account Summary
// ---------------------------------------------------------------------------

/// Trade account summary: business name, dealer/GST/discount badges, a credit
/// meter, and a view action. Not a consumer profile card.
class TradeAccountSummary extends StatelessWidget {
  const TradeAccountSummary({
    required this.businessName,
    required this.gstinLabel,
    required this.tradeDiscountLabel,
    required this.creditAvailableLabel,
    this.dealerBadge = 'Dealer',
    this.gstBadge = 'GST ✓',
    this.creditUsedFraction = 0.6,
    this.onView,
    super.key,
  });

  final String businessName;
  final String gstinLabel;
  final String tradeDiscountLabel;
  final String creditAvailableLabel;
  final String dealerBadge;
  final String gstBadge;
  final double creditUsedFraction;
  final VoidCallback? onView;

  @override
  Widget build(BuildContext context) {
    final colors = _colors(context);
    return Padding(
      padding: const EdgeInsets.symmetric(
          horizontal: AgencySpacing.md, vertical: AgencySpacing.sm),
      child: Surface(
        child: Padding(
          padding: const EdgeInsets.all(AgencySpacing.md),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Text(businessName,
                  style: TextStyle(
                      fontSize: 14,
                      color: colors.contentPrimary,
                      fontWeight: FontWeight.w600)),
              const SizedBox(height: AgencySpacing.sm),
              Wrap(
                spacing: AgencySpacing.xs,
                runSpacing: AgencySpacing.xs,
                children: <Widget>[
                  _chip(context, dealerBadge, colors.actionPrimary,
                      colors.surfaceInteractive),
                  _chip(
                      context, gstBadge, colors.trust, const Color(0xFFE4F1E9)),
                  _chip(context, tradeDiscountLabel, colors.feedbackInfo,
                      const Color(0xFFD7E3F7)),
                ],
              ),
              const SizedBox(height: AgencySpacing.sm),
              Row(
                children: <Widget>[
                  Text('Credit',
                      style: TextStyle(
                          fontSize: 10, color: colors.contentSecondary)),
                  const SizedBox(width: AgencySpacing.sm),
                  Expanded(
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(AgencyRadius.sm),
                      child: LinearProgressIndicator(
                        value: creditUsedFraction.clamp(0.0, 1.0),
                        minHeight: 8,
                        backgroundColor: colors.surfaceInteractive,
                        valueColor:
                            AlwaysStoppedAnimation<Color>(colors.actionPrimary),
                      ),
                    ),
                  ),
                  const SizedBox(width: AgencySpacing.sm),
                  Text(creditAvailableLabel,
                      style: TextStyle(
                          fontSize: 11,
                          color: colors.contentPrimary,
                          fontWeight: FontWeight.w600)),
                ],
              ),
              if (onView != null)
                Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton(
                    onPressed: onView,
                    child: const Text('View →'),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _chip(BuildContext context, String label, Color fg, Color bg) {
    return Container(
      padding:
          const EdgeInsets.symmetric(horizontal: AgencySpacing.sm, vertical: 2),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(AgencyRadius.lg),
      ),
      child: Text(label, style: TextStyle(fontSize: 9, color: fg)),
    );
  }
}

// ---------------------------------------------------------------------------
// B2B / Quick Order
// ---------------------------------------------------------------------------

class QuickOrderRow extends StatelessWidget {
  const QuickOrderRow({required this.line, this.onQuantityChanged, super.key});

  final QuickOrderLine line;
  final void Function(String sku, int quantity)? onQuantityChanged;

  @override
  Widget build(BuildContext context) {
    final colors = _colors(context);
    return Row(
      children: <Widget>[
        Expanded(
          child: Container(
            height: 40,
            alignment: Alignment.centerLeft,
            padding: const EdgeInsets.symmetric(horizontal: AgencySpacing.sm),
            decoration: BoxDecoration(
              color: colors.surfacePage,
              borderRadius: BorderRadius.circular(AgencyRadius.sm),
              border: Border.all(color: colors.borderDefault),
            ),
            child: Text(line.sku.isEmpty ? line.name : line.sku,
                style: TextStyle(fontSize: 11, color: colors.contentSecondary)),
          ),
        ),
        const SizedBox(width: AgencySpacing.sm),
        SizedBox(
          width: 116,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: <Widget>[
              IconButton(
                iconSize: 18,
                padding: EdgeInsets.zero,
                constraints: const BoxConstraints(minWidth: 28, minHeight: 28),
                onPressed: onQuantityChanged == null
                    ? null
                    : () => onQuantityChanged!(
                        line.sku, line.quantity > 0 ? line.quantity - 1 : 0),
                icon: const AgencyIcon(AgencyIconConcept.decrement, size: 18),
              ),
              Text('${line.quantity}',
                  style: TextStyle(color: colors.contentPrimary)),
              IconButton(
                iconSize: 18,
                padding: EdgeInsets.zero,
                constraints: const BoxConstraints(minWidth: 28, minHeight: 28),
                onPressed: onQuantityChanged == null
                    ? null
                    : () => onQuantityChanged!(line.sku, line.quantity + 1),
                icon: const AgencyIcon(AgencyIconConcept.increment, size: 18),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

/// A single product hit surfaced in the Quick Order search results.
class QuickSearchResult {
  const QuickSearchResult({
    required this.sku,
    required this.name,
    required this.priceLabel,
  });

  final String sku;
  final String name;
  final String priceLabel;
}

class QuickOrderPanel extends StatelessWidget {
  const QuickOrderPanel({
    required this.rows,
    this.searchController,
    this.onSearchChanged,
    this.searchResults = const <QuickSearchResult>[],
    this.onAddSearchResult,
    this.onSavedList,
    this.onUploadList,
    this.onAddRow,
    this.onAddToOrder,
    this.onQuantityChanged,
    this.quotesCount = 0,
    this.onViewQuotes,
    super.key,
  });

  final List<QuickOrderLine> rows;
  final TextEditingController? searchController;
  final ValueChanged<String>? onSearchChanged;
  final List<QuickSearchResult> searchResults;
  final void Function(QuickSearchResult result)? onAddSearchResult;
  final VoidCallback? onSavedList;
  final VoidCallback? onUploadList;
  final VoidCallback? onAddRow;
  final VoidCallback? onAddToOrder;
  final void Function(String sku, int quantity)? onQuantityChanged;
  final int quotesCount;
  final VoidCallback? onViewQuotes;

  @override
  Widget build(BuildContext context) {
    final colors = _colors(context);
    return Padding(
      padding: const EdgeInsets.symmetric(
          horizontal: AgencySpacing.md, vertical: AgencySpacing.sm),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            children: <Widget>[
              Expanded(
                child: Text('Quick order',
                    style: AgencyText.label.copyWith(
                        color: colors.contentPrimary,
                        fontWeight: FontWeight.w600)),
              ),
              if (onViewQuotes != null)
                InkWell(
                  onTap: onViewQuotes,
                  borderRadius: BorderRadius.circular(8),
                  child: Padding(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: <Widget>[
                        Icon(Icons.description_outlined,
                            size: 16, color: colors.actionPrimary),
                        const SizedBox(width: 4),
                        Text('$quotesCount',
                            style: TextStyle(
                                fontSize: 11,
                                color: colors.actionPrimary,
                                fontWeight: FontWeight.w600)),
                      ],
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: AgencySpacing.sm),
          TextField(
            controller: searchController,
            onChanged: onSearchChanged,
            decoration: InputDecoration(
              hintText: 'Search products / SKU',
              prefixIcon: const Icon(Icons.search, size: 18),
              isDense: true,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(AgencyRadius.sm),
              ),
            ),
          ),
          const SizedBox(height: AgencySpacing.sm),
          Row(
            children: <Widget>[
              Expanded(
                child: _actionChip(
                    context, Icons.bookmark_outline, 'Saved List', onSavedList),
              ),
              const SizedBox(width: AgencySpacing.sm),
              Expanded(
                child: _actionChip(
                    context, Icons.upload_file, 'Upload List', onUploadList),
              ),
            ],
          ),
          if (searchResults.isNotEmpty) ...<Widget>[
            const SizedBox(height: AgencySpacing.sm),
            for (final result in searchResults)
              _searchResultRow(context, result),
          ] else ...<Widget>[
            const SizedBox(height: AgencySpacing.sm),
            for (final line in rows) ...<Widget>[
              QuickOrderRow(line: line, onQuantityChanged: onQuantityChanged),
              const SizedBox(height: AgencySpacing.sm),
            ],
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                onPressed: onAddRow,
                icon: const Icon(Icons.add, size: 16),
                label: const Text('Add row'),
              ),
            ),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: onAddToOrder,
                style: FilledButton.styleFrom(
                  backgroundColor: colors.actionPrimary,
                  minimumSize: const Size.fromHeight(40),
                ),
                child: const Text('Add to Order'),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _searchResultRow(BuildContext context, QuickSearchResult result) {
    final colors = _colors(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: AgencySpacing.xs),
      child: Row(
        children: <Widget>[
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(result.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style:
                        TextStyle(fontSize: 12, color: colors.contentPrimary)),
                Text(result.sku,
                    style: TextStyle(
                        fontSize: 10, color: colors.contentSecondary)),
              ],
            ),
          ),
          Text(result.priceLabel,
              style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: colors.contentPrimary)),
          IconButton(
            icon: Icon(Icons.add_circle_outline,
                color: colors.actionPrimary, size: 22),
            tooltip: 'Add ${result.name}',
            onPressed: onAddSearchResult == null
                ? null
                : () => onAddSearchResult!(result),
          ),
        ],
      ),
    );
  }

  Widget _actionChip(
      BuildContext context, IconData icon, String label, VoidCallback? onTap) {
    final colors = _colors(context);
    return OutlinedButton.icon(
      onPressed: onTap,
      icon: Icon(icon, size: 16, color: colors.actionPrimary),
      label: Text(label, style: TextStyle(color: colors.actionPrimary)),
      style: OutlinedButton.styleFrom(
        minimumSize: const Size.fromHeight(34),
        side: BorderSide(color: colors.borderDefault),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// B2B / Procurement List Card
// ---------------------------------------------------------------------------

/// A compact card for a saved / suggested procurement list in the Quick Order
/// Center. Presentation-only: the app layer binds a [ProcurementList] and maps
/// its source type to [sourceLabel] + [accent] (list names are never hardcoded
/// here).
class ProcurementListCard extends StatelessWidget {
  const ProcurementListCard({
    required this.title,
    required this.itemCountLabel,
    required this.icon,
    required this.sourceLabel,
    required this.accent,
    this.actionLabel = 'View / Add →',
    this.onTap,
    super.key,
  });

  final String title;
  final String itemCountLabel;
  final IconData icon;
  final String sourceLabel;
  final Color accent;
  final String actionLabel;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = _colors(context);
    return Card(
      margin: EdgeInsets.zero,
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(AgencySpacing.md),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Row(
                children: <Widget>[
                  Container(
                    width: 24,
                    height: 24,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: accent,
                      shape: BoxShape.circle,
                    ),
                    child: Icon(icon, size: 14, color: colors.contentInverse),
                  ),
                  const Spacer(),
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: accent.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(
                      sourceLabel,
                      style: TextStyle(
                        fontSize: 9,
                        fontWeight: FontWeight.w600,
                        color: accent,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: AgencySpacing.xs),
              Text(
                title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 13,
                  height: 1.3,
                  fontWeight: FontWeight.w600,
                  color: colors.contentPrimary,
                ),
              ),
              Text(
                itemCountLabel,
                style: TextStyle(
                  fontSize: 11,
                  height: 1.2,
                  color: colors.contentSecondary,
                ),
              ),
              const Spacer(),
              Text(
                actionLabel,
                style: TextStyle(
                  fontSize: 11,
                  height: 1.2,
                  fontWeight: FontWeight.w600,
                  color: colors.actionPrimary,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// B2B / Repeat Order Card
// ---------------------------------------------------------------------------

class RepeatOrderCard extends StatelessWidget {
  const RepeatOrderCard({
    required this.orderRef,
    required this.dateLabel,
    required this.itemSummary,
    required this.valueLabel,
    this.onReorder,
    super.key,
  });

  final String orderRef;
  final String dateLabel;
  final String itemSummary;
  final String valueLabel;
  final VoidCallback? onReorder;

  @override
  Widget build(BuildContext context) {
    final colors = _colors(context);
    return Padding(
      padding: const EdgeInsets.symmetric(
          horizontal: AgencySpacing.md, vertical: AgencySpacing.xs),
      child: Surface(
        child: Padding(
          padding: const EdgeInsets.all(AgencySpacing.md),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Row(
                children: <Widget>[
                  Expanded(
                    child: Text(orderRef,
                        style: TextStyle(
                            fontSize: 13,
                            color: colors.contentPrimary,
                            fontWeight: FontWeight.w600)),
                  ),
                  Text(valueLabel,
                      style: TextStyle(
                          fontSize: 13,
                          color: colors.contentPrimary,
                          fontWeight: FontWeight.w600)),
                ],
              ),
              const SizedBox(height: AgencySpacing.xs),
              Text(itemSummary,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style:
                      TextStyle(fontSize: 10, color: colors.contentSecondary)),
              Align(
                alignment: Alignment.centerRight,
                child: TextButton.icon(
                  onPressed: onReorder,
                  icon: const Icon(Icons.refresh, size: 16),
                  label: const Text('Reorder → Cart'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// B2B / Scheme Card
// ---------------------------------------------------------------------------

class TradeSchemeCard extends StatelessWidget {
  const TradeSchemeCard({
    required this.title,
    required this.detail,
    required this.badge,
    super.key,
  });

  final String title;
  final String detail;
  final TradeSchemeBadge badge;

  @override
  Widget build(BuildContext context) {
    final colors = _colors(context);
    final (String badgeLabel, Color bg, Color fg) = switch (badge) {
      TradeSchemeBadge.freeGoods => (
          'Free Goods',
          colors.trust,
          colors.contentInverse
        ),
      TradeSchemeBadge.cashOffer => (
          'Cash Offer',
          colors.promotion,
          colors.promotionInverse
        ),
      TradeSchemeBadge.creditScheme => (
          'Credit Scheme',
          colors.actionPrimary,
          colors.contentInverse
        ),
    };
    return Padding(
      padding: const EdgeInsets.symmetric(
          horizontal: AgencySpacing.md, vertical: AgencySpacing.xs),
      child: Surface(
        child: Padding(
          padding: const EdgeInsets.all(AgencySpacing.md),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Row(
                children: <Widget>[
                  Expanded(
                    child: Text(title,
                        style: TextStyle(
                            fontSize: 13, color: colors.contentPrimary)),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: AgencySpacing.sm, vertical: 2),
                    decoration: BoxDecoration(
                      color: bg,
                      borderRadius: BorderRadius.circular(AgencyRadius.lg),
                    ),
                    child: Text(badgeLabel,
                        style: TextStyle(fontSize: 10, color: fg)),
                  ),
                ],
              ),
              const SizedBox(height: AgencySpacing.xs),
              Text(detail,
                  style:
                      TextStyle(fontSize: 10, color: colors.contentSecondary)),
            ],
          ),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// B2B / Quotation Row
// ---------------------------------------------------------------------------

class QuotationRow extends StatelessWidget {
  const QuotationRow({
    required this.rfqNumber,
    required this.summary,
    required this.quoteCountLabel,
    this.onView,
    super.key,
  });

  final String rfqNumber;
  final String summary;
  final String quoteCountLabel;
  final VoidCallback? onView;

  @override
  Widget build(BuildContext context) {
    final colors = _colors(context);
    return Padding(
      padding: const EdgeInsets.symmetric(
          horizontal: AgencySpacing.md, vertical: AgencySpacing.xs),
      child: Surface(
        child: Padding(
          padding: const EdgeInsets.all(AgencySpacing.md),
          child: Row(
            children: <Widget>[
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text(rfqNumber,
                        style: TextStyle(
                            fontSize: 13,
                            color: colors.contentPrimary,
                            fontWeight: FontWeight.w600)),
                    const SizedBox(height: AgencySpacing.xs),
                    Text(summary,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                            fontSize: 10, color: colors.contentSecondary)),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(
                    horizontal: AgencySpacing.sm, vertical: 2),
                decoration: BoxDecoration(
                  color: colors.surfaceInteractive,
                  borderRadius: BorderRadius.circular(AgencyRadius.lg),
                ),
                child: Text(quoteCountLabel,
                    style:
                        TextStyle(fontSize: 10, color: colors.actionPrimary)),
              ),
              TextButton(onPressed: onView, child: const Text('View')),
            ],
          ),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// B2B / Category Tile
// ---------------------------------------------------------------------------

class TradeCategoryTile extends StatelessWidget {
  const TradeCategoryTile({
    required this.label,
    required this.icon,
    this.onTap,
    super.key,
  });

  final String label;
  final IconData icon;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = _colors(context);
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AgencyRadius.lg),
      child: Container(
        padding: const EdgeInsets.all(AgencySpacing.sm),
        decoration: BoxDecoration(
          color: colors.surfacePage,
          borderRadius: BorderRadius.circular(AgencyRadius.lg),
          border: Border.all(color: colors.borderDefault),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: <Widget>[
            Icon(icon, color: colors.actionPrimary, size: 28),
            const SizedBox(height: AgencySpacing.xs),
            Text(label,
                textAlign: TextAlign.center,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 10, color: colors.contentPrimary)),
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// B2B / Trade Product Card
// ---------------------------------------------------------------------------

/// Quantity-tier selector. Selecting a tier must change the per-unit price,
/// the total order value and the Add-to-Order label (owned by the parent card).
class TradeQuantityTierSelector extends StatelessWidget {
  const TradeQuantityTierSelector({
    required this.tiers,
    required this.selectedIndex,
    this.onSelected,
    this.compact = false,
    super.key,
  });

  final List<TradeTierOption> tiers;
  final int selectedIndex;
  final ValueChanged<int>? onSelected;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final colors = _colors(context);
    return Wrap(
      spacing: compact ? AgencySpacing.xs : AgencySpacing.sm,
      runSpacing: AgencySpacing.xs,
      children: <Widget>[
        for (var i = 0; i < tiers.length; i++)
          InkWell(
            onTap: onSelected == null ? null : () => onSelected!(i),
            borderRadius: BorderRadius.circular(AgencyRadius.sm),
            child: Column(
              children: <Widget>[
                Container(
                  padding: EdgeInsets.symmetric(
                      horizontal: compact ? 6 : AgencySpacing.sm, vertical: 4),
                  decoration: BoxDecoration(
                    color: i == selectedIndex
                        ? colors.actionPrimary
                        : colors.surfaceRaised,
                    borderRadius: BorderRadius.circular(AgencyRadius.sm),
                    border: Border.all(
                        color: i == selectedIndex
                            ? colors.actionPrimary
                            : colors.borderDefault),
                  ),
                  child: Text(
                    compact
                        ? '${tiers[i].quantity}'
                        : '${tiers[i].quantity} pcs',
                    style: TextStyle(
                        fontSize: compact ? 9 : 10,
                        color: i == selectedIndex
                            ? colors.contentInverse
                            : colors.contentPrimary),
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  tiers[i].priceLabel,
                  style: TextStyle(
                    fontSize: compact ? 8 : 9,
                    color: i == selectedIndex
                        ? colors.actionPrimary
                        : colors.contentSecondary,
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

class TradeProductCard extends StatelessWidget {
  const TradeProductCard({
    required this.title,
    required this.unitPriceLabel,
    required this.mrpLabel,
    required this.tiers,
    required this.selectedTierIndex,
    required this.totalLabel,
    this.brand,
    this.imageUrl,
    this.stockLabel,
    this.savingsLabel,
    this.tag,
    this.moqLabel,
    this.fulfilmentNote,
    this.schemeNote,
    this.compact = false,
    this.state = CommerceFixture.defaultState,
    this.onTierSelected,
    this.onAdd,
    this.onRfq,
    this.onTap,
    super.key,
  });

  final String title;
  final String unitPriceLabel;
  final String mrpLabel;
  final List<TradeTierOption> tiers;
  final int selectedTierIndex;
  final String totalLabel;
  final String? brand;
  final String? imageUrl;
  final String? stockLabel;
  final String? savingsLabel;
  final TradeTag? tag;
  final String? moqLabel;
  final String? fulfilmentNote;
  final String? schemeNote;
  final bool compact;
  final CommerceFixture state;
  final ValueChanged<int>? onTierSelected;
  final VoidCallback? onAdd;
  final VoidCallback? onRfq;

  /// Opens the product detail (PDP). Tapping the media or title navigates;
  /// the Add/RFQ buttons remain independently actionable.
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = _colors(context);
    if (state == CommerceFixture.loading) {
      return const Card(
        child: Padding(
          padding: EdgeInsets.all(AgencySpacing.md),
          child: LinearProgressIndicator(),
        ),
      );
    }
    final outOfStock = state == CommerceFixture.outOfStock;
    final disabled = outOfStock || state == CommerceFixture.disabled;
    final added = state == CommerceFixture.resolved;
    final qty = tiers.isEmpty
        ? 0
        : tiers[selectedTierIndex.clamp(0, tiers.length - 1)].quantity;

    return Padding(
      padding: EdgeInsets.symmetric(
          horizontal: AgencySpacing.md, vertical: AgencySpacing.xs),
      child: Container(
        padding: EdgeInsets.all(compact ? AgencySpacing.sm : AgencySpacing.md),
        decoration: BoxDecoration(
          color: colors.surfaceRaised,
          borderRadius: BorderRadius.circular(AgencyRadius.lg),
          border: Border.all(color: colors.borderDefault),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            // Single trust badge only — the discount ("X% off"). Stock is
            // conveyed through the out-of-stock state, not a second badge.
            if (outOfStock)
              const StockBadge(label: 'Out of stock', inStock: false)
            else if (savingsLabel != null)
              SavingsBadge(label: savingsLabel!),
            const SizedBox(height: AgencySpacing.sm),
            InkWell(
              onTap: onTap,
              borderRadius: BorderRadius.circular(AgencyRadius.sm),
              child: Stack(
                children: <Widget>[
                  Container(
                    height: compact ? 84 : 120,
                    width: double.infinity,
                    decoration: BoxDecoration(
                      color: colors.surfacePage,
                      borderRadius: BorderRadius.circular(AgencyRadius.sm),
                    ),
                    child: imageUrl == null
                        ? null
                        : ClipRRect(
                            borderRadius:
                                BorderRadius.circular(AgencyRadius.sm),
                            child: Image.network(imageUrl!, fit: BoxFit.cover),
                          ),
                  ),
                  if (tag != null)
                    Positioned(
                      top: AgencySpacing.xs,
                      left: AgencySpacing.xs,
                      child: _tagPill(tag!, colors),
                    ),
                ],
              ),
            ),
            const Divider(height: AgencySpacing.lg),
            Row(
              children: <Widget>[
                Expanded(
                  child: Text(brand ?? '',
                      style: TextStyle(
                          fontSize: compact ? 9 : 11,
                          color: colors.contentSecondary)),
                ),
                if (moqLabel != null)
                  Text(moqLabel!,
                      style: TextStyle(
                          fontSize: compact ? 9 : 11,
                          color: colors.contentSecondary)),
              ],
            ),
            const SizedBox(height: AgencySpacing.xs),
            InkWell(
              onTap: onTap,
              borderRadius: BorderRadius.circular(AgencyRadius.sm),
              child: Text(title,
                  maxLines: compact ? 1 : 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                      fontSize: compact ? 11 : 14,
                      color: colors.contentPrimary,
                      fontWeight: FontWeight.w600)),
            ),
            const SizedBox(height: AgencySpacing.sm),
            Text('SELECT QTY TIER',
                style: TextStyle(
                    fontSize: compact ? 8 : 9, color: colors.contentSecondary)),
            const SizedBox(height: AgencySpacing.xs),
            TradeQuantityTierSelector(
              tiers: tiers,
              selectedIndex: selectedTierIndex,
              onSelected: onTierSelected,
              compact: compact,
            ),
            const SizedBox(height: AgencySpacing.sm),
            TradePriceBlock(
              unitPriceLabel: unitPriceLabel,
              mrpLabel: mrpLabel,
              totalLabel: totalLabel,
              compact: compact,
            ),
            if (fulfilmentNote != null)
              TradeFulfilmentMeta(
                  text: [fulfilmentNote, schemeNote]
                      .whereType<String>()
                      .join(' · '),
                  compact: compact),
            const SizedBox(height: AgencySpacing.sm),
            if (compact) ...<Widget>[
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: disabled ? null : onAdd,
                  style: FilledButton.styleFrom(
                    backgroundColor: colors.actionPrimary,
                    minimumSize: const Size.fromHeight(32),
                  ),
                  child: Text(added ? 'Added ✓' : 'Add $qty pcs'),
                ),
              ),
              const SizedBox(height: AgencySpacing.xs),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton(
                  onPressed: disabled ? null : onRfq,
                  style: OutlinedButton.styleFrom(
                    minimumSize: const Size.fromHeight(28),
                    side: BorderSide(color: colors.borderDefault),
                  ),
                  child: Text('RFQ',
                      style: TextStyle(color: colors.actionPrimary)),
                ),
              ),
            ] else
              Row(
                children: <Widget>[
                  Expanded(
                    child: FilledButton(
                      onPressed: disabled ? null : onAdd,
                      style: FilledButton.styleFrom(
                        backgroundColor: colors.actionPrimary,
                        minimumSize: const Size.fromHeight(40),
                      ),
                      child: Text(added ? 'Added ✓' : 'Add $qty pcs'),
                    ),
                  ),
                  const SizedBox(width: AgencySpacing.sm),
                  OutlinedButton(
                    onPressed: disabled ? null : onRfq,
                    style: OutlinedButton.styleFrom(
                      minimumSize: const Size(84, 40),
                      side: BorderSide(color: colors.borderDefault),
                    ),
                    child: Text('RFQ',
                        style: TextStyle(color: colors.actionPrimary)),
                  ),
                ],
              ),
          ],
        ),
      ),
    );
  }

  Widget _tagPill(TradeTag value, AgencyColors colors) {
    final (String label, Color bg) = switch (value) {
      TradeTag.bestseller => ('Bestseller', colors.trust),
      TradeTag.premium => ('Premium', colors.promotion),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: TextStyle(
            fontSize: 10,
            color: colors.contentInverse,
            fontWeight: FontWeight.w500),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// B2B / Bottom Navigation
// ---------------------------------------------------------------------------

class AppBottomNavigation extends StatelessWidget {
  const AppBottomNavigation({
    required this.items,
    required this.currentIndex,
    this.onSelected,
    super.key,
  });

  final List<BottomNavItem> items;
  final int currentIndex;
  final ValueChanged<int>? onSelected;

  @override
  Widget build(BuildContext context) {
    final colors = _colors(context);
    return Material(
      color: colors.surfaceRaised,
      child: SafeArea(
        top: false,
        child: Container(
          decoration: BoxDecoration(
            border: Border(top: BorderSide(color: colors.borderDefault)),
          ),
          child: SizedBox(
            height: 60,
            child: Row(
              children: <Widget>[
                for (var i = 0; i < items.length; i++)
                  Expanded(
                    child: InkWell(
                      onTap: onSelected == null ? null : () => onSelected!(i),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: <Widget>[
                          Icon(items[i].icon,
                              size: 22,
                              color: i == currentIndex
                                  ? colors.actionPrimary
                                  : colors.contentSecondary),
                          const SizedBox(height: 2),
                          Text(items[i].label,
                              style: TextStyle(
                                  fontSize: 10,
                                  color: i == currentIndex
                                      ? colors.actionPrimary
                                      : colors.contentSecondary)),
                          const SizedBox(height: 4),
                          AnimatedContainer(
                            duration: const Duration(milliseconds: 150),
                            width: i == currentIndex ? 20 : 0,
                            height: 3,
                            decoration: BoxDecoration(
                              color: colors.actionPrimary,
                              borderRadius: BorderRadius.circular(2),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Trust builder row
// ---------------------------------------------------------------------------

/// A marketplace trust/value item (icon + label), e.g. GST / returns / verified.
class TrustBuilderItem {
  const TrustBuilderItem({required this.label, required this.icon, this.color});

  final String label;
  final IconData icon;

  /// Icon colour; defaults to the trust (green/teal) accent.
  final Color? color;
}

/// A compact trust/value row. Uses the trust (green) accent by default, with an
/// optional colour per item (e.g. promotion/red for deal items), matching the
/// consumer home's colour scheme.
class TrustBuilderRow extends StatelessWidget {
  const TrustBuilderRow({required this.items, super.key});

  final List<TrustBuilderItem> items;

  @override
  Widget build(BuildContext context) {
    final colors = _colors(context);
    return Padding(
      padding: const EdgeInsets.symmetric(
          horizontal: AgencySpacing.md, vertical: AgencySpacing.sm),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: <Widget>[
          for (var i = 0; i < items.length; i++) ...<Widget>[
            if (i > 0) const SizedBox(width: AgencySpacing.sm),
            Flexible(
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: <Widget>[
                  Icon(items[i].icon,
                      size: 16, color: items[i].color ?? colors.trust),
                  const SizedBox(width: AgencySpacing.xs),
                  Flexible(
                    child: Text(items[i].label,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                            fontSize: 11, color: colors.contentSecondary)),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Utility shortcut card (Frequent & Saved / My Price Advantage)
// ---------------------------------------------------------------------------

/// A compact buyer-utility card: tinted icon container, title, subtitle and a
/// primary-coloured CTA. Used in pairs on the B2B trade home.
class UtilityShortcutCard extends StatelessWidget {
  const UtilityShortcutCard({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.ctaLabel,
    required this.accent,
    required this.accentSurface,
    this.onTap,
    super.key,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final String ctaLabel;
  final Color accent;
  final Color accentSurface;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = _colors(context);
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AgencyRadius.lg),
      child: Container(
        padding: const EdgeInsets.all(AgencySpacing.md),
        decoration: BoxDecoration(
          color: colors.surfaceRaised,
          borderRadius: BorderRadius.circular(AgencyRadius.lg),
          border: Border.all(color: colors.borderDefault),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color: accentSurface,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(icon, size: 18, color: accent),
            ),
            const SizedBox(height: AgencySpacing.sm),
            Text(title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: colors.contentPrimary)),
            const SizedBox(height: AgencySpacing.xs),
            Text(subtitle,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 10, color: colors.contentSecondary)),
            const SizedBox(height: AgencySpacing.sm),
            Text(ctaLabel,
                style: TextStyle(
                    fontSize: 11, fontWeight: FontWeight.w500, color: accent)),
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Merchandising tile (Seasonal / Best Deals / Schemes)
// ---------------------------------------------------------------------------

/// A tinted merchandising shortcut tile (icon + title + subtitle + CTA) with a
/// light accent surface, matching the consumer home's merchandising accents.
class MerchandisingTile extends StatelessWidget {
  const MerchandisingTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.ctaLabel,
    required this.accent,
    required this.accentSurface,
    this.onTap,
    super.key,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final String ctaLabel;
  final Color accent;
  final Color accentSurface;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = _colors(context);
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AgencyRadius.lg),
      child: Container(
        padding: const EdgeInsets.all(AgencySpacing.md),
        decoration: BoxDecoration(
          color: accentSurface,
          borderRadius: BorderRadius.circular(AgencyRadius.lg),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Icon(icon, size: 18, color: accent),
            const SizedBox(height: AgencySpacing.sm),
            Text(title,
                style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: colors.contentPrimary)),
            const SizedBox(height: 2),
            Text(subtitle,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 9, color: colors.contentSecondary)),
            const SizedBox(height: AgencySpacing.sm),
            Text(ctaLabel,
                style: TextStyle(
                    fontSize: 10, fontWeight: FontWeight.w500, color: accent)),
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Buy Again card (product-led repeat purchase)
// ---------------------------------------------------------------------------

/// A compact product card for the "Buy Again" horizontal rail.
///
/// The whole card is tappable (opens the product page); the `+ Add` button
/// reorders without leaving the rail.
class BuyAgainCard extends StatelessWidget {
  const BuyAgainCard({
    required this.title,
    this.imageUrl,
    this.onAdd,
    this.onTap,
    super.key,
  });

  final String title;
  final String? imageUrl;
  final VoidCallback? onAdd;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = _colors(context);
    return Container(
      width: 110,
      decoration: BoxDecoration(
        color: colors.surfaceRaised,
        borderRadius: BorderRadius.circular(AgencyRadius.lg),
        border: Border.all(color: colors.borderDefault),
      ),
      clipBehavior: Clip.antiAlias,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(AgencySpacing.sm),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Expanded(
                  child: Container(
                    width: double.infinity,
                    decoration: BoxDecoration(
                      color: colors.surfacePage,
                      borderRadius: BorderRadius.circular(AgencyRadius.sm),
                    ),
                    child: imageUrl == null
                        ? null
                        : ClipRRect(
                            borderRadius:
                                BorderRadius.circular(AgencyRadius.sm),
                            child: Image.network(imageUrl!, fit: BoxFit.cover),
                          ),
                  ),
                ),
                const SizedBox(height: AgencySpacing.sm),
                Text(title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style:
                        TextStyle(fontSize: 10, color: colors.contentPrimary)),
                const SizedBox(height: AgencySpacing.sm),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                    onPressed: onAdd,
                    style: FilledButton.styleFrom(
                      backgroundColor: colors.actionPrimary,
                      minimumSize: const Size.fromHeight(24),
                      padding: EdgeInsets.zero,
                    ),
                    child: const Text('+ Add', style: TextStyle(fontSize: 10)),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Credit finance dashboard — metric + action cards
// ---------------------------------------------------------------------------

/// A compact finance metric card (label + big value + detail), used in the
/// B2B Credit Account health section.
class CreditMetricCard extends StatelessWidget {
  const CreditMetricCard({
    required this.label,
    required this.value,
    required this.detail,
    this.valueColor,
    this.detailColor,
    super.key,
  });

  final String label;
  final String value;
  final String detail;
  final Color? valueColor;
  final Color? detailColor;

  @override
  Widget build(BuildContext context) {
    final colors = _colors(context);
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
          Text(label,
              style: TextStyle(
                  fontSize: 9,
                  fontWeight: FontWeight.w600,
                  color: colors.contentSecondary)),
          const SizedBox(height: 6),
          Text(value,
              style: TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w700,
                  color: valueColor ?? colors.contentPrimary)),
          const SizedBox(height: 6),
          Text(detail,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                  fontSize: 11, color: detailColor ?? colors.contentSecondary)),
        ],
      ),
    );
  }
}

/// A compact credit action card (icon + title + subtitle), used in the B2B
/// Credit Account action grid.
class CreditActionCard extends StatelessWidget {
  const CreditActionCard({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.accent,
    this.onTap,
    super.key,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final Color accent;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = _colors(context);
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AgencyRadius.lg),
      child: Container(
        padding: const EdgeInsets.all(AgencySpacing.md),
        decoration: BoxDecoration(
          color: colors.surfaceRaised,
          borderRadius: BorderRadius.circular(AgencyRadius.lg),
          border: Border.all(color: colors.borderDefault),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Icon(icon, size: 20, color: accent),
            const SizedBox(height: AgencySpacing.sm),
            Text(title,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: colors.contentPrimary)),
            const SizedBox(height: 2),
            Text(subtitle,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 10, color: colors.contentSecondary)),
          ],
        ),
      ),
    );
  }
}
