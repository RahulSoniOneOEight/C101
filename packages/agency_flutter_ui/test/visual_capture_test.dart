import 'dart:io';

import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

Widget host(Widget child) => MaterialApp(
  theme: AgencyTheme.light(),
  home: Scaffold(body: Padding(padding: const EdgeInsets.all(16), child: child)),
);

final cases = <String, Widget>{
  'product-card': const ProductCard(title: 'Reference Product', priceLabel: '₹1,499', previousPriceLabel: '₹1,999', state: CommerceFixture.discounted),
  'category-rail': const CategoryRail(categories: ['New', 'Beauty', 'Wellness', 'Home']),
  'b2b-quick-order': const B2BQuickOrder(lines: [QuickOrderLine(sku: 'SKU-001', name: 'Reference Product', quantity: 12)]),
  'dashboard-kpi': const DashboardKpi(label: 'Net sales', value: '₹12.4L', trendLabel: '+8.2%'),
  'exception-table': const ExceptionTable(items: [ExceptionItem(id: 'EX-101', summary: 'Settlement mismatch', status: 'Open')]),
  'filter-bar': const FilterBar(filters: ['In stock', 'Fast delivery'], selected: {'In stock'}),
  'checkout-summary': const CheckoutSummary(subtotal: '₹2,499', shipping: '₹99', total: '₹2,598'),
  'navigation-menu': const NavigationMenu(items: ['Home', 'Catalog', 'Orders'], current: 'Catalog'),
  'form-section': const FormSection(label: 'Email', value: 'buyer@example.com', helper: 'Order updates are sent here'),
};

final viewports = <String, Size>{
  'mobile-390': const Size(390, 844),
  'tablet-768': const Size(768, 1024),
  'desktop-1440': const Size(1440, 1000),
};

void main() {
  final runVisualCapture = Platform.environment['RUN_VISUAL_CAPTURE'] == 'true';
  for (final entry in cases.entries) {
    for (final viewport in viewports.entries) {
      testWidgets('capture ' + entry.key + ' ' + viewport.key, (tester) async {
        await tester.binding.setSurfaceSize(viewport.value);
        addTearDown(() => tester.binding.setSurfaceSize(null));
        await tester.pumpWidget(host(entry.value));
        await tester.pumpAndSettle();
        await expectLater(
          find.byType(Scaffold),
          matchesGoldenFile('goldens/' + entry.key + '__' + viewport.key + '.png'),
        );
      }, skip: !runVisualCapture);
    }
  }
}
