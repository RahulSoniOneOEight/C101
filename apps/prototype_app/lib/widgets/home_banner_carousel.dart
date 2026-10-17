import 'dart:math' as math;

import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';

/// One banner card in the home carousel.
///
/// Copy lives in [homeFallbackBanners] (or arrives from published CMS banners); widgets never spell
/// out marketing text themselves.
@immutable
class HomeBannerContent {
  const HomeBannerContent({
    required this.headline,
    this.eyebrow,
    this.subline,
    this.ctaLabel,
    this.actionUri,
    this.contentKey,
  });

  final String headline;
  final String? eyebrow;
  final String? subline;
  final String? ctaLabel;
  final String? actionUri;
  final String? contentKey;
}

/// Governed fallback copy, shown only when published CMS banners are unavailable.
///
/// Bracketed values are deliberate placeholders: they are not claims until someone confirms the
/// number or window. Nothing here states a discount, a percentage or a delivery threshold.
const List<HomeBannerContent> homeFallbackBanners = <HomeBannerContent>[
  HomeBannerContent(
    contentKey: 'bulk-orders',
    eyebrow: 'BULK ORDERS',
    headline: 'Buy more, save more',
    subline: 'Special rates for [QTY]+ orders',
    ctaLabel: 'Get bulk quote',
  ),
  HomeBannerContent(
    contentKey: 'verified-sellers',
    eyebrow: 'VERIFIED SELLERS',
    headline: 'GST invoice on every order',
    subline: 'Verified sellers. Clean bills for your books',
    ctaLabel: 'Start an order',
  ),
  HomeBannerContent(
    contentKey: 'easy-returns',
    eyebrow: 'EASY RETURNS',
    headline: 'Delivered safe. Returned easy.',
    subline: 'Breakage covered, [RETURN WINDOW] returns',
    ctaLabel: 'See how it works',
  ),
];

/// The home banner carousel: one navy card that fills the width and height it is given, gradient
/// side peeks and a dot indicator.
///
/// The carousel is presentation only. It renders the list it is given and reports the tapped card;
/// it never fetches, mutates or invents copy.
class HomeBannerCarousel extends StatefulWidget {
  const HomeBannerCarousel({
    required this.banners,
    this.onBannerCta,
    this.cardHeight,
    super.key,
  });

  final List<HomeBannerContent> banners;
  final ValueChanged<HomeBannerContent>? onBannerCta;

  /// Fixed card height. When null the card fills a bounded parent, so the header can award the
  /// leftover vertical space to the banner instead of leaving it empty.
  final double? cardHeight;

  static const double defaultCardHeight = 128;
  static const double minCardHeight = 120;
  static const double cardMaxHeight = 240;
  static const double cardMaxWidth = 480;
  static const double cardRadius = 20;
  static const double peekWidth = 14;

  /// Gap between the active card and a peek stub.
  static const double peekGap = 6;

  /// Dot row plus the gap above it, reserved from the carousel's height.
  static const double indicatorHeight = 14;

  @override
  State<HomeBannerCarousel> createState() => _HomeBannerCarouselState();
}

class _HomeBannerCarouselState extends State<HomeBannerCarousel> {
  final PageController _controller = PageController();
  int _page = 0;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.homePalette;
    if (widget.banners.isEmpty) return const SizedBox.shrink();

