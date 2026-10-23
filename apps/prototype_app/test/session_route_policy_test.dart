import 'package:flutter_test/flutter_test.dart';
import 'package:prototype_app/core/session_route_policy.dart';

void main() {
  test('customer session leaves onboarding for the B2C home', () {
    expect(
      restoredSessionRedirect(
        currentPath: '/onboarding',
        roles: const <String>{'customer'},
      ),
      '/',
    );
  });

  test('B2B session leaves login for the trade home', () {
    expect(
      restoredSessionRedirect(
        currentPath: '/login',
        roles: const <String>{'customer', 'b2b_buyer'},
      ),
      '/b2b',
    );
  });

  test('unknown role leaves OTP for notifications', () {
    expect(
      restoredSessionRedirect(
        currentPath: '/otp',
        roles: const <String>{'support'},
      ),
      '/notifications',
    );
  });

  for (final path in <String>[
    '/browse',
    '/checkout',
    '/product/prod_1',
    '/b2b/catalogue',
  ]) {
    test('restored session preserves $path', () {
      expect(
        restoredSessionRedirect(
          currentPath: path,
          roles: const <String>{'customer'},
        ),
        isNull,
      );
    });
  }
}
