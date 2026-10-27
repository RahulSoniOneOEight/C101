import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:prototype_app/data/experience_api.dart';
import 'package:prototype_app/data/local_store.dart';
import 'package:prototype_app/domain/models.dart';
import 'package:prototype_app/providers/cart_providers.dart';
import 'package:prototype_app/widgets/promotion_panel.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Stands in for the engine: accepts one code, refuses another.
class _PromoApi extends ExperienceApi {
  _PromoApi() : super(Dio());

  static const String validCode = 'TOOLS10';
  static const String rejectedCode = 'NOPE';

  @override
  Future<Cart> addPromotion(String cartId, String code) async {
    if (code == rejectedCode) {
      throw const PromotionRejected(code: rejectedCode, reason: 'not_found');
    }
    return Cart(
      id: cartId,
      subtotal: const Money(amount: 12000, currencyCode: 'INR'),
      discountTotal: const Money(amount: 1200, currencyCode: 'INR'),
      total: const Money(amount: 10800, currencyCode: 'INR'),
      promotions: const <AppliedPromotion>[
        AppliedPromotion(code: validCode),
      ],
      adjustments: const <CartAdjustment>[
        CartAdjustment(
            code: validCode, label: '10% off Power Tools', amount: 1200),
      ],
    );
  }

  @override
  Future<Cart> removePromotion(String cartId, String code) async => Cart(
        id: cartId,
        subtotal: const Money(amount: 12000, currencyCode: 'INR'),
        total: const Money(amount: 12000, currencyCode: 'INR'),
      );
}

Cart _cartWithLine() => const Cart(
      id: 'cart_1',
      items: <CartLineItem>[
        CartLineItem(
            id: 'line_1', title: 'Socket Set', quantity: 1),
      ],
      subtotal: Money(amount: 12000, currencyCode: 'INR'),
      total: Money(amount: 12000, currencyCode: 'INR'),
    );