    return LayoutBuilder(
      builder: (context, constraints) {
        final available = constraints.maxWidth;
        // Reserve only a peek stub plus its gap on each side, so the card uses the full width of a
        // phone instead of sitting inside a fixed 310 box with unused margins.
        final reserve =
            (HomeBannerCarousel.peekWidth + HomeBannerCarousel.peekGap) * 2;
        final cardWidth = math.min(
          HomeBannerCarousel.cardMaxWidth,
          math.max(0.0, available - reserve),
        );

        // A bounded parent (the header) hands its leftover height to the card; otherwise the card
        // keeps the reviewed default.
        final bounded = constraints.hasBoundedHeight;
        final cardHeight = widget.cardHeight ??
            (bounded
                ? (constraints.maxHeight - HomeBannerCarousel.indicatorHeight)
                    .clamp(HomeBannerCarousel.minCardHeight,
                        HomeBannerCarousel.cardMaxHeight)
                : HomeBannerCarousel.defaultCardHeight);

        final cardLeft = (available - cardWidth) / 2;
        final cardRight = cardLeft + cardWidth;

        return Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            SizedBox(
              height: cardHeight,
              child: Stack(
                alignment: Alignment.center,
                children: <Widget>[
                  if (_page > 0)
                    Positioned(
                      left: cardLeft -
                          HomeBannerCarousel.peekWidth -
                          HomeBannerCarousel.peekGap,
                      top: 0,
                      child: _PeekCard(
                        key: const ValueKey<String>('home-banner-peek-left'),
                        palette: palette,
                        leftToRight: false,
                        height: cardHeight,
                      ),
                    ),
                  if (_page < widget.banners.length - 1)
                    Positioned(
                      left: cardRight + HomeBannerCarousel.peekGap,
                      top: 0,
                      child: _PeekCard(
                        key: const ValueKey<String>('home-banner-peek-right'),
                        palette: palette,
                        leftToRight: true,
                        height: cardHeight,
                      ),
                    ),
                  SizedBox(
                    width: cardWidth,
                    height: cardHeight,
                    child: PageView.builder(
                      controller: _controller,
                      itemCount: widget.banners.length,
                      onPageChanged: (index) => setState(() => _page = index),
                      itemBuilder: (context, index) => _HomeBannerCard(
                        content: widget.banners[index],
                        onCta: widget.onBannerCta,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: AgencySpacing.sm),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: <Widget>[
                for (var i = 0; i < widget.banners.length; i++)
                  AnimatedContainer(
                    duration: const Duration(milliseconds: 150),
                    margin: const EdgeInsets.symmetric(horizontal: 3),
                    width: i == _page ? 20 : 6,
                    height: 6,
                    decoration: BoxDecoration(
                      color: i == _page
                          ? palette.indigo
                          : palette.indigo.withValues(alpha: 0.35),
                      borderRadius: BorderRadius.circular(3),
                    ),
                  ),
              ],
            ),
          ],
        );
      },
    );
  }
}

/// A decorative gradient stub beside the active card. It signals that more banners exist without
/// rendering a second card's copy at an unreadable size.
class _PeekCard extends StatelessWidget {
  const _PeekCard({
    required this.palette,
    required this.leftToRight,
    required this.height,
    super.key,
  });

  final AgencyHomePalette palette;
  final bool leftToRight;
  final double height;

  @override
  Widget build(BuildContext context) {
    final colors = <Color>[palette.navy, palette.peek];
    return Container(
      width: HomeBannerCarousel.peekWidth,
      height: height - 24,
      margin: const EdgeInsets.symmetric(vertical: 12),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(HomeBannerCarousel.cardRadius),
        gradient: LinearGradient(
          begin: leftToRight ? Alignment.centerLeft : Alignment.centerRight,
          end: leftToRight ? Alignment.centerRight : Alignment.centerLeft,
          colors: leftToRight ? colors : colors.reversed.toList(),
        ),
      ),
    );
  }
}

class _HomeBannerCard extends StatelessWidget {
  const _HomeBannerCard({required this.content, this.onCta});

  final HomeBannerContent content;
  final ValueChanged<HomeBannerContent>? onCta;

  @override
  Widget build(BuildContext context) {
    final palette = context.homePalette;
    final eyebrow = content.eyebrow;
    final subline = content.subline;
    final ctaLabel = content.ctaLabel;

    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(HomeBannerCarousel.cardRadius),
        border: Border.all(color: palette.cardBorder),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(HomeBannerCarousel.cardRadius),
        child: Stack(
          fit: StackFit.expand,
          children: <Widget>[
            RepaintBoundary(
              child: ExcludeSemantics(
                child: CustomPaint(
                  painter: HomeBannerBackdropPainter(palette: palette),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(18, 12, 18, 10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.max,
                children: <Widget>[
                  if (eyebrow != null)
                    Text(
                      eyebrow,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 11,
                        height: 1.1,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 11 * 0.08,
                        color: palette.cyanSoft,
                      ),
                    ),
                  const SizedBox(height: 2),
                  Text(
                    content.headline,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 22,
                      height: 1.1,
                      fontWeight: FontWeight.w700,
                      color: Colors.white,
                    ),
                  ),
                  if (subline != null) ...<Widget>[
                    const SizedBox(height: 2),
                    Text(
                      subline,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 12,
                        height: 1.2,
                        color: Colors.white.withValues(alpha: 0.88),
                      ),
                    ),
                  ],
                  const Spacer(),
                  if (ctaLabel != null)
                    _BannerCta(
                      label: ctaLabel,
                      palette: palette,
                      onTap: onCta == null ? null : () => onCta!(content),
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

/// CTA pill: cyan→blue gradient with navy label.
class _BannerCta extends StatelessWidget {
  const _BannerCta({
    required this.label,
    required this.palette,
    this.onTap,
  });

  final String label;
  final AgencyHomePalette palette;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: Ink(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(999),
          gradient: LinearGradient(
            begin: Alignment.centerLeft,
            end: Alignment.centerRight,
            colors: <Color>[palette.cyan, palette.blue],
          ),
        ),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(999),
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 48),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Center(
                widthFactor: 1,
                child: Text(
                  label,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: palette.navy,
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
