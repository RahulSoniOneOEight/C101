import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:prototype_app/app.dart';
import 'package:prototype_app/data/experience_api.dart';
import 'package:prototype_app/data/local_store.dart';
import 'package:prototype_app/domain/models.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Fakes the Experience API client so the smoke test runs without a backend.
class _FakeExperienceApi extends ExperienceApi {
  _FakeExperienceApi() : super(Dio());

  @override
  Future<List<Product>> getComposedProducts(
      {int limit = 50, int offset = 0}) async {
    return const <Product>[];
  }

  @override
  Future<Cart> createCart() async => const Cart(id: 'cart_test');
}

void main() {
  testWidgets('app renders the empty catalog', (tester) async {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    final prefs = await SharedPreferences.getInstance();

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          sharedPreferencesProvider.overrideWithValue(prefs),
          experienceApiProvider.overrideWithValue(_FakeExperienceApi()),
        ],
        child: const PinCommerceApp(),
      ),
    );
    await tester.pumpAndSettle();

    // Onboarding → Login. Both consumer and trade modes now require an
    // allowlisted OTP identity, so the consumer path no longer bypasses auth.
    await tester.tap(find.text('Get Started'));
    await tester.pumpAndSettle();

    expect(find.text('BuildKart'), findsOneWidget);
    expect(find.text('Get OTP'), findsOneWidget);
    expect(find.text('Sign In'), findsNothing);
  });
}
