import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:prototype_app/data/experience_api.dart';
import 'package:prototype_app/data/local_store.dart';
import 'package:prototype_app/domain/models.dart';
import 'package:prototype_app/providers/cart_providers.dart';
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
}
