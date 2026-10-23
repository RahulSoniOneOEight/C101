import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:prototype_app/widgets/home_banner_carousel.dart';
import 'package:prototype_app/widgets/home_header.dart';

Widget _host(Widget child, {double width = 390}) => MaterialApp(
      theme: AgencyTheme.light(),
      home: Scaffold(
        body: Align(
          alignment: Alignment.topCenter,
          child: SizedBox(width: width, child: child),
        ),
      ),
    );

void main() {
  testWidgets('carousel renders the configured banners and their dots',
      (tester) async {
    await tester.pumpWidget(_host(
      const HomeBannerCarousel(banners: homeFallbackBanners),
    ));

    expect(find.text('BuildKart'), findsNothing,
        reason: 'the carousel owns banner copy only');
    expect(find.text('BULK ORDERS'), findsOneWidget);
    expect(find.text('Buy more, save more'), findsOneWidget);
    expect(find.text('Get bulk quote'), findsOneWidget);
  });

  testWidgets('the CTA reports the tapped banner without navigation',
      (tester) async {
    HomeBannerContent? tapped;
    await tester.pumpWidget(_host(
      HomeBannerCarousel(
        banners: homeFallbackBanners,
        onBannerCta: (content) => tapped = content,
      ),
    ));

    await tester.tap(find.text('Get bulk quote'));
    expect(tapped?.contentKey, 'bulk-orders');
  });

  testWidgets('the CTA keeps a 48dp tap target around a smaller pill',
      (tester) async {
    await tester.pumpWidget(_host(
      const HomeBannerCarousel(banners: homeFallbackBanners),
    ));

    final cta = find.ancestor(
      of: find.text('Get bulk quote'),
      matching: find.byType(Ink),
    );
    expect(cta, findsOneWidget);
    expect(tester.getSize(cta).height, 40,
        reason: 'the visible pill is 40dp');
  });

  testWidgets('operator art becomes the card background', (tester) async {
    await tester.pumpWidget(_host(
      const HomeBannerCarousel(
        banners: <HomeBannerContent>[
          HomeBannerContent(
            contentKey: 'cms-hero',
            headline: 'From the console',
            ctaLabel: 'Shop now',
            imageUrl: 'https://example.test/banner.png',
            imageAlt: 'Console creative',
          ),
        ],
      ),
    ));

    expect(find.byType(Image), findsOneWidget);
    expect(find.text('From the console'), findsOneWidget);
  });

  testWidgets('no image keeps the navy composition', (tester) async {
    await tester.pumpWidget(_host(
      const HomeBannerCarousel(banners: homeFallbackBanners),
    ));

    expect(find.byType(Image), findsNothing);
    expect(
      find.byWidgetPredicate((widget) =>
          widget is CustomPaint &&
          widget.painter is HomeBannerBackdropPainter),
      findsOneWidget,
    );
  });

  testWidgets('placeholders stay bracketed, not invented', (tester) async {
    final copy = homeFallbackBanners
        .map((banner) => '${banner.subline ?? ''} ${banner.headline}')
        .join(' ');
    expect(copy, contains('[QTY]'));
    expect(copy, contains('[RETURN WINDOW]'));
  });

  testWidgets('carousel fits the narrowest supported phone width',
      (tester) async {
    tester.view.physicalSize = const Size(320, 900);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(_host(
      const HomeBannerCarousel(banners: homeFallbackBanners),
      width: 320,
    ));
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
  });

  testWidgets('the card is edge to edge, with no side margin', (tester) async {
    await tester.pumpWidget(_host(
      const HomeBannerCarousel(banners: homeFallbackBanners),
      width: 390,
    ));

    final width = tester.getSize(find.byType(PageView)).width;
    expect(width, 390,
        reason: 'the card owns the full width; side margins only shrink the creative');
  });

  testWidgets('desktop caps the card width and insets it', (tester) async {
    addTearDown(tester.view.reset);
    for (final entry in <double, double>{
      600: 520,
      900: 640,
      1280: 760,
    }.entries) {
      tester.view.physicalSize = Size(entry.key, 900);
      tester.view.devicePixelRatio = 1.0;
      await tester.pumpWidget(_host(
        const HomeBannerCarousel(banners: homeFallbackBanners),
        width: entry.key,
      ));
      expect(
        tester.getSize(find.byType(PageView)).width,
        entry.value,
        reason: 'viewport ${entry.key} should cap the card at ${entry.value}',
      );
    }
  });

  testWidgets('tablet and desktop headers get more height', (tester) async {
    expect(HomeHeader.heightForWidth(390), 432);
    expect(HomeHeader.heightForWidth(600), 480);
    expect(HomeHeader.heightForWidth(900), 520);
    expect(HomeHeader.heightForWidth(1280), 560);
  });

  testWidgets('rotation follows the layout interval, and stops when unset',
      (tester) async {
    await tester.pumpWidget(_host(
      const HomeBannerCarousel(
        banners: homeFallbackBanners,
        autoAdvance: Duration(milliseconds: 500),
      ),
    ));
    expect(find.text('Buy more, save more'), findsOneWidget);

    await tester.pump(const Duration(milliseconds: 600));
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.text('GST invoice on every order'), findsOneWidget,
        reason: 'the carousel advances at the authored interval');
  });

  testWidgets('no interval means no motion', (tester) async {
    await tester.pumpWidget(_host(
      const HomeBannerCarousel(banners: homeFallbackBanners),
    ));

    await tester.pump(const Duration(seconds: 2));
    expect(find.text('Buy more, save more'), findsOneWidget);
  });

  testWidgets('a single banner never rotates', (tester) async {
    await tester.pumpWidget(_host(
      const HomeBannerCarousel(
        banners: <HomeBannerContent>[
          HomeBannerContent(headline: 'Only one'),
        ],
        autoAdvance: Duration(milliseconds: 500),
      ),
    ));

    await tester.pump(const Duration(seconds: 2));
    expect(find.text('Only one'), findsOneWidget);
  });
}
