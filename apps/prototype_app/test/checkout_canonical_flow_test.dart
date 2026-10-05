import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:prototype_app/data/experience_api.dart';
import 'package:prototype_app/data/local_store.dart';
import 'package:prototype_app/domain/models.dart';
import 'package:prototype_app/screens/checkout_screen.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _CheckoutExperienceApi extends ExperienceApi {
  _CheckoutExperienceApi() : super(Dio());

  int completeCalls = 0;
  int shippingSelections = 0;

  static const cart = Cart(
    id: 'cart_checkout',
    subtotal: Money(amount: 10000, currencyCode: 'INR'),
    total: Money(amount: 10000, currencyCode: 'INR'),
    items: [
      CartLineItem(id: 'line_1', title: 'Test cement', quantity: 1),
    ],
  );

  static const preparedCart = Cart(
    id: 'cart_checkout',
    subtotal: Money(amount: 10000, currencyCode: 'INR'),
    shippingTotal: Money(amount: 1200, currencyCode: 'INR'),
    total: Money(amount: 11200, currencyCode: 'INR'),
    items: [
      CartLineItem(id: 'line_1', title: 'Test cement', quantity: 1),
    ],
  );

  @override
  Future<List<ShippingOption>> listShippingOptions(String cartId) async =>
      const [
        ShippingOption(
          id: 'so_standard',
          sellerId: 'seller_1',
          name: 'Standard delivery',
          price: Money(amount: 500, currencyCode: 'INR'),
          providerId: 'manual_manual',
        ),
        ShippingOption(
          id: 'so_express',
          sellerId: 'seller_2',
          name: 'Express delivery',
          price: Money(amount: 700, currencyCode: 'INR'),
          providerId: 'manual_manual',
        ),
      ];

  @override
  Future<Cart> selectShippingMethod(String cartId, String optionId) async {
    shippingSelections++;
    return preparedCart;
  }

  @override
  Future<Cart> updateCartCustomerDetails(
    String cartId, {
    required String email,
    required Address shippingAddress,
  }) async {
    return preparedCart;
  }

  @override
  Future<Map<String, dynamic>> completeCart(String cartId) async {
    completeCalls++;
    return <String, dynamic>{
      'type': 'order_group',
      'order_group': <String, dynamic>{'id': 'og_test'},
      'payment': <String, dynamic>{
        'payment_mode': 'simulated',
        'test_data': true,
      },
    };
  }
}

void main() {
  testWidgets('checkout succeeds only after canonical server completion',
      (tester) async {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    final prefs = await SharedPreferences.getInstance();
    await LocalStore(prefs).writeCart(_CheckoutExperienceApi.cart);
    final api = _CheckoutExperienceApi();
    final router = GoRouter(
      initialLocation: '/checkout',
      routes: [
        GoRoute(
          path: '/checkout',
          builder: (_, __) => const CheckoutScreen(),
        ),
        GoRoute(
          path: '/order-confirmed',
          builder: (_, __) =>
              const Scaffold(body: Text('Canonical order confirmed')),
        ),
      ],
    );
    addTearDown(router.dispose);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          sharedPreferencesProvider.overrideWithValue(prefs),
          experienceApiProvider.overrideWithValue(api),
        ],
        child: MaterialApp.router(
          theme: AgencyTheme.light(),
          routerConfig: router,
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Simulated prepaid payment'), findsOneWidget);
    expect(find.textContaining('Razorpay'), findsNothing);
    expect(find.textContaining('Pay on delivery'), findsNothing);
    expect(api.completeCalls, 0);

    await tester.scrollUntilVisible(
      find.text('Standard delivery'),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.text('Standard delivery'));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.text('Express delivery'),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.text('Express delivery'));
    await tester.pumpAndSettle();

    Future<void> enter(String label, String value) async {
      final field = find.widgetWithText(TextFormField, label);
      await tester.scrollUntilVisible(
        field,
        -200,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.enterText(field, value);
    }

    await enter('Email', 'pilot-buyer@buildkart.local');
    await enter('First name', 'Pilot');
    await enter('Last name', 'Buyer');
    await enter('Address', '101 Test Yard');
    await enter('City', 'Jaipur');
    await enter('Postal code', '302001');

    final placeOrder = find.widgetWithText(FilledButton, 'Place order');
    await tester.scrollUntilVisible(
      placeOrder,
      200,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.drag(find.byType(Scrollable).first, const Offset(0, -100));
    await tester.pumpAndSettle();
    await tester.tap(placeOrder);
    await tester.pumpAndSettle();

    expect(api.shippingSelections, 4);
    expect(api.completeCalls, 1);
    expect(find.text('Canonical order confirmed'), findsOneWidget);
  });
}
