import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

Widget host(Widget child) => MaterialApp(
      theme: AgencyTheme.light(),
      home: Scaffold(
        body: SingleChildScrollView(
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 360),
              child: child,
            ),
          ),
        ),
      ),
    );

Widget responsiveHost(double width, Widget child) => MaterialApp(
      theme: AgencyTheme.light(),
      home: Scaffold(
        body: Align(
          alignment: Alignment.topLeft,
          child: SizedBox(
            width: width,
            child: SingleChildScrollView(child: child),
          ),
        ),
      ),
    );

void main() {
  testWidgets('SectionHeader renders title, tag and See All', (tester) async {
    await tester.pumpWidget(
      host(const SectionHeader(title: 'Flash Deals', tag: 'Up to 60% OFF')),
    );
    expect(find.text('Flash Deals'), findsOneWidget);
    expect(find.text('Up to 60% OFF'), findsOneWidget);
    expect(find.text('See All'), findsOneWidget);
  });

  testWidgets('ProductGrid renders its children', (tester) async {
    await tester.pumpWidget(host(const ProductGrid(children: <Widget>[
      Text('A'),
      Text('B'),
      Text('C'),
      Text('D'),
    ])));
    expect(find.text('A'), findsOneWidget);
    expect(find.text('D'), findsOneWidget);
  });

  testWidgets('ProductCompositionSection renders regular + split slot',
      (tester) async {
    await tester.pumpWidget(
      host(ProductCompositionSection(
        regularProducts: const <Widget>[Text('P1'), Text('P2')],
        specialSlot: const SplitMerchandisingTile(
          sectionLabel: 'Recently viewed',
          children: <Widget>[Text('X'), Text('Y')],
        ),
      )),
    );
    expect(find.text('P1'), findsOneWidget);
    expect(find.text('Recently viewed'), findsOneWidget);
    expect(find.text('X'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('ProductCompositionSection uses two phone columns',
      (tester) async {
    await tester.pumpWidget(
      responsiveHost(
        320,
        ProductCompositionSection(
          regularProducts: const <Widget>[
            SizedBox(key: Key('p1')),
            SizedBox(key: Key('p2')),
            SizedBox(key: Key('p3')),
            SizedBox(key: Key('p4')),
            SizedBox(key: Key('p5')),
          ],
          specialSlot: const SizedBox(key: Key('split')),
        ),
      ),
    );

    expect(tester.getTopLeft(find.byKey(const Key('p1'))).dy,
        tester.getTopLeft(find.byKey(const Key('p2'))).dy);
    expect(tester.getTopLeft(find.byKey(const Key('p3'))).dy,
        greaterThan(tester.getTopLeft(find.byKey(const Key('p1'))).dy));
    expect(tester.takeException(), isNull);
  });

  testWidgets('ProductCompositionSection uses three tablet columns',
      (tester) async {
    await tester.pumpWidget(
      responsiveHost(
        768,
        ProductCompositionSection(
          regularProducts: const <Widget>[
            SizedBox(key: Key('p1')),
            SizedBox(key: Key('p2')),
            SizedBox(key: Key('p3')),
            SizedBox(key: Key('p4')),
            SizedBox(key: Key('p5')),
          ],
          specialSlot: const SizedBox(key: Key('split')),
        ),
      ),
    );

    final firstRowY = tester.getTopLeft(find.byKey(const Key('p1'))).dy;
    expect(tester.getTopLeft(find.byKey(const Key('p2'))).dy, firstRowY);
    expect(tester.getTopLeft(find.byKey(const Key('p3'))).dy, firstRowY);
    expect(tester.getTopLeft(find.byKey(const Key('p4'))).dy,
        greaterThan(firstRowY));
    expect(tester.takeException(), isNull);
  });

  testWidgets('CompactProductItem renders title, price and discount',
      (tester) async {
    await tester.pumpWidget(
      host(const CompactProductItem(
        title: 'Drill Bit Set',
        priceLabel: '₹299',
        discountLabel: '38% off',
      )),
    );
    expect(find.text('Drill Bit Set'), findsOneWidget);
    expect(find.text('₹299'), findsOneWidget);
    expect(find.text('38% off'), findsOneWidget);
  });

  testWidgets('ProductCard large variant renders brand, MRP and discount',
      (tester) async {
    await tester.pumpWidget(
      host(const ProductCard(
        title: 'Drill Kit',
        priceLabel: '₹6,499',
        previousPriceLabel: '₹7,999',
        discountLabel: '19% off',
        brand: 'BuildPro',
        variant: ProductCardVariant.large,
      )),
    );
    expect(find.text('Drill Kit'), findsOneWidget);
    // Price and MRP render on one ellipsizing line (compact tile).
    expect(find.textContaining('₹6,499', findRichText: true), findsOneWidget);
    expect(find.textContaining('₹7,999', findRichText: true), findsOneWidget);
    expect(find.text('19% off'), findsOneWidget);
    expect(find.text('BuildPro'), findsOneWidget);
  });

  testWidgets('compact ProductCard shows a Cart-Plus action when onAddToCart is set',
      (tester) async {
    await tester.pumpWidget(
      host(const SizedBox(
        width: 160,
        child: ProductCard(
          title: 'Drill Kit',
          priceLabel: '₹6,499',
          variant: ProductCardVariant.compact,
          onAddToCart: _noop,
        ),
      )),
    );
    expect(find.byType(CartPlusIconButton), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('large ProductCard uses a compact Cart-Plus, not a full-width Add',
      (tester) async {
    await tester.pumpWidget(
      host(const SizedBox(
        width: 200,
        child: ProductCard(
          title: 'Drill Kit',
          priceLabel: '₹6,499',
          variant: ProductCardVariant.large,
          onAddToCart: _noop,
        ),
      )),
    );
    expect(find.byType(CartPlusIconButton), findsOneWidget);
    expect(find.text('Add to Cart'), findsNothing);
    expect(tester.takeException(), isNull);
  });
}

void _noop() {}
