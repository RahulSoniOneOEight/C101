import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:prototype_app/widgets/home_header.dart';

void main() {
  testWidgets('HomeHeader renders location, search, trust and hero sections',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
      theme: AgencyTheme.light(),
      home: const Scaffold(
        body: SingleChildScrollView(child: HomeHeader()),
      ),
    ));
    expect(find.textContaining('Deliver to'), findsOneWidget);
    expect(find.text('Search products, brands, sellers'), findsOneWidget);
    expect(find.text('GST invoices'), findsOneWidget);
    expect(find.text('Verified sellers'), findsOneWidget);
    expect(find.text('Monsoon Ready'), findsOneWidget);
    expect(find.byType(PinCarousel), findsOneWidget);
    // The category rail now lives below the promotional banner, not the header.
    expect(find.byType(CategoryIconRail), findsNothing);
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
