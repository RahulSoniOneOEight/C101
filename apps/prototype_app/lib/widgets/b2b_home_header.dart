import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';

import '../domain/presentation.dart';
import 'home_banner_carousel.dart';
import 'home_header.dart';

/// The B2B trade home header: the same navy treatment as B2C, with trade-specific actions.
///
/// It carries the title row, search, delivery site and B2B home banners. B2B banners are authored as
/// their own placement (`b2b.home.hero`), so B2C creatives never appear here; with none published the
/// header simply renders without a carousel.
class B2bHomeHeader extends StatelessWidget {
  const B2bHomeHeader({
    this.locationLabel = 'Bhiwadi, Rajasthan 301019',
    this.banners = const <StorefrontBanner>[],
    this.onSearch,
    this.onLocation,
    this.onNotifications,
    this.onCart,
    this.onAccount,
    this.notificationCount = 0,
    this.onBannerAction,
    super.key,
  });

  final String locationLabel;
  final List<StorefrontBanner> banners;
  final VoidCallback? onSearch;
  final VoidCallback? onLocation;
  final VoidCallback? onNotifications;
  final VoidCallback? onCart;
  final VoidCallback? onAccount;
  final int notificationCount;
  final ValueChanged<String>? onBannerAction;

  /// Fixed height, mirroring the B2C header so the products sheet can overlap it by 24.
  static double heightFor(BuildContext context, {required bool hasBanners}) {
    final safeTop = MediaQuery.paddingOf(context).top;
    return safeTop + baseHeight + (hasBanners ? bannerExtraHeight : 0);
  }

  static const double baseHeight = 208;
  static const double bannerExtraHeight = 184;

  @override
  Widget build(BuildContext context) {
    final palette = context.homePalette;
    final contents = bannerContentsFrom(banners, includeFallback: false);
    final showBanners = contents.isNotEmpty;
    final ink = Colors.white;
    final topPadding = MediaQuery.paddingOf(context).top;

    return SizedBox(
      height: heightFor(context, hasBanners: showBanners),
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
            padding: EdgeInsets.only(top: topPadding),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
              BadgeTheme(
                data: BadgeThemeData(
                  backgroundColor: palette.alert,
                  textColor: Colors.white,
                ),
                child: IconTheme.merge(
                  data: IconThemeData(color: ink, size: 22),
                  child: DefaultTextStyle.merge(
                    style: TextStyle(color: ink),
                    child: SizedBox(
                      height: 56,
                      child: Row(
                        children: <Widget>[
                          const SizedBox(width: AgencySpacing.md),
                          Expanded(
                            child: Text(
                              'BuildKart Trade',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                fontSize: 20,
                                height: 1.2,
                                fontWeight: FontWeight.w700,
                                color: ink,
                              ),
                            ),
                          ),
                          if (onNotifications != null)
                            IconButton(
                              onPressed: onNotifications,
                              tooltip: 'Notifications',
                              icon: notificationCount > 0
                                  ? Badge(
                                      isLabelVisible: true,
                                      label: Text('$notificationCount'),
                                      child:
                                          const Icon(Icons.notifications_none),
                                    )
                                  : const Icon(Icons.notifications_none),
                            ),
                          IconButton(
                            onPressed: onCart,
                            tooltip: 'Cart',
                            icon: const Icon(Icons.shopping_cart_outlined),
                          ),
                          IconButton(
                            onPressed: onAccount,
                            tooltip: 'Account',
                            icon: const Icon(Icons.person_outline),
                          ),
                          const SizedBox(width: AgencySpacing.xs),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(
                  AgencySpacing.md,
                  AgencySpacing.sm,
                  AgencySpacing.md,
                  AgencySpacing.sm,
                ),
                child: _B2bSearchField(
                  onTap: onSearch,
                  palette: palette,
                ),
              ),
              Padding(
                padding:
                    const EdgeInsets.symmetric(horizontal: AgencySpacing.md),
                child: HomeLocationRow(
                  label: locationLabel,
                  onTap: onLocation,
                  ink: ink,
                  minHeight: 44,
                ),
              ),
              if (showBanners) ...<Widget>[
                const SizedBox(height: AgencySpacing.sm),
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                        horizontal: AgencySpacing.md),
                    child: HomeBannerCarousel(
                      banners: contents,
                      cardHeight: 160,
                      onBannerCta: (content) {
                        final uri = content.actionUri;
                        if (uri == null || uri.isEmpty) return;
                        onBannerAction?.call(uri);
                      },
                    ),
                  ),
                ),
                const SizedBox(height: AgencySpacing.sm),
              ] else
                const Spacer(),
            ],
          ),
        ),
      ],
      ),
    );
  }
}

/// Search affordance, white on the gradient, matching the B2C field.
class _B2bSearchField extends StatelessWidget {
  const _B2bSearchField({required this.palette, this.onTap});

  final AgencyHomePalette palette;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          height: 48,
          padding: const EdgeInsets.symmetric(horizontal: AgencySpacing.sm),
          child: Row(
            children: <Widget>[
              Icon(Icons.search, size: 18, color: palette.muted),
              const SizedBox(width: AgencySpacing.sm),
              Expanded(
                child: Text(
                  'Search the trade catalogue',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 13, color: palette.muted),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
