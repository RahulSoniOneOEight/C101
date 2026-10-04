import 'package:flutter/foundation.dart' show kDebugMode;

/// Static runtime configuration for the PinCommerce storefront.
///
/// Values are supplied at build time via `--dart-define` and fall back to
/// localhost defaults that match a local Medusa instance.
///
/// Example:
/// ```sh
/// flutter run \
///   --dart-define=MEDUSA_BASE_URL=https://medusa.example.com \
///   --dart-define=MEDUSA_PUBLISHABLE_KEY=pk_example
/// ```
class AppConfig {
  const AppConfig._();

  static const String medusaBaseUrl = String.fromEnvironment(
    'MEDUSA_BASE_URL',
    defaultValue: 'http://localhost:9000',
  );

  static const String medusaPublishableKey = String.fromEnvironment(
    'MEDUSA_PUBLISHABLE_KEY',
    defaultValue: 'pk_test_demo',
  );

  /// Whether the storefront may fall back to the seeded demo catalog when the
  /// API is unreachable.
  ///
  /// This is a **dev-only** convenience for UI review: it is tied to
  /// [kDebugMode], so it is always `false` in release/profile builds and can
  /// never silently serve demo data to production users.
  static const bool useMockData = kDebugMode;
}
