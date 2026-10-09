library agency_flutter_ui;

import 'dart:math' as math;

import 'package:flutter/material.dart';

part 'b2b_trade.dart';
part 'b2b_v5.dart';
part 'pin_components.dart';
part 'trade_offers.dart';

abstract final class AgencySpacing {
  static const double xs = 4;
  static const double sm = 8;
  static const double md = 16;
  static const double lg = 24;
  static const double xl = 32;
}

abstract final class AgencyRadius {
  static const double sm = 8;
  static const double md = 12;
  static const double lg = 16;
}

abstract final class AgencyText {
  static const TextStyle body = TextStyle(fontSize: 16, height: 1.5);
  static const TextStyle label = TextStyle(fontSize: 14, height: 1.4);
  static const TextStyle title =
      TextStyle(fontSize: 24, height: 1.25, fontWeight: FontWeight.w600);
  static const TextStyle metric =
      TextStyle(fontSize: 30, height: 1.15, fontWeight: FontWeight.w700);
}

enum AgencyMotionToken { instant, fast, standard, slow, page }

abstract final class AgencyMotion {
  static const _durations = {
    AgencyMotionToken.instant: Duration(milliseconds: 80),
    AgencyMotionToken.fast: Duration(milliseconds: 140),
    AgencyMotionToken.standard: Duration(milliseconds: 220),
    AgencyMotionToken.slow: Duration(milliseconds: 320),
    AgencyMotionToken.page: Duration(milliseconds: 380),
  };

  static Duration resolve(BuildContext context, AgencyMotionToken token) {
    final media = MediaQuery.maybeOf(context);
    if (media?.disableAnimations ?? false) return Duration.zero;
    return _durations[token]!;
  }
}

enum AgencyIconConcept { increment, decrement, search, warning, success, error }

class AgencyIcon extends StatelessWidget {
  const AgencyIcon(this.concept, {this.size = 20, super.key});
  final AgencyIconConcept concept;
  final double size;

  IconData get _nativeFallback => switch (concept) {
        AgencyIconConcept.increment => Icons.add,
        AgencyIconConcept.decrement => Icons.remove,
        AgencyIconConcept.search => Icons.search,
        AgencyIconConcept.warning => Icons.warning_amber,
        AgencyIconConcept.success => Icons.check_circle_outline,
        AgencyIconConcept.error => Icons.cancel_outlined,
      };

  @override
  Widget build(BuildContext context) => Icon(_nativeFallback, size: size);
}

/// Semantic color tokens for the PinCommerce storefront.
///
/// These are the Flutter binding of the governed design system (indigo brand
/// palette) plus merchandising accents. Components must resolve colours through
/// these tokens rather than hardcoding hex values.
@immutable
class AgencyColors extends ThemeExtension<AgencyColors> {
  const AgencyColors({
    required this.surfacePage,
    required this.surfaceRaised,
    required this.surfaceInteractive,
    required this.contentPrimary,
    required this.contentSecondary,
    required this.contentInverse,
    required this.actionPrimary,
    required this.actionSecondary,
    required this.actionDestructive,
    required this.borderDefault,
    required this.borderStrong,
    required this.feedbackSuccess,
    required this.feedbackWarning,
    required this.feedbackError,
    required this.feedbackInfo,
    required this.promotion,
    required this.promotionInverse,
    required this.trust,
    required this.trustSubtle,
    required this.promotionSubtle,
  });

  final Color surfacePage;
  final Color surfaceRaised;
  final Color surfaceInteractive;
  final Color contentPrimary;
  final Color contentSecondary;
  final Color contentInverse;
  final Color actionPrimary;
  final Color actionSecondary;
  final Color actionDestructive;
  final Color borderDefault;
  final Color borderStrong;
  final Color feedbackSuccess;
  final Color feedbackWarning;
  final Color feedbackError;
  final Color feedbackInfo;

  /// Merchandising accent for promotions and discount badges (orange/peach).
  final Color promotion;

  /// Text/icon colour used on top of [promotion].
  final Color promotionInverse;

  /// Merchandising accent for trust / positive states (green/teal).
  final Color trust;

  /// Subtle trust surface tint (Penpot `color.surface.trust-subtle`).
  final Color trustSubtle;

  /// Subtle promotion surface tint (Penpot `color.surface.promotion-subtle`).
  final Color promotionSubtle;

  static const AgencyColors light = AgencyColors(
    surfacePage: Color(0xFFF7F8FF),
    surfaceRaised: Color(0xFFFFFFFF),
    surfaceInteractive: Color(0xFFE9ECFF),
    contentPrimary: Color(0xFF1F2A44),
    contentSecondary: Color(0xFF66708A),
    contentInverse: Color(0xFFFFFFFF),
    actionPrimary: Color(0xFF5B6EE1),
    actionSecondary: Color(0xFFDCE2FF),
    actionDestructive: Color(0xFFB54747),
    borderDefault: Color(0xFFDDE2F2),
    borderStrong: Color(0xFFAAB4D6),
    feedbackSuccess: Color(0xFF3D7A57),
    feedbackWarning: Color(0xFFB9792D),
    feedbackError: Color(0xFFB54747),
    feedbackInfo: Color(0xFF5570B8),
    promotion: Color(0xFFFF6B35),
    promotionInverse: Color(0xFFFFFFFF),
    trust: Color(0xFF0D9488),
    trustSubtle: Color(0xFFE0F2F1),
    promotionSubtle: Color(0xFFFEE8DC),
  );

