import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../core/app_config.dart';
import '../domain/models.dart';
import '../domain/app_notification.dart';

/// Client for the shared BuildKart Experience API (`:9020`), which composes Medusa/Mercur/Tryton.
/// This is the canonical client for the pilot: it consumes composed responses and the dummy
/// OTP/logistics/notification endpoints. It never manufactures business decisions.

class ExperienceApi {
  ExperienceApi(this._dio, [FlutterSecureStorage? secureStorage])
      : _secureStorage = secureStorage ?? const FlutterSecureStorage();

  final Dio _dio;
  final FlutterSecureStorage _secureStorage;
  static const _sessionTokenKey = 'pilot_session_token_v1';
  static const _sessionExpiryKey = 'pilot_session_expiry_v1';

  Future<Map<String, dynamic>> requestOtp(String identifier) async {
    final res = await _dio.post<Map<String, dynamic>>(
      '/v1/auth/otp/challenges',
      data: {'identifier': identifier},
    );
    return res.data!;
  }

  Future<Map<String, dynamic>> verifyOtp(
      String challengeId, String code) async {
    final res = await _dio.post<Map<String, dynamic>>(
      '/v1/auth/otp/verify',
      data: {'challenge_id': challengeId, 'code': code},
    );
    final token = res.data?['session_token'] as String?;
    if (token != null && token.isNotEmpty) {
      _dio.options.headers['Authorization'] = 'Bearer $token';
      final expiresIn = (res.data?['expires_in_seconds'] as num?)?.toInt() ?? 0;
      final expiry = DateTime.now().toUtc().add(Duration(seconds: expiresIn));
      await _secureStorage.write(key: _sessionTokenKey, value: token);
      await _secureStorage.write(
        key: _sessionExpiryKey,
        value: expiry.toIso8601String(),
      );
    }
    return res.data!;
  }

  Future<void> logout({String? deviceId}) async {
    try {
      await _dio.post<void>(
        '/v1/auth/logout',
        data: deviceId == null ? null : {'device_id': deviceId},
      );
    } finally {
      await clearSession();
    }
  }

  Future<bool> restoreSession() async {
    final token = await _secureStorage.read(key: _sessionTokenKey);
    final expiryRaw = await _secureStorage.read(key: _sessionExpiryKey);
    final expiry = DateTime.tryParse(expiryRaw ?? '');
    if (token == null ||
        token.isEmpty ||
        expiry == null ||
        !expiry.isAfter(DateTime.now().toUtc())) {
      await clearSession();
      return false;
    }
    _dio.options.headers['Authorization'] = 'Bearer $token';
    return true;
  }

  Future<void> clearSession() async {
    _dio.options.headers.remove('Authorization');
    await _secureStorage.delete(key: _sessionTokenKey);
    await _secureStorage.delete(key: _sessionExpiryKey);
  }

  Future<List<dynamic>> getCollection(String key) async {
    final res = await _dio.get<Map<String, dynamic>>('/v1/collections/$key');
    return (res.data!['items'] as List?) ?? [];
  }

  Future<List<Map<String, dynamic>>> getMyContexts() async {
    final res = await _dio.get<Map<String, dynamic>>('/v1/me/contexts');
    return (res.data!['contexts'] as List? ?? const <dynamic>[])
        .whereType<Map<String, dynamic>>()
        .toList();
  }

  Future<Map<String, dynamic>> getProduct(String productId) async {
    final res = await _dio.get<Map<String, dynamic>>('/v1/products/$productId');
    return res.data!;
  }

  /// Composed product list with best-price offer per product.
  Future<List<Product>> getComposedProducts(
      {int limit = 50, int offset = 0}) async {
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

  /// Creates a canonical Medusa cart (Commerce).
  Future<Cart> createCart() async {
    final res = await _dio
        .post<Map<String, dynamic>>('/v1/carts', data: <String, dynamic>{});
    return Cart.fromJson(res.data!);
  }

  /// Adds a seller offer (Marketplace) to the cart — offer-based, never variant-based.
  Future<Cart> addLineItem(String cartId, String offerId, int quantity) async {
    final res = await _dio.post<Map<String, dynamic>>(
      '/v1/carts/$cartId/lines',
      data: {'offer_id': offerId, 'quantity': quantity},
    );
    return Cart.fromJson(res.data!);
  }

  Future<Cart> updateLineItem(
      String cartId, String lineItemId, int quantity) async {
    final res = await _dio.post<Map<String, dynamic>>(
      '/v1/carts/$cartId/lines/$lineItemId',
      data: {'quantity': quantity},
    );
    return Cart.fromJson(res.data!);
  }

  Future<Cart> removeLineItem(String cartId, String lineItemId) async {
    final res = await _dio
        .delete<Map<String, dynamic>>('/v1/carts/$cartId/lines/$lineItemId');
    return Cart.fromJson(res.data!);
  }

  Future<Cart> updateCartCustomerDetails(
    String cartId, {
    required String email,
    required Address shippingAddress,
  }) async {
    final res = await _dio.post<Map<String, dynamic>>(
      '/v1/carts/$cartId/customer-details',
      data: {
        'email': email,
        'shipping_address': shippingAddress.toJson(),
      },
    );
    return Cart.fromJson(res.data!);
  }

  Future<List<ShippingOption>> listShippingOptions(String cartId) async {
    final res = await _dio.get<Map<String, dynamic>>(
      '/v1/carts/$cartId/shipping-options',
    );
    return (res.data!['shipping_options'] as List? ?? const <dynamic>[])
        .whereType<Map<String, dynamic>>()
        .map(ShippingOption.fromJson)
        .toList();
  }

  Future<Cart> selectShippingMethod(String cartId, String optionId) async {
    final res = await _dio.post<Map<String, dynamic>>(
      '/v1/carts/$cartId/shipping-methods',
      data: {'option_id': optionId},
    );
    return Cart.fromJson(res.data!);
  }

  /// Completes the cart only after server-side shipping and simulated payment setup.
  Future<Map<String, dynamic>> completeCart(String cartId) async {
    final res =
        await _dio.post<Map<String, dynamic>>('/v1/checkouts/$cartId/complete');
    return res.data!;
  }

  Future<Map<String, dynamic>> checkServiceability(String postcode) async {
    final res = await _dio.get<Map<String, dynamic>>(
      '/v1/logistics/serviceability',
      queryParameters: {'postcode': postcode},
    );
    return res.data!;
  }

  Future<List<AppNotification>> getNotifications() async {
    final res = await _dio.get<Map<String, dynamic>>('/v1/me/notifications');
    return (res.data!['notifications'] as List? ?? const <dynamic>[])
        .whereType<Map<String, dynamic>>()
        .map(AppNotification.fromJson)
        .toList();
  }

  Future<void> markNotificationRead(String notificationId) async {
    await _dio.post<void>('/v1/me/notifications/$notificationId/read');
  }

  Future<void> markAllNotificationsRead() async {
    await _dio.post<void>('/v1/me/notifications/read-all');
  }

  Future<String> registerDevice(String token) async {
    final res = await _dio.post<Map<String, dynamic>>(
      '/v1/me/devices',
      data: {
        'token': token,
        'platform': 'android',
        'firebase_project_id': 'buildkart-staging',
      },
    );
    return res.data!['id'] as String;
  }

  Future<void> removeDevice(String deviceId) async {
    await _dio.delete<void>('/v1/me/devices/$deviceId');
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
  return ExperienceApi(dio, ref.watch(secureStorageProvider));
});

final secureStorageProvider = Provider<FlutterSecureStorage>((ref) {
  return const FlutterSecureStorage();
});
