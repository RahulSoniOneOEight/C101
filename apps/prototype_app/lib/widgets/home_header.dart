import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';

import '../domain/presentation.dart';

/// The B2C home header stack: location → search → trust row → hero carousel.
///
/// Hero banners are backend-managed presentation. When [banners] is empty the
/// governed fallback is used, so the header never renders without content.
///
/// The category rail is deliberately *not* part of the header: category
/// selection now lives below the second promotional banner, directly above the
/// Recommended-for-You composition, so choosing a category filters that grid.
class HomeHeader extends StatelessWidget {
  const HomeHeader({
    this.locationLabel = 'Bhiwadi, Rajasthan 301019',
    this.banners = const <StorefrontBanner>[],
    this.onSearch,
    this.onLocation,
    this.onBannerTap,
    super.key,
  });

  final String locationLabel;

  /// Hero banners for this surface, ordered by the backend.
  final List<StorefrontBanner> banners;
  final VoidCallback? onSearch;
  final VoidCallback? onLocation;

  /// Invoked with the tapped banner so the caller can follow its action target.
  final void Function(StorefrontBanner banner)? onBannerTap;

  // Seeds keep titles and themes but state no quantified claim: no saving, no catalogue size, no
  // delivery threshold. Anything numeric here would reach shoppers as if it were evidenced.
  static const List<StorefrontBanner> _fallback = <StorefrontBanner>[
    StorefrontBanner(
      contentKey: 'hero-monsoon-ready',
      placement: 'home.hero',
      title: 'Monsoon Ready',
      themeKey: 'primary',
    ),
    StorefrontBanner(
      contentKey: 'hero-bulk-savings',
      placement: 'home.hero',
      title: 'Bulk Savings',
      themeKey: 'trust',
    ),
    StorefrontBanner(
      contentKey: 'hero-free-delivery',
      placement: 'home.hero',
      title: 'Free Delivery',
      themeKey: 'promotion',
    ),
  ];

  Color _themeColor(AgencyColors colors, String themeKey) {
    switch (themeKey) {
      case 'trust':
        return colors.trust;
      case 'promotion':
        return colors.promotion;
      case 'neutral':
        return colors.surfaceInteractive;
      default:
        return colors.actionPrimary;
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors =
        Theme.of(context).extension<AgencyColors>() ?? AgencyColors.light;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        // Location
        InkWell(
          onTap: onLocation,
          borderRadius: BorderRadius.circular(AgencyRadius.sm),
          child: Row(
            children: <Widget>[
              Icon(Icons.location_on_outlined,
                  size: 18, color: colors.actionPrimary),
              const SizedBox(width: AgencySpacing.xs),
              Expanded(
                child: Text('Deliver to · $locationLabel',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: colors.contentPrimary)),
              ),
              const Icon(Icons.expand_more, size: 18),
            ],
          ),
        ),
        const SizedBox(height: AgencySpacing.sm),
        // Search bar
        InkWell(
          onTap: onSearch,
          borderRadius: BorderRadius.circular(AgencyRadius.md),
          child: Container(
            height: 44,
            padding:
                const EdgeInsets.symmetric(horizontal: AgencySpacing.sm),
            decoration: BoxDecoration(
              color: colors.surfacePage,
              borderRadius: BorderRadius.circular(AgencyRadius.md),
              border: Border.all(color: colors.borderDefault),
            ),
            child: Row(
              children: <Widget>[
                Icon(Icons.search, size: 18, color: colors.contentSecondary),
                const SizedBox(width: AgencySpacing.sm),
                Expanded(
                  child: Text('Search products, brands, sellers',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                          fontSize: 13, color: colors.contentSecondary)),
                ),
              ],
            ),
          ),
        ),
        // Trust row
        const TrustBuilderRow(
          items: <TrustBuilderItem>[
            TrustBuilderItem(label: 'GST invoices', icon: Icons.receipt_long_outlined),
            TrustBuilderItem(
                label: 'Verified sellers', icon: Icons.verified_outlined),
            TrustBuilderItem(
                label: 'Easy returns', icon: Icons.assignment_return_outlined),
          ],
        ),
        // Hero carousel — backend-managed banners, governed fallback when absent.
        PinCarousel(
          height: 128,
          children: <Widget>[
            for (final banner in (banners.isEmpty ? _fallback : banners))
              _HeroBanner(
                title: banner.title,
                subtitle: banner.body ?? '',
                color: _themeColor(colors, banner.themeKey),
                onTap: onBannerTap == null
                    ? null
                    : () => onBannerTap!(banner),
              ),
          ],
        ),
      ],
    );
  }
}

class _HeroBanner extends StatelessWidget {
  const _HeroBanner({
    required this.title,
    required this.subtitle,
    required this.color,
    this.onTap,
  });
  final String title;
  final String subtitle;
  final Color color;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors =
        Theme.of(context).extension<AgencyColors>() ?? AgencyColors.light;
    return Material(
      color: color,
      clipBehavior: Clip.antiAlias,
      borderRadius: BorderRadius.circular(AgencyRadius.lg),
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(AgencySpacing.md),
          child: Row(
            children: <Widget>[
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.center,
                  mainAxisSize: MainAxisSize.min,
                  children: <Widget>[
                    Text(title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w700,
                            color: colors.contentInverse)),
                    const SizedBox(height: AgencySpacing.xs),
                    Text(subtitle,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                            fontSize: 12,
                            color: colors.contentInverse
                                .withValues(alpha: 0.9))),
                  ],
                ),
              ),
              Icon(Icons.arrow_forward_ios,
                  size: 14, color: colors.contentInverse),
            ],
          ),
        ),
      ),
    );
  }
}

/// Single-select, horizontally scrollable category chips for the home
/// "Browse Categories" rail.
///
/// The first chip is always **All** (represented by a null [selected]); picking
/// any other chip filters only the Recommended-for-You composition — it never
/// affects Flash Deals, Best Sellers or the promotional banners.
class HomeCategoryFilterBar extends StatelessWidget {
  const HomeCategoryFilterBar({
    required this.categories,
    required this.onSelected,
    this.selected,
    super.key,
  });

  /// Selectable category labels, excluding the implicit "All".
  final List<String> categories;

  /// The currently selected label, or null for "All".
  final String? selected;

  /// Called with the new label, or null when "All" is chosen.
  final ValueChanged<String?> onSelected;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 40,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: categories.length + 1,
        separatorBuilder: (_, __) => const SizedBox(width: AgencySpacing.sm),
        itemBuilder: (context, index) {
          if (index == 0) {
            return TradeFilterChip(
              label: 'All',
              selected: selected == null,
              onTap: () => onSelected(null),
            );
          }
          final label = categories[index - 1];
          return TradeFilterChip(
            label: label,
            selected: selected == label,
            onTap: () => onSelected(label),
          );
        },
      ),
    );
  }
}