  @override
  AgencyColors copyWith({
    Color? surfacePage,
    Color? surfaceRaised,
    Color? surfaceInteractive,
    Color? contentPrimary,
    Color? contentSecondary,
    Color? contentInverse,
    Color? actionPrimary,
    Color? actionSecondary,
    Color? actionDestructive,
    Color? borderDefault,
    Color? borderStrong,
    Color? feedbackSuccess,
    Color? feedbackWarning,
    Color? feedbackError,
    Color? feedbackInfo,
    Color? promotion,
    Color? promotionInverse,
    Color? trust,
    Color? trustSubtle,
    Color? promotionSubtle,
  }) {
    return AgencyColors(
      surfacePage: surfacePage ?? this.surfacePage,
      surfaceRaised: surfaceRaised ?? this.surfaceRaised,
      surfaceInteractive: surfaceInteractive ?? this.surfaceInteractive,
      contentPrimary: contentPrimary ?? this.contentPrimary,
      contentSecondary: contentSecondary ?? this.contentSecondary,
      contentInverse: contentInverse ?? this.contentInverse,
      actionPrimary: actionPrimary ?? this.actionPrimary,
      actionSecondary: actionSecondary ?? this.actionSecondary,
      actionDestructive: actionDestructive ?? this.actionDestructive,
      borderDefault: borderDefault ?? this.borderDefault,
      borderStrong: borderStrong ?? this.borderStrong,
      feedbackSuccess: feedbackSuccess ?? this.feedbackSuccess,
      feedbackWarning: feedbackWarning ?? this.feedbackWarning,
      feedbackError: feedbackError ?? this.feedbackError,
      feedbackInfo: feedbackInfo ?? this.feedbackInfo,
      promotion: promotion ?? this.promotion,
      promotionInverse: promotionInverse ?? this.promotionInverse,
      trust: trust ?? this.trust,
      trustSubtle: trustSubtle ?? this.trustSubtle,
      promotionSubtle: promotionSubtle ?? this.promotionSubtle,
    );
  }

  @override
  AgencyColors lerp(AgencyColors? other, double t) {
    if (other is! AgencyColors) return this;
    return AgencyColors(
      surfacePage: Color.lerp(surfacePage, other.surfacePage, t)!,
      surfaceRaised: Color.lerp(surfaceRaised, other.surfaceRaised, t)!,
      surfaceInteractive:
          Color.lerp(surfaceInteractive, other.surfaceInteractive, t)!,
      contentPrimary: Color.lerp(contentPrimary, other.contentPrimary, t)!,
      contentSecondary:
          Color.lerp(contentSecondary, other.contentSecondary, t)!,
      contentInverse: Color.lerp(contentInverse, other.contentInverse, t)!,
      actionPrimary: Color.lerp(actionPrimary, other.actionPrimary, t)!,
      actionSecondary: Color.lerp(actionSecondary, other.actionSecondary, t)!,
      actionDestructive:
          Color.lerp(actionDestructive, other.actionDestructive, t)!,
      borderDefault: Color.lerp(borderDefault, other.borderDefault, t)!,
      borderStrong: Color.lerp(borderStrong, other.borderStrong, t)!,
      feedbackSuccess: Color.lerp(feedbackSuccess, other.feedbackSuccess, t)!,
      feedbackWarning: Color.lerp(feedbackWarning, other.feedbackWarning, t)!,
      feedbackError: Color.lerp(feedbackError, other.feedbackError, t)!,
      feedbackInfo: Color.lerp(feedbackInfo, other.feedbackInfo, t)!,
      promotion: Color.lerp(promotion, other.promotion, t)!,
      promotionInverse:
          Color.lerp(promotionInverse, other.promotionInverse, t)!,
      trust: Color.lerp(trust, other.trust, t)!,
      trustSubtle: Color.lerp(trustSubtle, other.trustSubtle, t)!,
      promotionSubtle:
          Color.lerp(promotionSubtle, other.promotionSubtle, t)!,
    );
  }
}

/// Convenience accessor for the semantic colour tokens.
extension AgencyThemeX on BuildContext {
  AgencyColors get colors => Theme.of(this).extension<AgencyColors>()!;
}

