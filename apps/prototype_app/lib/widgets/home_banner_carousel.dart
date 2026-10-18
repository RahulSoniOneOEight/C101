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
    this.imageUrl,
    this.imageAlt,
  });

  final String headline;
  final String? eyebrow;
  final String? subline;
  final String? ctaLabel;
  final String? actionUri;
  final String? contentKey;

  /// Operator-authored creative from the CMS. When present it is the card background; the navy
  /// gradient is the fallback when no art is published or the image fails to load.
  final String? imageUrl;

  /// CMS alternative text for [imageUrl].
  final String? imageAlt;
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
  static const double cardMaxHeight = 300;
  static const double cardRadius = 20;

  /// The width the copy was designed at; type scales from here.
  static const double designWidth = 390;

  static const double wideBreakpoint = 600;
  static const double wideInset = 24;

  /// Card width caps by viewport so the creative keeps a sane aspect ratio on large screens.
  static double cardWidthCapFor(double viewportWidth) {
    if (viewportWidth >= 1200) return 760;
    if (viewportWidth >= 900) return 640;
    if (viewportWidth >= wideBreakpoint) return 520;
    return double.infinity;
  }

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
        // Phones are edge to edge; wider viewports get a side inset and a cap so the card does not
        // stretch into an unreadable letterbox on desktop.
        final wide = available >= HomeBannerCarousel.wideBreakpoint;
        final inset = wide ? HomeBannerCarousel.wideInset : 0.0;
        final cap = HomeBannerCarousel.cardWidthCapFor(available);
        final cardWidth = math.min(available - inset * 2, cap);

        // A bounded parent (the header) hands its leftover height to the card; otherwise the card
        // keeps the reviewed default.
        final bounded = constraints.hasBoundedHeight;
        final cardHeight = widget.cardHeight ??
            (bounded
                ? (constraints.maxHeight - HomeBannerCarousel.indicatorHeight)
                    .clamp(HomeBannerCarousel.minCardHeight,
                        HomeBannerCarousel.cardMaxHeight)
                : HomeBannerCarousel.defaultCardHeight);

        // Type and padding scale with the card so the 390pt design still reads at 760pt.
        final scale = (cardWidth / HomeBannerCarousel.designWidth).clamp(1.0, 1.6);

        return Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            SizedBox(
              height: cardHeight,
              child: Center(
                child: SizedBox(
                  width: cardWidth,
                  height: cardHeight,
                  child: PageView.builder(
                    controller: _controller,
                    itemCount: widget.banners.length,
                    onPageChanged: (index) => setState(() => _page = index),
                    itemBuilder: (context, index) => _HomeBannerCard(
                      content: widget.banners[index],
                      scale: scale,
                      onCta: widget.onBannerCta,
                    ),
                  ),
                ),
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

class _HomeBannerCard extends StatelessWidget {
  const _HomeBannerCard({
    required this.content,
    required this.scale,
    this.onCta,
  });

  final HomeBannerContent content;

  /// Type/padding multiplier derived from the card width.
  final double scale;
  final ValueChanged<HomeBannerContent>? onCta;

  @override
  Widget build(BuildContext context) {
    final palette = context.homePalette;
    final eyebrow = content.eyebrow;
    final subline = content.subline;
    final ctaLabel = content.ctaLabel;
    final imageUrl = content.imageUrl;
    final hasImage = imageUrl != null && imageUrl.isNotEmpty;

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
            // Operator art wins; the navy composition is the fallback when nothing is published or
            // the image cannot be fetched.
            RepaintBoundary(
              child: ExcludeSemantics(
                child: CustomPaint(
                  painter: HomeBannerBackdropPainter(palette: palette),
                ),
              ),
            ),
            if (hasImage)
              Image.network(
                imageUrl,
                fit: BoxFit.cover,
                semanticLabel: content.imageAlt,
                errorBuilder: (_, __, ___) => const SizedBox.shrink(),
              ),
            if (hasImage)
              // Scrim keeps white copy at 4.5:1 over an arbitrary photograph. Derived from the navy
              // token, so the palette stays the only place a colour is defined.
              DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.centerLeft,
                    end: Alignment.centerRight,
                    colors: <Color>[
                      palette.navy.withValues(alpha: 0.90),
                      palette.navy.withValues(alpha: 0.70),
                      palette.navy.withValues(alpha: 0.40),
                    ],
                    stops: const <double>[0, 0.55, 1],
                  ),
                ),
              ),
            Padding(
              padding: EdgeInsets.fromLTRB(
                18 * scale,
                12 * scale,
                18 * scale,
                10 * scale,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.center,
                mainAxisSize: MainAxisSize.max,
                children: <Widget>[
                  if (eyebrow != null)
                    Text(
                      eyebrow,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 11 * scale,
                        height: 1.1,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 11 * 0.08 * scale,
                        color: palette.cyanSoft,
                      ),
                    ),
                  SizedBox(height: 2 * scale),
                  Text(
                    content.headline,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 22 * scale,
                      height: 1.1,
                      fontWeight: FontWeight.w700,
                      color: Colors.white,
                    ),
                  ),
                  if (subline != null) ...<Widget>[
                    SizedBox(height: 2 * scale),
                    Text(
                      subline,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 12 * scale,
                        height: 1.2,
                        color: Colors.white.withValues(alpha: 0.88),
                      ),
                    ),
                  ],
                  SizedBox(height: 12 * scale),
                  if (ctaLabel != null)
                    _BannerCta(
                      label: ctaLabel,
                      palette: palette,
                      scale: scale,
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
    required this.scale,
    this.onTap,
  });

  final String label;
  final AgencyHomePalette palette;
  final double scale;
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
            // Never below the 48dp touch minimum, and taller on a large card.
            constraints: BoxConstraints(minHeight: 48 * scale),
            child: Padding(
              padding: EdgeInsets.symmetric(horizontal: 16 * scale),
              child: Center(
                widthFactor: 1,
                child: Text(
                  label,
                  style: TextStyle(
                    fontSize: 12 * scale,
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