void main() {
  test('cart JSON exposes the engine discount breakdown', () {
    final cart = Cart.fromJson(<String, dynamic>{
      'id': 'cart_1',
      'currency_code': 'INR',
      'subtotal': 12000,
      'discount_total': 1200,
      'shipping_discount_total': 199,
      'total': 10800,
      'promotions': <dynamic>[
        <String, dynamic>{'code': 'TOOLS10', 'is_automatic': false},
      ],
      'adjustments': <dynamic>[
        <String, dynamic>{
          'code': 'TOOLS10',
          'label': '10% off Power Tools',
          'amount': 1200,
          'target': 'item',
        },
      ],
    });

    expect(cart.hasDiscount, isTrue);
    expect(cart.discountTotal!.amount, 1200);
    expect(cart.shippingDiscountTotal!.amount, 199);
    expect(cart.promotions.single.code, 'TOOLS10');
    expect(cart.adjustments.single.label, '10% off Power Tools');
    expect(cart.total!.amount, 10800);
  });

  test('applying a valid code stores the engine result; removing restores it',
      () async {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    final prefs = await SharedPreferences.getInstance();
    final container = ProviderContainer(overrides: [
      sharedPreferencesProvider.overrideWithValue(prefs),
      experienceApiProvider.overrideWithValue(_PromoApi()),
    ]);
    addTearDown(container.dispose);
    final notifier = container.read(cartProvider.notifier);
    await notifier.replaceFromServer(_cartWithLine());

    await notifier.applyPromotion(_PromoApi.validCode);
    var cart = container.read(cartProvider).value!;
    expect(cart.discountTotal!.amount, 1200);
    expect(cart.promotions.single.code, _PromoApi.validCode);
    expect(cart.adjustments, hasLength(1));

    await notifier.removePromotion(_PromoApi.validCode);
    cart = container.read(cartProvider).value!;
    expect(cart.discountTotal, isNull);
    expect(cart.promotions, isEmpty);
  });

  test('a rejected code carries a reason and leaves the cart untouched',
      () async {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    final prefs = await SharedPreferences.getInstance();
    final container = ProviderContainer(overrides: [
      sharedPreferencesProvider.overrideWithValue(prefs),
      experienceApiProvider.overrideWithValue(_PromoApi()),
    ]);
    addTearDown(container.dispose);
    final notifier = container.read(cartProvider.notifier);
    await notifier.replaceFromServer(_cartWithLine());

    await expectLater(
      notifier.applyPromotion(_PromoApi.rejectedCode),
      throwsA(isA<PromotionRejected>()
          .having((e) => e.reason, 'reason', 'not_found')),
    );
    final cart = container.read(cartProvider).value!;
    expect(cart.total!.amount, 12000);
    expect(cart.discountTotal, isNull);
  });

  test('rejection reasons map to customer-facing copy', () {
    expect(
        const PromotionRejected(code: 'X', reason: 'not_found').message,
        contains('not found'));
    expect(const PromotionRejected(code: 'X', reason: 'not_eligible').message,
        contains('does not apply'));
    expect(const PromotionRejected(code: 'X', reason: 'expired').message,
        contains('expired'));
    expect(const PromotionRejected(code: 'X', reason: 'usage_limit').message,
        contains('usage limit'));
  });

  test('promotion labels come from the API, survive persistence and fall back to code',
      () {
    final cart = Cart.fromJson(<String, dynamic>{
      'id': 'cart_1',
      'currency_code': 'INR',
      'promotions': <dynamic>[
        <String, dynamic>{
          'code': 'FLAT5',
          'label': 'Flat5%',
          'is_automatic': true,
        },
      ],
    });
    final flat5 = cart.promotions.single;
    expect(flat5.displayLabel, 'Flat5%');
    expect(flat5.isAutomatic, isTrue);

    // The cart is cached locally, so the label must round-trip.
    final restored = AppliedPromotion.fromJson(flat5.toJson());
    expect(restored.displayLabel, 'Flat5%');
    expect(restored.isAutomatic, isTrue);

    // Legacy payloads without a label still render the code.
    expect(AppliedPromotion.fromJson(<String, dynamic>{'code': 'ORDER5'}).displayLabel,
        'ORDER5');
  });

  testWidgets('the automatic Flat5% chip is removable', (tester) async {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    final prefs = await SharedPreferences.getInstance();
    final container = ProviderContainer(overrides: [
      sharedPreferencesProvider.overrideWithValue(prefs),
      experienceApiProvider.overrideWithValue(_PromoApi()),
    ]);
    addTearDown(container.dispose);
    await container.read(cartProvider.notifier).replaceFromServer(const Cart(
      id: 'cart_1',
      items: <CartLineItem>[
        CartLineItem(id: 'line_1', title: 'Socket Set', quantity: 1),
      ],
      subtotal: Money(amount: 12000, currencyCode: 'INR'),
      discountTotal: Money(amount: 600, currencyCode: 'INR'),
      total: Money(amount: 11400, currencyCode: 'INR'),
      promotions: <AppliedPromotion>[
        AppliedPromotion(code: 'FLAT5', label: 'Flat5%', isAutomatic: true),
      ],
    ));

    await tester.pumpWidget(UncontrolledProviderScope(
      container: container,
      child: MaterialApp(
        home: Scaffold(
          body: Consumer(builder: (context, ref, _) {
            final cart = ref.watch(cartProvider).value;
            if (cart == null) return const SizedBox.shrink();
            return PromotionPanel(cart: cart);
          }),
        ),
      ),
    ));
    await tester.pumpAndSettle();

    // A store-applied offer is shown with its customer label and a delete action.
    expect(find.text('Flat5% · Auto'), findsOneWidget);
    expect(find.byIcon(Icons.close), findsOneWidget);

    await tester.tap(find.byIcon(Icons.close));
    await tester.pumpAndSettle();

    final cart = container.read(cartProvider).value!;
    expect(cart.promotions, isEmpty);
    expect(find.text('Flat5% · Auto'), findsNothing);
  });
}