abstract final class AgencyTheme {
  static ThemeData light() {
    final colors = AgencyColors.light;
    final scheme = ColorScheme.fromSeed(
      seedColor: colors.actionPrimary,
      brightness: Brightness.light,
    ).copyWith(
      primary: colors.actionPrimary,
      onPrimary: colors.contentInverse,
      secondary: colors.actionSecondary,
      onSecondary: colors.contentPrimary,
      error: colors.actionDestructive,
      onError: colors.contentInverse,
      surface: colors.surfaceRaised,
      onSurface: colors.contentPrimary,
      outline: colors.borderDefault,
      outlineVariant: colors.borderDefault,
    );
    return ThemeData(
      colorScheme: scheme,
      extensions: <ThemeExtension<dynamic>>[colors],
      scaffoldBackgroundColor: colors.surfacePage,
      appBarTheme: AppBarTheme(
        backgroundColor: colors.surfacePage,
        foregroundColor: colors.contentPrimary,
        elevation: 0,
      ),
      useMaterial3: true,
    );
  }
}

enum CommerceFixture {
  defaultState,
  loading,
  empty,
  failure,
  approvalPending,
  paymentFailed,
  disabled,
  validationError,
  outOfStock,
  discounted,
  editing,
  open,
  resolved,
}

Widget _messageCard(String message) => Card(
      child: Padding(
        padding: const EdgeInsets.all(AgencySpacing.md),
        child: Text(message, style: AgencyText.body),
      ),
    );

/// Layout density for a [ProductCard]: `compact` for swimlanes/carousels,
/// `large` for feed-style merchandising tiles.
enum ProductCardVariant { compact, large }

class ProductCard extends StatelessWidget {
  const ProductCard({
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
    this.wishlisted = false,
    this.onWishlist,
    this.state = CommerceFixture.defaultState,
    super.key,
  });

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
  final bool wishlisted;
  final VoidCallback? onWishlist;
  final CommerceFixture state;

