import 'dart:async';
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
    this.autoAdvance,
    super.key,
  });

  final List<HomeBannerContent> banners;
  final ValueChanged<HomeBannerContent>? onBannerCta;

  /// Fixed card height. When null the card fills a bounded parent, so the header can award the
  /// leftover vertical space to the banner instead of leaving it empty.
  final double? cardHeight;

  /// How often the carousel advances by itself. Null or zero means it stays put. Authored per layout
  /// in the console, so no speed is hardcoded here.
  final Duration? autoAdvance;

  static const double defaultCardHeight = 128;
  static const double minCardHeight = 120;
  static const double cardMaxHeight = 300;
  static const double cardRadius = 20;

  /// The width the copy was designed at; type scales from here.
  static const double designWidth = 390;

  /// The height the copy was designed at. Scale follows the smaller of the two ratios so a short
  /// card shrinks its type instead of overflowing.
  static const double designHeight = 172;

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
  Timer? _autoAdvanceTimer;

  @override
  void initState() {
    super.initState();
    _restartAutoAdvance();
  }

  @override
  void didUpdateWidget(HomeBannerCarousel oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.autoAdvance != widget.autoAdvance ||
        oldWidget.banners.length != widget.banners.length) {
      _restartAutoAdvance();
    }
  }

  /// Rotation is a layout setting, never a constant: nothing moves when the interval is absent, zero,
  /// or when there is only one banner to show.
  void _restartAutoAdvance() {
    _autoAdvanceTimer?.cancel();
    final interval = widget.autoAdvance;
    if (interval == null || interval <= Duration.zero) return;
    if (widget.banners.length < 2) return;
    _autoAdvanceTimer = Timer.periodic(interval, (_) {
      if (!mounted || !_controller.hasClients) return;
      final next = (_page + 1) % widget.banners.length;
      _controller.animateToPage(
        next,
        duration: const Duration(milliseconds: 240),
        curve: Curves.easeInOut,
      );
    });
  }

  @override
  void dispose() {
    _autoAdvanceTimer?.cancel();
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

        // Type and padding scale with the card, but never beyond what the height can hold: a wide,
        // short card (the B2B header) would otherwise overflow its own content.
        final scale = math
            .min(
              cardWidth / HomeBannerCarousel.designWidth,
              cardHeight / HomeBannerCarousel.designHeight,
            )
            .clamp(0.8, 1.6);

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
                    // Strong only where the copy sits, then released, so the right-hand side of the
                    // creative keeps most of its original brightness.
                    colors: <Color>[
                      palette.navy.withValues(alpha: 0.88),
                      palette.navy.withValues(alpha: 0.55),
                      palette.navy.withValues(alpha: 0.10),
                    ],
                    stops: const <double>[0, 0.45, 1],
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
///
/// The pill is deliberately smaller than the tap target: 40dp tall visually, wrapped in a 48dp
/// high hit area (scaled with the card) so it stays comfortable to tap on a phone.
class _BannerCta extends StatelessWidget {
  const _BannerCta({
    required this.label,
    required this.palette,
    required this.scale,
    this.onTap,
  });

  static const double visualHeight = 40;
  static const double touchHeight = 48;

  final String label;
  final AgencyHomePalette palette;
  final double scale;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: touchHeight * scale,
      child: Align(
        alignment: Alignment.centerLeft,
        widthFactor: 1,
        child: Material(
          color: Colors.transparent,
          child: Ink(
            height: visualHeight * scale,
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
              child: Padding(
                padding: EdgeInsets.symmetric(horizontal: 14 * scale),
                child: Center(
                  widthFactor: 1,
                  child: Text(
                    label,
                    style: TextStyle(
                      fontSize: 11 * scale,
                      fontWeight: FontWeight.w700,
                      color: palette.navy,
                    ),
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
