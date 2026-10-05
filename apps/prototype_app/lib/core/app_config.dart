import 'package:flutter/foundation.dart' show kDebugMode;

/// Static runtime configuration for the BuildKart storefront.
///
/// Values are supplied at build time via `--dart-define` and fall back to
/// localhost defaults that match the local staging stack.
///
/// Example:
/// ```sh
/// flutter run \
///   --dart-define=MEDUSA_BASE_URL=http://localhost:9010 \
///   --dart-define=MEDUSA_PUBLISHABLE_KEY=pk_... \
///   --dart-define=EXPERIENCE_API_BASE_URL=http://localhost:9020
/// ```
class AppConfig {
  const AppConfig._();

  /// Commerce/Marketplace backend (Medusa + Mercur), staging port 9010.
  static const String medusaBaseUrl = String.fromEnvironment(
    'MEDUSA_BASE_URL',
    defaultValue: 'http://localhost:9010',
  );

  /// Composed Experience API (shared backend), staging port 9020.
  static const String experienceApiBaseUrl = String.fromEnvironment(
    'EXPERIENCE_API_BASE_URL',
    defaultValue: 'http://localhost:9020',
  );

  static const String medusaPublishableKey = String.fromEnvironment(
    'MEDUSA_PUBLISHABLE_KEY',
    defaultValue: 'pk_144180889dafdc1c2f15bc4d6244e24507380905f3664e411e072297333c0140',
  );

  /// Whether the storefront may fall back to the seeded demo catalog when the
  /// API is unreachable.
  ///
  /// This is a **dev-only** convenience for UI review: it is tied to
  /// [kDebugMode], so it is always `false` in release/profile builds and can
  /// never silently serve demo data to production users.
  static const bool useMockData = kDebugMode;
}
