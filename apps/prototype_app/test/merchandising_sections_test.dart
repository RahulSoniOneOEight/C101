import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:prototype_app/domain/merchandising.dart';
import 'package:prototype_app/domain/models.dart';
import 'package:prototype_app/widgets/merchandising_sections.dart';

void main() {
  testWidgets('B2C home product tiles omit rating and delivery metadata',
      (tester) async {
    const product = Product(
      id: 'product-1',
      title: '18V Drill Kit',
      brand: 'BuildPro',
      price: Money(amount: 649900, currencyCode: 'INR'),
      rating: 4.5,
      reviewCount: 214,
      deliveryNote: 'Free · Monday',
    );
    const module = MerchandisingModule(
      type: MerchandisingModuleType.productCarousel,
      title: 'Featured',
      products: <Product>[product],
    );

    await tester.pumpWidget(
      MaterialApp(
        theme: AgencyTheme.light(),
        home: const Scaffold(
          body: SizedBox(
            width: 320,
            child: MerchandisingModuleView(module: module),
          ),
        ),
      ),
    );

    expect(find.text('18V Drill Kit'), findsOneWidget);
    expect(find.text('4.5'), findsNothing);
    expect(find.text('(214)'), findsNothing);
    expect(find.text('Free · Monday'), findsNothing);
    expect(tester.takeException(), isNull);
  });
}
