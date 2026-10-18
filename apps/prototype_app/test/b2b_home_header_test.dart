import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:prototype_app/domain/presentation.dart';
import 'package:prototype_app/widgets/b2b_home_header.dart';
import 'package:prototype_app/widgets/home_banner_carousel.dart';

Widget _host(Widget child) => MaterialApp(
      theme: AgencyTheme.light(),
      home: Scaffold(body: SingleChildScrollView(child: child)),
    );

void main() {
  testWidgets('the trade header carries title, search and delivery site',
      (tester) async {
    await tester.pumpWidget(_host(const B2bHomeHeader()));

    expect(find.text('BuildKart Trade'), findsOneWidget);
    expect(find.text('Search the trade catalogue'), findsOneWidget);
    expect(find.textContaining('Deliver to'), findsOneWidget);
    expect(find.byType(B2bHomeHeader), findsOneWidget);
  });

  testWidgets('B2B never borrows the B2C seed when nothing is published',
      (tester) async {
    await tester.pumpWidget(_host(const B2bHomeHeader()));

    expect(find.text('BULK ORDERS'), findsNothing);
    expect(find.text('Buy more, save more'), findsNothing);
    expect(find.byType(HomeBannerCarousel), findsNothing);
  });

  testWidgets('B2B banners render, and none means no carousel', (tester) async {
    await tester.pumpWidget(_host(const B2bHomeHeader()));
    expect(find.text('B2B ONLY OFFER'), findsNothing);

    await tester.pumpWidget(_host(const B2bHomeHeader(
      banners: <StorefrontBanner>[
        StorefrontBanner(
          contentKey: 'b2b-hero',
          placement: 'b2b.home.hero',
          title: 'B2B ONLY OFFER',
          themeKey: 'primary',
        ),
      ],
    )));

    expect(find.text('B2B ONLY OFFER'), findsOneWidget);
  });

  testWidgets('the trade header fits the narrowest supported width',
      (tester) async {
    tester.view.physicalSize = const Size(320, 900);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(_host(const B2bHomeHeader(
      banners: <StorefrontBanner>[
        StorefrontBanner(
          contentKey: 'b2b-hero',
          placement: 'b2b.home.hero',
          title: 'Trade programme',
          themeKey: 'primary',
        ),
      ],
    )));
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
  });
}
