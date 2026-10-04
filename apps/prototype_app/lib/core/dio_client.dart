import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app_config.dart';

/// Shared [Dio] instance preconfigured for the Medusa storefront API.
///
/// Medusa v2 authenticates storefront requests with a publishable API key
/// sent as the `x-publishable-api-key` header (no secret here).
final dioProvider = Provider<Dio>((ref) {
  return Dio(
    BaseOptions(
      baseUrl: AppConfig.medusaBaseUrl,
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 15),
      headers: <String, dynamic>{
        'x-publishable-api-key': AppConfig.medusaPublishableKey,
        'Content-Type': 'application/json',
      },
    ),
  );
});