  @override
  Widget build(BuildContext context) {
    if (state == CommerceFixture.loading) {
      return const Card(
        child: Padding(
          padding: EdgeInsets.all(AgencySpacing.md),
          child: LinearProgressIndicator(),
        ),
      );
    }
    if (state == CommerceFixture.failure) {
      return _messageCard('Product unavailable');
    }
    final unavailable = state == CommerceFixture.outOfStock;
    return Semantics(
      button: onPressed != null && !unavailable,
      label: '$title, $priceLabel',
      child: Card(
        margin: EdgeInsets.zero,
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: unavailable ? null : onPressed,
          child: Padding(
            padding: const EdgeInsets.all(AgencySpacing.sm),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                _image(context),
                const SizedBox(height: AgencySpacing.sm),
                if (brand != null)
                  Text(
                    brand!,
                    style: AgencyText.label
                        .copyWith(color: context.colors.contentSecondary),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                SizedBox(
                  height: variant == ProductCardVariant.large ? 36 : 34,
                  child: Text(
                    title,
                    style: AgencyText.label.copyWith(
                      color: context.colors.contentPrimary,
                      fontSize: variant == ProductCardVariant.large ? 14 : 13,
                      height: 1.3,
                      fontWeight: FontWeight.w600,
                    ),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                const SizedBox(height: AgencySpacing.xs),
                _priceRow(context, unavailable: unavailable),
                if (rating != null) ...[
                  const SizedBox(height: AgencySpacing.xs),
                  _ratingRow(context),
                ],
                if (variant == ProductCardVariant.large &&
                    deliveryNote != null) ...[
                  const SizedBox(height: AgencySpacing.xs),
                  Text(
                    deliveryNote!,
                    style: AgencyText.label
                        .copyWith(color: context.colors.contentSecondary),
                  ),
                ],
                if (unavailable) ...[
                  const SizedBox(height: AgencySpacing.xs),
                  const Text('Out of stock', style: AgencyText.label),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _image(BuildContext context) {
    final colors = context.colors;
    final Widget placeholder = ColoredBox(
      color: colors.surfaceInteractive,
      child: Center(
        child: Icon(Icons.image_outlined, color: colors.contentSecondary),
      ),
    );
    final Widget content = imageUrl == null
        ? placeholder
        : Image.network(
            imageUrl!,
            fit: BoxFit.cover,
            errorBuilder: (_, __, ___) => placeholder,
          );
    return SizedBox(
      height: variant == ProductCardVariant.large ? 172 : 132,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(AgencyRadius.sm),
        child: Stack(
          fit: StackFit.expand,
          children: <Widget>[
            content,
            if (badges.isNotEmpty || discountLabel != null)
              Positioned(
                top: AgencySpacing.xs,
                left: AgencySpacing.xs,
                right: AgencySpacing.xs,
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: <Widget>[
                    if (badges.isNotEmpty)
                      Flexible(
                        child: Align(
                          alignment: Alignment.centerLeft,
                          child: Wrap(
                            spacing: AgencySpacing.xs,
                            runSpacing: 2,
                            children: <Widget>[
                              for (final badge in badges.take(2))
                                _pill(
                                  badge,
                                  _badgeColor(badge, colors),
                                  colors.contentInverse,
                                ),
                            ],
                          ),
                        ),
                      ),
                    if (badges.isNotEmpty && discountLabel != null)
                      const SizedBox(width: AgencySpacing.xs),
                    if (badges.isEmpty && discountLabel != null)
                      const Spacer(),
                    if (discountLabel != null)
                      _pill(
                        discountLabel!,
                        colors.promotion,
                        colors.promotionInverse,
                      ),
                  ],
                ),
              ),
            if (onWishlist != null)
              Positioned(
                right: AgencySpacing.xs,
                bottom: AgencySpacing.xs,
                child: Material(
                  color: colors.surfaceRaised.withValues(alpha: 0.92),
                  shape: const CircleBorder(),
                  child: InkWell(
                    onTap: onWishlist,
                    customBorder: const CircleBorder(),
                    child: Padding(
                      padding: const EdgeInsets.all(6),
                      child: Icon(
                        wishlisted ? Icons.favorite : Icons.favorite_border,
                        size: 16,
                        color:
                            wishlisted ? colors.promotion : colors.contentSecondary,
                      ),
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  /// Badge colour by label: deals/clearance/sale read as promotion (red),
  /// new/premium use the action/warning accents, everything else is trust
  /// (green).
  Color _badgeColor(String label, AgencyColors colors) {
    final l = label.toLowerCase();
    if (l.contains('deal') ||
        l.contains('clear') ||
        l.contains('sale') ||
        l.contains('flash')) {
      return colors.promotion;
    }
    if (l.contains('new')) return colors.actionPrimary;
    if (l.contains('premium')) return colors.feedbackWarning;
    return colors.trust;
  }

  Widget _priceRow(BuildContext context, {required bool unavailable}) {
    final colors = context.colors;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: <Widget>[
        Expanded(
          child: Text.rich(
            TextSpan(
              children: <InlineSpan>[
                TextSpan(
                  text: priceLabel,
                  style: AgencyText.title.copyWith(
                    color: colors.contentPrimary,
                    fontSize: variant == ProductCardVariant.large ? 20 : 18,
                  ),
                ),
                if (previousPriceLabel != null)
                  TextSpan(
                    text: ' $previousPriceLabel',
                    style: AgencyText.label.copyWith(
                      color: colors.contentSecondary,
                      decoration: TextDecoration.lineThrough,
                    ),
                  ),
              ],
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ),
        if (onAddToCart != null) ...<Widget>[
          const SizedBox(width: AgencySpacing.xs),
          CartPlusIconButton(
            size: variant == ProductCardVariant.large ? 40 : 32,
            state:
                unavailable ? CartPlusState.unavailable : CartPlusState.normal,
            semanticLabel: 'Add $title to cart',
            onPressed: unavailable ? null : onAddToCart,
          ),
        ],
      ],
    );
  }

  Widget _ratingRow(BuildContext context) {
    final colors = context.colors;
    return Row(
      children: <Widget>[
        Icon(Icons.star, size: 14, color: colors.feedbackWarning),
        const SizedBox(width: 2),
        Text(
          rating!.toStringAsFixed(1),
          style: AgencyText.label.copyWith(color: colors.contentSecondary),
        ),
        if (reviewCount != null) ...<Widget>[
          const SizedBox(width: 2),
          Text(
            '(${reviewCount!})',
            style: AgencyText.label.copyWith(color: colors.contentSecondary),
          ),
        ],
      ],
    );
  }

  Widget _pill(String label, Color background, Color foreground) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(AgencyRadius.sm),
      ),
      child: Text(
        label,
        style: AgencyText.label.copyWith(
          color: foreground,
          fontSize: 10.5,
          height: 1.2,
          fontWeight: FontWeight.w600,
        ),
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
      ),
    );
  }
}

class CategoryRail extends StatelessWidget {
  const CategoryRail({
    required this.categories,
    this.state = CommerceFixture.defaultState,
    this.onSelected,
    super.key,
  });
  final List<String> categories;
  final CommerceFixture state;
  final ValueChanged<String>? onSelected;

  @override
  Widget build(BuildContext context) {
    if (state == CommerceFixture.loading)
      return const LinearProgressIndicator();
    if (state == CommerceFixture.failure)
      return _messageCard('Categories unavailable');
    if (state == CommerceFixture.empty || categories.isEmpty)
      return _messageCard('No categories');
    return Semantics(
      label: 'Product categories',
      child: SizedBox(
        height: 52,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          itemCount: categories.length,
          separatorBuilder: (_, __) => const SizedBox(width: AgencySpacing.sm),
          itemBuilder: (context, index) {
            final category = categories[index];
            return ActionChip(
                label: Text(category),
                onPressed:
                    onSelected == null ? null : () => onSelected!(category));
          },
        ),
      ),
    );
  }
}

/// A category entry rendered as a circular icon + label (icon-led, not text-led).
class Category {
  const Category({required this.label, required this.icon, this.accent});
  final String label;
  final IconData icon;
  final Color? accent;
}

/// A single category: circular pastel background, icon, label beneath.
///
/// [selected] adds an accent ring + emphasised label for single-select rails.
class CategoryIconItem extends StatelessWidget {
  const CategoryIconItem(
      {required this.category, this.onTap, this.selected = false, super.key});

  final Category category;
  final VoidCallback? onTap;
  final bool selected;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final accent = category.accent ?? colors.surfaceInteractive;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AgencyRadius.lg),
      child: SizedBox(
        width: 72,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Container(
              width: 56,
              height: 56,
              decoration: BoxDecoration(
                color: accent,
                shape: BoxShape.circle,
                border: selected
                    ? Border.all(color: colors.actionPrimary, width: 2)
                    : null,
              ),
              child: Icon(category.icon, color: colors.actionPrimary, size: 26),
            ),
            const SizedBox(height: AgencySpacing.xs),
            Text(
              category.label,
              style: AgencyText.label.copyWith(
                fontSize: 12,
                fontWeight: selected ? FontWeight.w700 : FontWeight.w400,
                color: selected ? colors.actionPrimary : colors.contentPrimary,
              ),
              textAlign: TextAlign.center,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
      ),
    );
  }
}

/// Horizontal icon-led category rail.
class CategoryIconRail extends StatelessWidget {
  const CategoryIconRail(
      {required this.categories,
      this.onSelected,
      this.selectedLabel,
      super.key});

  final List<Category> categories;
  final ValueChanged<Category>? onSelected;

  /// Label of the currently selected category (single-select highlight).
  final String? selectedLabel;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 96,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: categories.length,
        separatorBuilder: (_, __) => const SizedBox(width: AgencySpacing.md),
        itemBuilder: (context, index) {
          final category = categories[index];
          return CategoryIconItem(
            category: category,
            selected: selectedLabel != null && category.label == selectedLabel,
            onTap: onSelected == null ? null : () => onSelected!(category),
          );
        },
      ),
    );
  }
}

class QuickOrderLine {
  const QuickOrderLine(
      {required this.sku, required this.name, required this.quantity});
  final String sku;
  final String name;
  final int quantity;
}

class B2BQuickOrder extends StatelessWidget {
  const B2BQuickOrder({
    required this.lines,
    this.state = CommerceFixture.defaultState,
    this.onQuantityChanged,
    super.key,
  });
  final List<QuickOrderLine> lines;
  final CommerceFixture state;
  final void Function(String sku, int quantity)? onQuantityChanged;

  @override
  Widget build(BuildContext context) {
    if (state == CommerceFixture.loading)
      return const LinearProgressIndicator();
    if (state == CommerceFixture.failure)
      return _messageCard('Quick order unavailable');
    if (state == CommerceFixture.empty || lines.isEmpty)
      return _messageCard('No order lines');
    return Semantics(
      label: 'B2B quick order',
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: DataTable(
          columns: const [
            DataColumn(label: Text('SKU')),
            DataColumn(label: Text('Product')),
            DataColumn(label: Text('Qty')),
          ],
          rows: lines
              .map((line) => DataRow(cells: [
                    DataCell(Text(line.sku)),
                    DataCell(Text(line.name)),
                    DataCell(Row(children: [
                      IconButton(
                        tooltip: 'Decrease ${line.name}',
                        onPressed: onQuantityChanged == null
                            ? null
                            : () => onQuantityChanged!(line.sku,
                                line.quantity > 0 ? line.quantity - 1 : 0),
                        icon: const AgencyIcon(AgencyIconConcept.decrement),
                      ),
                      Text('${line.quantity}'),
                      IconButton(
                        tooltip: 'Increase ${line.name}',
                        onPressed: onQuantityChanged == null
                            ? null
                            : () =>
                                onQuantityChanged!(line.sku, line.quantity + 1),
                        icon: const AgencyIcon(AgencyIconConcept.increment),
                      ),
                    ])),
                  ]))
              .toList(),
        ),
      ),
    );
  }
}

class DashboardKpi extends StatelessWidget {
  const DashboardKpi({
    required this.label,
    required this.value,
    this.trendLabel,
    this.state = CommerceFixture.defaultState,
    super.key,
  });
  final String label;
  final String value;
  final String? trendLabel;
  final CommerceFixture state;

  @override
  Widget build(BuildContext context) {
    if (state == CommerceFixture.loading) {
      return const Card(
          child: Padding(
        padding: EdgeInsets.all(AgencySpacing.md),
        child: LinearProgressIndicator(),
      ));
    }
    if (state == CommerceFixture.failure)
      return _messageCard('Metric unavailable');
    return Semantics(
      label: '$label $value',
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(AgencySpacing.md),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: AgencyText.label),
              const SizedBox(height: AgencySpacing.sm),
              Text(value, style: AgencyText.metric),
              if (trendLabel != null) ...[
                const SizedBox(height: AgencySpacing.xs),
                Text(trendLabel!, style: AgencyText.label),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class ExceptionItem {
  const ExceptionItem(
      {required this.id, required this.summary, required this.status});
  final String id;
  final String summary;
  final String status;
}

class ExceptionTable extends StatelessWidget {
  const ExceptionTable({
    required this.items,
    this.state = CommerceFixture.defaultState,
    this.onOpen,
    super.key,
  });
  final List<ExceptionItem> items;
  final CommerceFixture state;
  final ValueChanged<String>? onOpen;

  @override
  Widget build(BuildContext context) {
    if (state == CommerceFixture.loading)
      return const LinearProgressIndicator();
    if (state == CommerceFixture.failure)
      return _messageCard('Exceptions unavailable');
    if (state == CommerceFixture.empty || items.isEmpty)
      return _messageCard('No exceptions');
    return Semantics(
      label: 'Operational exceptions',
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: DataTable(
          columns: const [
            DataColumn(label: Text('ID')),
            DataColumn(label: Text('Exception')),
            DataColumn(label: Text('Status')),
            DataColumn(label: Text('Action')),
          ],
          rows: items
              .map((item) => DataRow(cells: [
                    DataCell(Text(item.id)),
                    DataCell(Text(item.summary)),
                    DataCell(Text(item.status)),
                    DataCell(TextButton(
                        onPressed:
                            onOpen == null ? null : () => onOpen!(item.id),
                        child: const Text('Open'))),
                  ]))
              .toList(),
        ),
      ),
    );
  }
}

class FilterBar extends StatelessWidget {
  const FilterBar({
    required this.filters,
    this.selected = const <String>{},
    this.onSelected,
    this.onClear,
    this.state = CommerceFixture.defaultState,
    super.key,
  });
  final List<String> filters;
  final Set<String> selected;
  final ValueChanged<String>? onSelected;
  final VoidCallback? onClear;
  final CommerceFixture state;

  @override
  Widget build(BuildContext context) {
    final disabled = state == CommerceFixture.disabled;
    return Semantics(
      label: 'Product filters',
      child: Wrap(
        spacing: AgencySpacing.sm,
        runSpacing: AgencySpacing.sm,
        children: [
          for (final filter in filters)
            FilterChip(
              label: Text(filter),
              selected: selected.contains(filter),
              onSelected: disabled || onSelected == null
                  ? null
                  : (_) => onSelected!(filter),
            ),
          TextButton(
            onPressed: disabled ? null : onClear,
            child: const Text('Clear'),
          ),
        ],
      ),
    );
  }
}

class CheckoutSummary extends StatelessWidget {
  const CheckoutSummary({
    required this.subtotal,
    required this.shipping,
    required this.total,
    this.onContinue,
    this.state = CommerceFixture.defaultState,
    super.key,
  });
  final String subtotal;
  final String shipping;
  final String total;
  final VoidCallback? onContinue;
  final CommerceFixture state;

  @override
  Widget build(BuildContext context) {
    if (state == CommerceFixture.loading)
      return const LinearProgressIndicator();
    final disabled = state == CommerceFixture.disabled;
    return Semantics(
      label: 'Checkout summary',
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(AgencySpacing.md),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [const Text('Subtotal'), Text(subtotal)]),
              const SizedBox(height: AgencySpacing.sm),
              Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [const Text('Shipping'), Text(shipping)]),
              const Divider(),
              Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                const Text('Total', style: AgencyText.title),
                Text(total, style: AgencyText.title)
              ]),
              const SizedBox(height: AgencySpacing.md),
              FilledButton(
                  onPressed: disabled ? null : onContinue,
                  child: const Text('Continue checkout')),
            ],
          ),
        ),
      ),
    );
  }
}

