import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:prototype_app/widgets/home_banner_carousel.dart';
import 'package:prototype_app/widgets/home_header.dart';

void main() {
  testWidgets('HomeHeader renders location, trust and the banner carousel',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
      theme: AgencyTheme.light(),
      home: const Scaffold(
        body: SingleChildScrollView(child: HomeHeader()),
      ),
    ));
    expect(find.textContaining('Deliver to'), findsOneWidget);
    expect(find.text('GST invoices'), findsOneWidget);
    expect(find.text('Verified sellers'), findsOneWidget);
    expect(find.byType(HomeBannerCarousel), findsOneWidget);
    // The search field moved into the pinned bar; the header must not duplicate it.
    expect(find.text('Search products, brands, sellers'), findsNothing);
    // The old hero text tiles are gone.
    expect(find.byType(PinCarousel), findsNothing);
    expect(find.byType(CategoryIconRail), findsNothing);
  });

  testWidgets('HomeHeader falls back to the config banners, not invented copy',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
      theme: AgencyTheme.light(),
      home: const Scaffold(
        body: SingleChildScrollView(child: HomeHeader()),
      ),
    ));
    expect(find.text('BULK ORDERS'), findsOneWidget);
    expect(find.text('Buy more, save more'), findsOneWidget);
    expect(find.text('Special rates for [QTY]+ orders'), findsOneWidget);
  });

  testWidgets('the header paints its backdrop without semantics',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
      theme: AgencyTheme.light(),
      home: const Scaffold(
        body: SingleChildScrollView(child: HomeHeader()),
      ),
    ));
    final backdrop = find.byWidgetPredicate(
      (widget) =>
          widget is CustomPaint && widget.painter is HomeHeaderBackdropPainter,
    );
    expect(backdrop, findsOneWidget);
    expect(
      find.ancestor(of: backdrop, matching: find.byType(ExcludeSemantics)),
      findsOneWidget,
      reason: 'the wave decoration must never reach a screen reader',
    );
    expect(
      find.ancestor(of: backdrop, matching: find.byType(RepaintBoundary)),
      findsWidgets,
    );
  });

  testWidgets('HomeCategoryFilterBar is single-select with an All chip',
      (tester) async {
    String? selected;
    await tester.pumpWidget(MaterialApp(
      theme: AgencyTheme.light(),
      home: Scaffold(
        body: HomeCategoryFilterBar(
          categories: const <String>['Bathroom', 'Tiles', 'Electrical'],
          onSelected: (label) => selected = label,
        ),
      ),
    ));
    expect(find.text('All'), findsOneWidget);
    expect(find.text('Bathroom'), findsOneWidget);
    expect(find.text('Tiles'), findsOneWidget);

    await tester.tap(find.text('Tiles'));
    expect(selected, 'Tiles');

    await tester.tap(find.text('All'));
    expect(selected, isNull);
  });
}
