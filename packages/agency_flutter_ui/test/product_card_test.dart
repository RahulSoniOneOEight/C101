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

void main() {
  testWidgets('ProductCard renders governed states', (tester) async {
    await tester.pumpWidget(host(const ProductCard(
        title: 'Reference Product',
        priceLabel: '₹1,499',
        previousPriceLabel: '₹1,999',
        state: CommerceFixture.discounted)));
    expect(find.text('Reference Product'), findsOneWidget);
    // Price and MRP are separate lines so the MRP is never ellipsized.
    expect(find.textContaining('₹1,499', findRichText: true), findsOneWidget);
    expect(find.text('MRP ₹1,999'), findsOneWidget);
    await tester.pumpWidget(host(const ProductCard(
        title: 'Reference Product',
        priceLabel: '₹1,999',
        state: CommerceFixture.outOfStock)));
    // U-007 removes the B2C stock line; the add control carries the state.
    expect(find.text('Out of stock'), findsNothing);
    expect(find.text('Reference Product'), findsOneWidget);
  });

  testWidgets('ProductCard caps badges at two and shows the overflow count',
      (tester) async {
    await tester.pumpWidget(host(const ProductCard(
      title: 'Reference Product',
      priceLabel: '₹1,499',
      badges: <String>['Assured', 'Flash Deal', 'New'],
    )));
    expect(find.text('Assured'), findsOneWidget);
    expect(find.text('Flash Deal'), findsOneWidget);
    expect(find.text('New'), findsNothing);
    expect(find.text('+1'), findsOneWidget);
  });

  testWidgets('ProductCard omits MRP and discount when no real list price',
      (tester) async {
    await tester.pumpWidget(host(const ProductCard(
      title: 'Reference Product',
      priceLabel: '₹1,499',
      discountLabel: null,
    )));
    expect(find.textContaining('MRP', findRichText: true), findsNothing);
  });

  testWidgets('ProductCard has no card-level chat action', (tester) async {
    final semantics = tester.ensureSemantics();
    var discussed = false;
    await tester.pumpWidget(host(ProductCard(
      title: 'Reference Product',
      priceLabel: '₹1,499',
      onDiscuss: () => discussed = true,
    )));
    expect(find.bySemanticsLabel('Discuss'), findsNothing);
    expect(discussed, isFalse);
    semantics.dispose();
  });

  testWidgets('CategoryRail covers default and empty', (tester) async {
    await tester.pumpWidget(
        host(const CategoryRail(categories: ['Beauty', 'Wellness'])));
    expect(find.text('Beauty'), findsOneWidget);
    await tester.pumpWidget(
        host(const CategoryRail(categories: [], state: CommerceFixture.empty)));
    expect(find.text('No categories'), findsOneWidget);
  });

  testWidgets('ProductCard fills a bounded cell and keeps the U-007 fallback',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
      theme: AgencyTheme.light(),
      home: Scaffold(
        body: Center(
          child: SizedBox(
            width: 175,
            height: 273,
            child: const ProductCard(
                title: 'Reference Product', priceLabel: '₹1,499'),
          ),
        ),
      ),
    ));
    var size = tester.getSize(find.byType(ProductCard));
    expect(size.width, 175);
    expect(size.height, 273);
    expect(tester.takeException(), isNull);

    // Unbounded parent (standalone / scroll view) keeps the 260 compact height.
    await tester.pumpWidget(
        host(const ProductCard(title: 'Reference Product', priceLabel: '₹1,499')));
    size = tester.getSize(find.byType(ProductCard));
    expect(size.height, 260);

    // The large variant keeps its 320 fallback when unconstrained.
    await tester.pumpWidget(host(const ProductCard(
        title: 'Reference Product',
        priceLabel: '₹1,499',
        variant: ProductCardVariant.large)));
    size = tester.getSize(find.byType(ProductCard));
    expect(size.height, 320);
  });

  testWidgets('ProductCarousel derives the shared 0.64 rail height',
      (tester) async {
    await tester.pumpWidget(host(const ProductCarousel(
      children: <Widget>[SizedBox(key: Key('rail-item'))],
    )));
    final rail = tester.getSize(find.byType(ProductCarousel));
    expect(rail.height, closeTo(152 / 0.64, 0.01));
    expect(tester.getSize(find.byKey(const Key('rail-item'))).width, 152);
  });

  testWidgets('CategoryIconRail honours itemWidth and gap', (tester) async {
    await tester.pumpWidget(host(const CategoryIconRail(
      categories: <Category>[
        Category(label: 'All', icon: Icons.apps_outlined),
        Category(label: 'Paints', icon: Icons.format_paint_outlined),
      ],
      itemWidth: 64,
      gap: AgencySpacing.sm,
    )));
    final first = tester.getRect(find.byType(CategoryIconItem).first);
    final second = tester.getRect(find.byType(CategoryIconItem).at(1));
    expect(first.width, 64);
    expect(second.left - first.right, AgencySpacing.sm);
  });

  testWidgets('B2BQuickOrder renders semantic order table', (tester) async {
    await tester.pumpWidget(host(const B2BQuickOrder(
        lines: [QuickOrderLine(sku: 'SKU-1', name: 'Product', quantity: 2)])));
    expect(find.text('SKU-1'), findsOneWidget);
    expect(find.text('Product'), findsNWidgets(2));
    expect(find.text('2'), findsOneWidget);
  });

  testWidgets('DashboardKpi and ExceptionTable render', (tester) async {
    await tester.pumpWidget(
        host(const DashboardKpi(label: 'Net sales', value: '₹12.4L')));
    expect(find.text('Net sales'), findsOneWidget);
    await tester.pumpWidget(host(const ExceptionTable(items: [
      ExceptionItem(id: 'EX-1', summary: 'Settlement mismatch', status: 'Open')
    ])));
    expect(find.text('Settlement mismatch'), findsOneWidget);
  });

  testWidgets('expanded commerce patterns render', (tester) async {
    await tester.pumpWidget(host(const FilterBar(
        filters: ['In stock', 'Fast delivery'], selected: {'In stock'})));
    expect(find.text('Clear'), findsOneWidget);
    await tester.pumpWidget(host(const CheckoutSummary(
        subtotal: '₹2,499', shipping: '₹99', total: '₹2,598')));
    expect(find.text('Continue checkout'), findsOneWidget);
    await tester.pumpWidget(host(
        const NavigationMenu(items: ['Home', 'Catalog'], current: 'Catalog')));
    expect(find.text('Catalog'), findsOneWidget);
    await tester.pumpWidget(host(const FormSection(
        label: 'Email', value: 'bad', state: CommerceFixture.validationError)));
    expect(find.text('Check this value'), findsOneWidget);
  });
}
