import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:prototype_app/widgets/home_banner_carousel.dart';

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

  testWidgets('the card uses the phone width instead of a fixed 310 box',
      (tester) async {
    await tester.pumpWidget(_host(
      const HomeBannerCarousel(banners: homeFallbackBanners),
      width: 390,
    ));

    final width = tester.getSize(find.byType(PageView)).width;
    expect(width, greaterThan(310),
        reason: 'the side margins should belong to the card, not be left empty');
    expect(width, lessThanOrEqualTo(390));
  });

  testWidgets('a peek stub marks that more banners exist on that side',
      (tester) async {
    await tester.pumpWidget(_host(
      const HomeBannerCarousel(banners: homeFallbackBanners),
    ));

    expect(find.byKey(const ValueKey<String>('home-banner-peek-right')),
        findsOneWidget);
    expect(find.byKey(const ValueKey<String>('home-banner-peek-left')),
        findsNothing,
        reason: 'there is nothing to the left of the first banner');

    await tester.drag(find.byType(PageView), const Offset(-320, 0));
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey<String>('home-banner-peek-left')),
        findsOneWidget);
  });
}
