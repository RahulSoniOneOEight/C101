import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';

import '../domain/presentation.dart';
import 'home_banner_carousel.dart';

/// The B2C home header stack: location → trust row → banner carousel, over a navy gradient.
///
/// The gradient fades into the page surface at the bottom, so the products section that follows reads
/// as the same sheet rather than a separate card. Everything drawn here is presentation: the banner
/// copy comes from published CMS banners, with the governed [homeFallbackBanners] config as the only
/// fallback. The title row and search field live in the pinned bar that overlays this header.
class HomeHeader extends StatelessWidget {
  const HomeHeader({
    this.locationLabel = 'Bhiwadi, Rajasthan 301019',
    this.banners = const <StorefrontBanner>[],
    this.onLocation,
    this.onBannerAction,
    this.topInset = 0,
    this.bottomInset = 0,
    super.key,
  });

  /// Fixed header height. The pinned bar height is measured by the screen, not assumed here.
  static const double height = 432;

  /// Space reserved for the pinned bar so header content never sits underneath it.
  final double topInset;

  /// Space reserved for the products sheet that rides up over the gradient, so the carousel dots
  /// are not hidden under it.
  final double bottomInset;

  final String locationLabel;

  /// Published hero banners for this surface, already priority-ordered by the backend.
  final List<StorefrontBanner> banners;

  final VoidCallback? onLocation;

  /// Follows a banner's backend action target.
  final ValueChanged<String>? onBannerAction;

  List<HomeBannerContent> get _contents {
    final published = banners.where((banner) => banner.title.trim().isNotEmpty);
    if (published.isEmpty) return homeFallbackBanners;

    return <HomeBannerContent>[
      for (final banner in published)
        HomeBannerContent(
          contentKey: banner.contentKey,
          headline: banner.title,
          subline: banner.body,
          ctaLabel: banner.actionLabel,
          actionUri: banner.actionUri,
          // No eyebrow: the CMS banner has no eyebrow field, and inventing a label here would be
          // customer copy the operator never authored.
        ),
    ];
  }

  void _handleCta(BuildContext context, HomeBannerContent content) {
    final uri = content.actionUri;
    if (uri == null || uri.isEmpty) return;
    onBannerAction?.call(uri);
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.homePalette;
    final contents = _contents;
    final chipInk = Colors.white.withValues(alpha: 0.85);

    return SizedBox(
      height: height,
      width: double.infinity,
      child: Stack(
        children: <Widget>[
          Positioned.fill(
            child: RepaintBoundary(
              child: ExcludeSemantics(
                child: CustomPaint(
                  painter: HomeHeaderBackdropPainter(palette: palette),
                ),
              ),
            ),
          ),
          Padding(
            padding: EdgeInsets.only(
              top: topInset + AgencySpacing.sm,
              left: AgencySpacing.md,
              right: AgencySpacing.md,
              bottom: bottomInset + AgencySpacing.sm,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                _LocationRow(
                  label: locationLabel,
                  onTap: onLocation,
                  ink: Colors.white,
                  minHeight: 48,
                ),
                const SizedBox(height: AgencySpacing.sm),
                TrustBuilderRow(
                  padding: EdgeInsets.zero,
                  foregroundColor: chipInk,
                  items: const <TrustBuilderItem>[
                    TrustBuilderItem(
                      label: 'GST invoices',
                      icon: Icons.receipt_long_outlined,
                    ),
                    TrustBuilderItem(
                      label: 'Verified sellers',
                      icon: Icons.verified_outlined,
                    ),
                    TrustBuilderItem(
                      label: 'Easy returns',
                      icon: Icons.assignment_return_outlined,
                    ),
                  ],
                ),
                const SizedBox(height: AgencySpacing.sm),
                // The banner takes every remaining pixel, so the header has no dead band between the
                // location row and the trust chips.
                Expanded(
                  child: HomeBannerCarousel(
                    banners: contents,
                    onBannerCta: (content) => _handleCta(context, content),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// "Deliver to" row. A full 48dp tap target, white on the navy gradient.
class _LocationRow extends StatelessWidget {
  const _LocationRow({
    required this.label,
    required this.ink,
    this.onTap,
    this.minHeight = 48,
  });

  final String label;
  final Color ink;
  final VoidCallback? onTap;
  final double minHeight;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AgencyRadius.sm),
      child: ConstrainedBox(
        constraints: BoxConstraints(minHeight: minHeight),
        child: Row(
          children: <Widget>[
            Icon(Icons.location_on_outlined, size: 18, color: ink),
            const SizedBox(width: AgencySpacing.xs),
            Expanded(
              child: Text(
                'Deliver to · $label',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: ink,
                ),
              ),
            ),
            Icon(Icons.expand_more, size: 18, color: ink),
          ],
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
  final ValueChanged<String?>? onSelected;

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
              onTap: () => onSelected?.call(null),
            );
          }
          final label = categories[index - 1];
          return TradeFilterChip(
            label: label,
            selected: selected == label,
            onTap: () => onSelected?.call(label),
          );
        },
      ),
    );
  }
}
