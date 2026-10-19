import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import 'notification_bell.dart';

/// The pinned Home bar: title row plus search field.
///
/// It starts transparent over the navy gradient and settles into the page surface as the products
/// section arrives. Only the colours rebuild: the title row is passed as [ValueListenableBuilder]'s
/// child so scrolling never rebuilds the bell, the action icons or the search field's subtree.
class HomePinnedBar extends StatelessWidget {
  const HomePinnedBar({
    required this.progress,
    required this.cartCount,
    required this.onSearch,
    required this.onCart,
    required this.onTrade,
    super.key,
  });

  /// 0 at the top, 1 when the products section has fully arrived.
  final ValueListenable<double> progress;

  final int cartCount;
  final VoidCallback onSearch;
  final VoidCallback onCart;
  final VoidCallback onTrade;

  static const double titleRowHeight = 56;
  static const double searchFieldHeight = 48;
  static const double searchRadius = 12;
  static const double progressLineHeight = 2;

  /// Above this point the bar is light and the content flips from white to ink.
  static const double lightThreshold = 0.5;

  /// Above this point the progress line and shadow appear.
  static const double settledThreshold = 0.9;

  @override
  Widget build(BuildContext context) {
    final palette = context.homePalette;
    final topPadding = MediaQuery.paddingOf(context).top;

    return ValueListenableBuilder<double>(
      valueListenable: progress,
      child: _TitleRow(
        cartCount: cartCount,
        onCart: onCart,
        onTrade: onTrade,
      ),
      builder: (context, t, child) {
        final light = t >= lightThreshold;
        final foreground = light ? palette.ink : Colors.white;
        final settled = t > settledThreshold;

        return Container(
          key: const ValueKey<String>('home-bar-surface'),
          padding: EdgeInsets.only(top: topPadding),
          decoration: BoxDecoration(
            color: palette.surface.withValues(alpha: t),
            boxShadow: settled
                ? <BoxShadow>[
                    BoxShadow(
                      color: palette.ink.withValues(alpha: 0.10),
                      blurRadius: 12,
                      offset: const Offset(0, 2),
                    ),
                  ]
                : null,
          ),
          child: Stack(
            children: <Widget>[
              Column(
                mainAxisSize: MainAxisSize.min,
                children: <Widget>[
                  IconTheme.merge(
                    data: IconThemeData(color: foreground, size: 22),
                    child: DefaultTextStyle.merge(
                      style: TextStyle(color: foreground),
                      child: child!,
                    ),
                  ),
                  _SearchField(
                    onTap: onSearch,
                    palette: palette,
                    borderColor: light ? palette.barBorder : Colors.transparent,
                  ),
                  // Reserve the line's height so the bar never jumps when it appears.
                  const SizedBox(height: progressLineHeight),
                ],
              ),
              if (settled)
                Positioned(
                  left: 0,
                  right: 0,
                  bottom: 0,
                  child: Container(
                    key: const ValueKey<String>('home-bar-progress-line'),
                    height: progressLineHeight,
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        colors: <Color>[
                          palette.barLineStart,
                          palette.barLineEnd,
                        ],
                      ),
                    ),
                  ),
                ),
            ],
          ),
        );
      },
    );
  }
}

class _TitleRow extends StatelessWidget {
  const _TitleRow({
    required this.cartCount,
    required this.onCart,
    required this.onTrade,
  });

  final int cartCount;
  final VoidCallback onCart;
  final VoidCallback onTrade;

  @override
  Widget build(BuildContext context) {
    final palette = context.homePalette;
    return SizedBox(
      height: HomePinnedBar.titleRowHeight,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: AgencySpacing.xs),
        child: Row(
          children: <Widget>[
            const SizedBox(width: AgencySpacing.sm),
            const Text(
              'BuildKart',
              style: TextStyle(
                fontSize: 20,
                height: 1.2,
                fontWeight: FontWeight.w700,
              ),
            ),
            const Spacer(),
            BadgeTheme(
              data: BadgeThemeData(
                backgroundColor: palette.alert,
                textColor: Colors.white,
              ),
              child: const NotificationBell(),
            ),
            IconButton(
              tooltip: 'B2B trade',
              onPressed: onTrade,
              icon: const Icon(Icons.business_outlined),
            ),
            IconButton(
              tooltip: 'Cart',
              onPressed: onCart,
              icon: cartCount > 0
                  ? Badge(
                      isLabelVisible: true,
                      backgroundColor: palette.alert,
                      textColor: Colors.white,
                      label: Text('$cartCount'),
                      child: const Icon(Icons.shopping_cart_outlined),
                    )
                  : const Icon(Icons.shopping_cart_outlined),
            ),
            const SizedBox(width: AgencySpacing.xs),
          ],
        ),
      ),
    );
  }
}

/// A tappable search affordance. White in both bar states, as specified.
class _SearchField extends StatelessWidget {
  const _SearchField({
    required this.onTap,
    required this.palette,
    required this.borderColor,
  });

  final VoidCallback onTap;
  final AgencyHomePalette palette;
  final Color borderColor;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AgencySpacing.md,
        0,
        AgencySpacing.md,
        AgencySpacing.xs,
      ),
      child: Material(
        color: Colors.white,
        borderRadius: BorderRadius.circular(HomePinnedBar.searchRadius),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(HomePinnedBar.searchRadius),
          child: Container(
            height: HomePinnedBar.searchFieldHeight,
            padding: const EdgeInsets.symmetric(horizontal: AgencySpacing.sm),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(HomePinnedBar.searchRadius),
              border: Border.all(color: borderColor),
            ),
            child: Row(
              children: <Widget>[
                Icon(Icons.search, size: 18, color: palette.muted),
                const SizedBox(width: AgencySpacing.sm),
                Expanded(
                  child: Text(
                    'Search products, brands, sellers',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 13, color: palette.muted),
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
