import 'package:flutter/foundation.dart' show kDebugMode, kReleaseMode;

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

  static const String environment = String.fromEnvironment(
    'BUILDKART_ENVIRONMENT',
    defaultValue: 'development',
  );

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
    defaultValue:
        'pk_2e029a34f69466612ff50c36ba44e37f87dc05e99f8d291ec25096a5a2d37235',
  );

  /// Whether the storefront may fall back to the seeded demo catalog when the
  /// API is unreachable.
  ///
  /// This is a **dev-only** convenience for UI review: it is tied to
  /// [kDebugMode], so it is always `false` in release/profile builds and can
  /// never silently serve demo data to production users.
  static const bool useMockData = kDebugMode;

  /// Metadata marker of the governed source catalogue to show in staging.
  ///
  /// The Experience API selects products by this marker (`catalogue_import`) so the storefront renders
  /// the imported 500-SKU catalogue rather than every demonstration product that happens to be
  /// published. Override with `--dart-define=CATALOGUE_IMPORT=` to show the whole catalogue.
  static const String catalogueImport = String.fromEnvironment(
    'CATALOGUE_IMPORT',
    defaultValue: 'CHG-049',
  );

  /// Short build identifier shown in the staging strip. Pass the commit SHA at
  /// build time so a stale tab or an older cached bundle is immediately obvious.
  static const String buildId = String.fromEnvironment(
    'BUILD_ID',
    defaultValue: 'dev',
  );

  /// Whether this process bootstrapped remote catalogue reads.
  ///
  /// Set by [main] before the app is mounted. Widget tests mount the app without
  /// running [main], so they render the deterministic local fallback instead of
  /// starting an HTTP request that would outlive the test binding.
  static bool _liveCatalogueEnabled = false;

  static bool get liveCatalogueEnabled => _liveCatalogueEnabled;

  static void enableLiveCatalogue() => _liveCatalogueEnabled = true;

  static void validateForRelease() {
    if (!kReleaseMode) return;
    if (environment != 'staging') {
      throw StateError(
          'Release builds for this pilot must set BUILDKART_ENVIRONMENT=staging.');
    }
    for (final entry in <String, String>{
      'EXPERIENCE_API_BASE_URL': experienceApiBaseUrl,
      'MEDUSA_BASE_URL': medusaBaseUrl,
    }.entries) {
      final uri = Uri.tryParse(entry.value);
      if (uri == null ||
          uri.scheme != 'https' ||
          uri.host.isEmpty ||
          uri.host == 'localhost' ||
          uri.host == '127.0.0.1') {
        throw StateError(
            '${entry.key} must be a non-local HTTPS URL in release builds.');
      }
    }
  }
}
