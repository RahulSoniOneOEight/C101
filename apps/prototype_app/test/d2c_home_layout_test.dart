import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:prototype_app/widgets/home_header.dart';

/// Responsive guard for the D2C home layout. The client specs run on narrow
/// Android phones; 320 is the tightest supported logical width. We assert the
/// changed home sections never throw a RenderFlex overflow at any of the target
/// widths (320/334/360/390/400/430).
const List<double> _widths = <double>[320, 334, 360, 390, 400, 430];

void _surface(WidgetTester tester, double width) {
  tester.view.physicalSize = Size(width, 900);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);
}

Widget _card(int i, ProductCardVariant variant) => ProductCard(
      title: 'Ceramic Floor Tiles 600x600 Matt',
      priceLabel: '₹1,150',
      previousPriceLabel: '₹1,499',
      discountLabel: '23% off',
      brand: 'CERAMICA',
      badges: const <String>['Bestseller'],
      variant: variant,
      onAddToCart: () {},
    );

void main() {
  for (final width in _widths) {
    testWidgets('D2C home sections have no overflow at ${width.toInt()}px',
        (tester) async {
      _surface(tester, width);
      await tester.pumpWidget(MaterialApp(
        theme: AgencyTheme.light(),
        home: Scaffold(
          body: SingleChildScrollView(
            padding: const EdgeInsets.all(AgencySpacing.md),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                HomeHeader(onSearch: () {}, onLocation: () {}),
                const SizedBox(height: AgencySpacing.md),
                const SectionHeader(
                  title: 'Browse Categories',
                  seeAllLabel: 'View More',
                ),
                const SizedBox(height: AgencySpacing.sm),
                HomeCategoryFilterBar(
                  categories: const <String>[
                    'Bathroom',
                    'Tiles',
                    'Electrical',
                    'Agriculture',
                    'Pumps',
                  ],
                  onSelected: (_) {},
                ),
                const SizedBox(height: AgencySpacing.md),
                const SectionHeader(title: 'Recommended for You'),
                const SizedBox(height: AgencySpacing.sm),
                ProductCompositionSection(
                  mainAxisExtent: 296,
                  regularProducts: <Widget>[
                    for (var i = 0; i < 5; i++)
                      _card(i, ProductCardVariant.large),
                  ],
                  specialSlot: SplitMerchandisingTile(
                    sectionLabel: 'Recently viewed',
                    children: <Widget>[
                      for (var i = 0; i < 2; i++)
                        CompactProductItem(
                          title: 'CPVC Pipe 3/4 in',
                          priceLabel: '₹840',
                          discountLabel: '16% off',
                          onAdd: () {},
                        ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('compact ProductCard fits a swimlane at 320px', (tester) async {
    _surface(tester, 320);
    await tester.pumpWidget(MaterialApp(
      theme: AgencyTheme.light(),
      home: Scaffold(
        body: ProductCarousel(
          children: <Widget>[
            for (var i = 0; i < 3; i++) _card(i, ProductCardVariant.compact),
          ],
        ),
      ),
    ));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });
}