class NavigationMenu extends StatelessWidget {
  const NavigationMenu({
    required this.items,
    required this.current,
    this.onNavigate,
    this.state = CommerceFixture.defaultState,
    super.key,
  });
  final List<String> items;
  final String current;
  final ValueChanged<String>? onNavigate;
  final CommerceFixture state;

  @override
  Widget build(BuildContext context) {
    final disabled = state == CommerceFixture.disabled;
    return Semantics(
      label: 'Primary navigation',
      child: Wrap(
        spacing: AgencySpacing.sm,
        children: [
          for (final item in items)
            TextButton(
              onPressed: disabled || onNavigate == null
                  ? null
                  : () => onNavigate!(item),
              child: Text(item,
                  style: item == current
                      ? AgencyText.label.copyWith(fontWeight: FontWeight.w700)
                      : AgencyText.label),
            ),
        ],
      ),
    );
  }
}

class FormSection extends StatelessWidget {
  const FormSection({
    required this.label,
    required this.value,
    this.helper,
    this.error,
    this.onChanged,
    this.state = CommerceFixture.defaultState,
    super.key,
  });
  final String label;
  final String value;
  final String? helper;
  final String? error;
  final ValueChanged<String>? onChanged;
  final CommerceFixture state;

  @override
  Widget build(BuildContext context) {
    final disabled = state == CommerceFixture.disabled;
    final effectiveError = state == CommerceFixture.validationError
        ? (error ?? 'Check this value')
        : error;
    return TextFormField(
      initialValue: value,
      enabled: !disabled,
      onChanged: onChanged,
      decoration: InputDecoration(
        labelText: label,
        helperText: helper,
        errorText: effectiveError,
      ),
    );
  }
}

