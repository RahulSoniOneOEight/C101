import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:prototype_app/data/experience_api.dart';
import 'package:prototype_app/data/local_store.dart';
import 'package:prototype_app/domain/models.dart';
import 'package:prototype_app/providers/cart_providers.dart';

class _FakeExperienceApi extends ExperienceApi {
  _FakeExperienceApi() : super(Dio());

  int createCartCalls = 0;
  int failAdds = 0;
  final List<String> addedCartIds = <String>[];
  DioException? addError;

  @override
  Future<Cart> createCart({String? channel}) async {
    createCartCalls += 1;
    return Cart(id: 'cart_test_$createCartCalls');
  }

  @override
  Future<Cart> addLineItem(
    String cartId,
    String offerId,
    int quantity,
  ) async {
    if (addError != null && failAdds > 0) {
      failAdds -= 1;
      throw addError!;
    }
    addedCartIds.add(cartId);
    return Cart(id: cartId);
  }
}

Future<ProviderContainer> _containerWith(_FakeExperienceApi api) async {
  TestWidgetsFlutterBinding.ensureInitialized();
  SharedPreferences.setMockInitialValues(<String, Object>{});
  final prefs = await SharedPreferences.getInstance();
  return ProviderContainer(
    overrides: [
      sharedPreferencesProvider.overrideWithValue(prefs),
      experienceApiProvider.overrideWithValue(api),
    ],
  );
}

void main() {
  test('discards a persisted local_cart instead of reusing it', () async {
    final api = _FakeExperienceApi();
    final container = await _containerWith(api);
    addTearDown(container.dispose);

    final store = LocalStore(await SharedPreferences.getInstance());
    await store.writeCart(const Cart(id: 'local_cart'));

    // Recreate the container so build() reads the persisted fake cart.
    final restarted = ProviderContainer(
      overrides: [
        sharedPreferencesProvider.overrideWithValue(
          await SharedPreferences.getInstance(),
        ),
        experienceApiProvider.overrideWithValue(api),
      ],
    );
    addTearDown(restarted.dispose);

    expect(restarted.read(cartProvider).value, isNull);

    await restarted.read(cartProvider.notifier).addItem(
          offerId: 'offer_1',
          variantId: 'variant_1',
          quantity: 1,
        );

    expect(api.createCartCalls, 1);
    expect(api.addedCartIds, <String>['cart_test_1']);
    expect(restarted.read(cartProvider).value?.id, 'cart_test_1');
  });

  test('reports a failed add instead of creating a local cart', () async {
    final api = _FakeExperienceApi()
      ..failAdds = 1
      ..addError = DioException(
        requestOptions: RequestOptions(path: '/v1/carts/cart_test_1/lines'),
        response: Response<void>(
          requestOptions: RequestOptions(path: '/v1/carts/cart_test_1/lines'),
          statusCode: 500,
        ),
      );
    final container = await _containerWith(api);
    addTearDown(container.dispose);

    await expectLater(
      container.read(cartProvider.notifier).addItem(
            offerId: 'offer_1',
            variantId: 'variant_1',
            quantity: 1,
          ),
      throwsA(isA<CartUnavailable>()),
    );
    expect(container.read(cartProvider).value?.id, isNot('local_cart'));
  });

  test('recovers once when a cached server cart no longer exists', () async {
    final api = _FakeExperienceApi();
    final container = await _containerWith(api);
    addTearDown(container.dispose);

    // Seed the provider with a canonical server cart.
    await container.read(cartProvider.notifier).addItem(
          offerId: 'offer_0',
          variantId: 'variant_0',
          quantity: 1,
        );
    expect(api.createCartCalls, 1);

    // The cached cart is deleted server-side: the next add gets 404, and the
    // provider must create a fresh cart and retry once.
    api
      ..failAdds = 1
      ..addError = DioException(
        requestOptions: RequestOptions(path: '/v1/carts/cart_test_1/lines'),
        response: Response<void>(
          requestOptions: RequestOptions(path: '/v1/carts/cart_test_1/lines'),
          statusCode: 404,
        ),
      );
    await container.read(cartProvider.notifier).addItem(
          offerId: 'offer_1',
          variantId: 'variant_1',
          quantity: 1,
        );

    expect(api.createCartCalls, 2);
    expect(api.addedCartIds, <String>['cart_test_1', 'cart_test_2']);
    expect(container.read(cartProvider).value?.id, 'cart_test_2');
  });
}
