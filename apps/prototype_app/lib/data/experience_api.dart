import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/app_config.dart';
import '../domain/models.dart';

/// Client for the shared BuildKart Experience API (`:9020`), which composes Medusa/Mercur/Tryton.
/// This is the canonical client for the pilot: it consumes composed responses and the dummy
/// OTP/logistics/notification endpoints. It never manufactures business decisions.

class ExperienceApi {
  ExperienceApi(this._dio);

  final Dio _dio;

  Future<Map<String, dynamic>> requestOtp(String identifier) async {
    final res = await _dio.post<Map<String, dynamic>>(
      '/v1/auth/otp/challenges',
      data: {'identifier': identifier},
    );
    return res.data!;
  }

  Future<Map<String, dynamic>> verifyOtp(String challengeId, String code) async {
    final res = await _dio.post<Map<String, dynamic>>(
      '/v1/auth/otp/verify',
      data: {'challenge_id': challengeId, 'code': code},
    );
    return res.data!;
  }

  Future<List<dynamic>> getCollection(String key) async {
    final res = await _dio.get<Map<String, dynamic>>('/v1/collections/$key');
    return (res.data!['items'] as List?) ?? [];
  }

  Future<Map<String, dynamic>> getProduct(String productId) async {
    final res = await _dio.get<Map<String, dynamic>>('/v1/products/$productId');
    return res.data!;
  }

  /// Composed product list with best-price offer per product.
  Future<List<Product>> getComposedProducts({int limit = 50, int offset = 0}) async {
    final res = await _dio.get<Map<String, dynamic>>(
      '/v1/products',
      queryParameters: {'limit': limit, 'offset': offset},
    );
    return (res.data!['products'] as List? ?? [])
        .whereType<Map<String, dynamic>>()
        .map(Product.fromComposedJson)
        .toList();
  }

  /// Composed product detail (best-price offer drives price + variant identity).
  Future<Product> getComposedProduct(String productId) async {
    final res = await _dio.get<Map<String, dynamic>>('/v1/products/$productId');
    return Product.fromComposedJson(res.data!);
  }

  Future<Map<String, dynamic>> checkServiceability(String postcode) async {
    final res = await _dio.get<Map<String, dynamic>>(
      '/v1/logistics/serviceability',
      queryParameters: {'postcode': postcode},
    );
    return res.data!;
  }

  Future<List<dynamic>> getNotifications() async {
    final res = await _dio.get<Map<String, dynamic>>('/v1/notifications');
    return (res.data!['notifications'] as List?) ?? [];
  }
}

final experienceApiProvider = Provider<ExperienceApi>((ref) {
  final dio = Dio(
    BaseOptions(
      baseUrl: AppConfig.experienceApiBaseUrl,
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 15),
      headers: {'Content-Type': 'application/json'},
    ),
  );
  return ExperienceApi(dio);
});