class Surface extends StatelessWidget {
  const Surface({required this.child, super.key});
  final Widget child;
  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return Container(
      padding: const EdgeInsets.all(AgencySpacing.lg),
      decoration: BoxDecoration(
        color: colors.surfaceRaised,
        borderRadius: BorderRadius.circular(AgencyRadius.lg),
        border: Border.all(color: colors.borderDefault),
      ),
      child: child,
    );
  }
}

/// Reusable section header: title + optional tag pill + See All action.
class SectionHeader extends StatelessWidget {
  const SectionHeader({
    required this.title,
    this.tag,
    this.seeAllLabel = 'See All',
    this.onSeeAll,
    super.key,
  });

  final String title;
  final String? tag;
  final String seeAllLabel;
  final VoidCallback? onSeeAll;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return Row(
      children: <Widget>[
        Expanded(
          child: Text(
            title,
            style: AgencyText.title.copyWith(
              fontSize: 20,
              color: colors.contentPrimary,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ),
        if (tag != null) ...<Widget>[
          const SizedBox(width: AgencySpacing.sm),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
            decoration: BoxDecoration(
              color: colors.trust,
              borderRadius: BorderRadius.circular(AgencyRadius.sm),
            ),
            child: Text(
              tag!,
              style: AgencyText.label.copyWith(
                color: colors.contentInverse,
                fontSize: 12,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
        TextButton(
          onPressed: onSeeAll,
          child: Text(seeAllLabel),
        ),
      ],
    );
  }
}

/// Image-led merchandising banner with headline, subtitle and optional CTA.
class MerchandisingBanner extends StatelessWidget {
  const MerchandisingBanner({
    required this.imageUrl,
    required this.title,
    this.subtitle,
    this.ctaLabel,
    this.onCta,
    super.key,
  });

  final String imageUrl;
  final String title;
  final String? subtitle;
  final String? ctaLabel;
  final VoidCallback? onCta;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return ClipRRect(
      borderRadius: BorderRadius.circular(AgencyRadius.md),
      child: AspectRatio(
        aspectRatio: 2.2,
        child: Stack(
          fit: StackFit.expand,
          children: <Widget>[
            Image.network(
              imageUrl,
              fit: BoxFit.cover,
              errorBuilder: (_, __, ___) =>
                  ColoredBox(color: colors.surfaceInteractive),
            ),
            ColoredBox(color: Colors.black.withValues(alpha: 0.25)),
            Padding(
              padding: const EdgeInsets.all(AgencySpacing.md),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.center,
                mainAxisSize: MainAxisSize.min,
                children: <Widget>[
                  Text(
                    title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AgencyText.title.copyWith(
                      color: colors.contentInverse,
                      fontSize: 16,
                    ),
                  ),
                  if (subtitle != null) ...<Widget>[
                    const SizedBox(height: 2),
                    Text(
                      subtitle!,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AgencyText.body.copyWith(
                        color: colors.contentInverse,
                        fontSize: 12,
                      ),
                    ),
                  ],
                  if (ctaLabel != null) ...<Widget>[
                    const SizedBox(height: AgencySpacing.xs),
                    FilledButton(
                      onPressed: onCta,
                      style: FilledButton.styleFrom(
                        minimumSize: const Size(0, 32),
                        padding:
                            const EdgeInsets.symmetric(horizontal: 12),
                        visualDensity: VisualDensity.compact,
                      ),
                      child: Text(ctaLabel!,
                          style: const TextStyle(fontSize: 12)),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Horizontal carousel of product cards.
class ProductCarousel extends StatelessWidget {
  const ProductCarousel({
    required this.children,
    this.itemWidth = 152,
    this.height = 252,
    super.key,
  });

  final List<Widget> children;
  final double itemWidth;
  final double height;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: height,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: children.length,
        separatorBuilder: (_, __) => const SizedBox(width: AgencySpacing.sm),
        itemBuilder: (context, index) =>
            SizedBox(width: itemWidth, child: children[index]),
      ),
    );
  }
}

/// A composite merchandising slot: a labelled tile holding two compact items
/// (e.g. "Recently viewed", "Frequently bought together").
class SplitMerchandisingTile extends StatelessWidget {
  const SplitMerchandisingTile({
    required this.sectionLabel,
    required this.children,
    super.key,
  });

  final String sectionLabel;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(AgencySpacing.sm),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              decoration: BoxDecoration(
                color: colors.trust,
                borderRadius: BorderRadius.circular(AgencyRadius.sm),
              ),
              child: Text(
                sectionLabel,
                style: AgencyText.label.copyWith(
                  color: colors.contentInverse,
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            const SizedBox(height: AgencySpacing.sm),
            // The special slot shares the composition grid cell with large
            // product cards, so its items expand to fill the height instead of
            // leaving dead space below two fixed-height previews.
            Expanded(
              child: Column(
                children: <Widget>[
                  for (var i = 0; i < children.length; i++) ...<Widget>[
                    if (i > 0) const SizedBox(height: AgencySpacing.sm),
                    Expanded(child: children[i]),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Two-column grid of product cards (embedded, non-scrolling).
class ProductGrid extends StatelessWidget {
  const ProductGrid({
    required this.children,
    this.crossAxisCount = 2,
    this.mainAxisExtent = 296,
    super.key,
  });

  final List<Widget> children;
  final int crossAxisCount;
  final double mainAxisExtent;

  @override
  Widget build(BuildContext context) {
    return GridView(
      primary: false,
      padding: EdgeInsets.zero,
      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: crossAxisCount,
        mainAxisExtent: mainAxisExtent,
        mainAxisSpacing: AgencySpacing.sm,
        crossAxisSpacing: AgencySpacing.sm,
      ),
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      children: children,
    );
  }
}

/// The 5+1 merchandising composition: five large product cards plus one split
/// merchandising slot (the sixth grid cell).
class ProductCompositionSection extends StatelessWidget {
  const ProductCompositionSection({
    required this.regularProducts,
    required this.specialSlot,
    this.mainAxisExtent = 312,
    super.key,
  });

  final List<Widget> regularProducts;
  final Widget specialSlot;
  final double mainAxisExtent;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final width = constraints.maxWidth;
        final crossAxisCount = width >= 900
            ? 4
            : width >= 600
                ? 3
                : 2;
        return ProductGrid(
          crossAxisCount: crossAxisCount,
          mainAxisExtent: mainAxisExtent,
          children: <Widget>[...regularProducts, specialSlot],
        );
      },
    );
  }
}

/// A compact product preview used inside a split merchandising tile. Distinct
/// from [ProductCard]: small image, short title, price + discount + quick-add.
class CompactProductItem extends StatelessWidget {
  const CompactProductItem({
    required this.title,
    required this.priceLabel,
    this.imageUrl,
    this.discountLabel,
    this.onPressed,
    this.onAdd,
    super.key,
  });

  final String title;
  final String priceLabel;
  final String? imageUrl;
  final String? discountLabel;
  final VoidCallback? onPressed;
  final VoidCallback? onAdd;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return InkWell(
      onTap: onPressed,
      borderRadius: BorderRadius.circular(AgencyRadius.sm),
      child: Container(
        height: 80,
        padding: const EdgeInsets.all(AgencySpacing.xs),
        decoration: BoxDecoration(
          color: colors.surfaceInteractive,
          borderRadius: BorderRadius.circular(AgencyRadius.sm),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            SizedBox(
              width: 52,
              child: ClipRRect(
                borderRadius: BorderRadius.circular(AgencyRadius.sm),
                child: Stack(
                  fit: StackFit.expand,
                  children: <Widget>[
                    imageUrl == null
                        ? ColoredBox(color: colors.surfaceRaised)
                        : Image.network(
                            imageUrl!,
                            fit: BoxFit.cover,
                            errorBuilder: (_, __, ___) =>
                                ColoredBox(color: colors.surfaceRaised),
                          ),
                    if (discountLabel != null)
                      Positioned(
                        top: 2,
                        left: 2,
                        right: 2,
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 3, vertical: 1),
                          decoration: BoxDecoration(
                            color: colors.promotion,
                            borderRadius:
                                BorderRadius.circular(AgencyRadius.sm),
                          ),
                          child: Text(
                            discountLabel!,
                            style: AgencyText.label.copyWith(
                              color: colors.promotionInverse,
                              fontSize: 9,
                              height: 1.2,
                              fontWeight: FontWeight.w600,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            textAlign: TextAlign.center,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ),
            const SizedBox(width: 6),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Expanded(
                    child: Text(
                      title,
                      style: AgencyText.label.copyWith(
                        color: colors.contentPrimary,
                        fontSize: 12,
                        height: 1.2,
                        fontWeight: FontWeight.w600,
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  Row(
                    children: <Widget>[
                      Expanded(
                        child: Text(
                          priceLabel,
                          style: AgencyText.label.copyWith(
                            fontWeight: FontWeight.w700,
                            color: colors.contentPrimary,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      if (onAdd != null) ...<Widget>[
                        const SizedBox(width: AgencySpacing.xs),
                        InkWell(
                          onTap: onAdd,
                          borderRadius: BorderRadius.circular(AgencyRadius.sm),
                          child: Container(
                            width: 24,
                            height: 24,
                            decoration: BoxDecoration(
                              color: colors.actionPrimary,
                              shape: BoxShape.circle,
                            ),
                            child: Icon(Icons.add,
                                size: 16, color: colors.contentInverse),
                          ),
                        ),
                      ],
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
