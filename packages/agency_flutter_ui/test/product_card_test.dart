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
    await tester.pumpWidget(host(const ProductCard(title: 'Reference Product', priceLabel: '₹1,499', previousPriceLabel: '₹1,999', state: CommerceFixture.discounted)));
    expect(find.text('Reference Product'), findsOneWidget);
    // Price and MRP render on one ellipsizing line (compact tile).
    expect(find.textContaining('₹1,499', findRichText: true), findsOneWidget);
    expect(find.textContaining('₹1,999', findRichText: true), findsOneWidget);
    await tester.pumpWidget(host(const ProductCard(title: 'Reference Product', priceLabel: '₹1,999', state: CommerceFixture.outOfStock)));
    expect(find.text('Out of stock'), findsOneWidget);
  });

  testWidgets('CategoryRail covers default and empty', (tester) async {
    await tester.pumpWidget(host(const CategoryRail(categories: ['Beauty', 'Wellness'])));
    expect(find.text('Beauty'), findsOneWidget);
    await tester.pumpWidget(host(const CategoryRail(categories: [], state: CommerceFixture.empty)));
    expect(find.text('No categories'), findsOneWidget);
  });

  testWidgets('B2BQuickOrder renders semantic order table', (tester) async {
    await tester.pumpWidget(host(const B2BQuickOrder(lines: [QuickOrderLine(sku: 'SKU-1', name: 'Product', quantity: 2)])));
    expect(find.text('SKU-1'), findsOneWidget);
    expect(find.text('Product'), findsNWidgets(2));
    expect(find.text('2'), findsOneWidget);
  });

  testWidgets('DashboardKpi and ExceptionTable render', (tester) async {
    await tester.pumpWidget(host(const DashboardKpi(label: 'Net sales', value: '₹12.4L')));
    expect(find.text('Net sales'), findsOneWidget);
    await tester.pumpWidget(host(const ExceptionTable(items: [ExceptionItem(id: 'EX-1', summary: 'Settlement mismatch', status: 'Open')])));
    expect(find.text('Settlement mismatch'), findsOneWidget);
  });

  testWidgets('expanded commerce patterns render', (tester) async {
    await tester.pumpWidget(host(const FilterBar(filters: ['In stock', 'Fast delivery'], selected: {'In stock'})));
    expect(find.text('Clear'), findsOneWidget);
    await tester.pumpWidget(host(const CheckoutSummary(subtotal: '₹2,499', shipping: '₹99', total: '₹2,598')));
    expect(find.text('Continue checkout'), findsOneWidget);
    await tester.pumpWidget(host(const NavigationMenu(items: ['Home', 'Catalog'], current: 'Catalog')));
    expect(find.text('Catalog'), findsOneWidget);
    await tester.pumpWidget(host(const FormSection(label: 'Email', value: 'bad', state: CommerceFixture.validationError)));
    expect(find.text('Check this value'), findsOneWidget);
  });
}
