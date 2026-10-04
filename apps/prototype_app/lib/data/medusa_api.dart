import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/dio_client.dart';
import '../domain/models.dart';

/// Thin client over Medusa's v2 storefront REST API.
///
/// Only the endpoints needed by the browse → cart → checkout slice are
/// implemented. Every method returns typed domain models.
class MedusaStoreClient {
  MedusaStoreClient(this._dio);

  final Dio _dio;

  Future<List<Product>> listProducts({int limit = 20, int offset = 0}) async {
    final res = await _dio.get<Map<String, dynamic>>(
      '/store/products',
      queryParameters: <String, dynamic>{'limit': limit, 'offset': offset},
    );
    final products =
        (res.data?['products'] as List<dynamic>? ?? const <dynamic>[])
            .whereType<Map<String, dynamic>>()
            .map(Product.fromJson)
            .toList();
    return products;
  }

  Future<Cart> createCart() async {
    final res = await _dio
        .post<Map<String, dynamic>>('/store/carts', data: <String, dynamic>{});
    return Cart.fromJson(res.data!['cart'] as Map<String, dynamic>);
  }

  Future<Cart> getCart(String cartId) async {
    final res = await _dio.get<Map<String, dynamic>>('/store/carts/$cartId');
    return Cart.fromJson(res.data!['cart'] as Map<String, dynamic>);
  }

  Future<Cart> addLineItem(
    String cartId, {
    required String variantId,
    required int quantity,
  }) async {
    final res = await _dio.post<Map<String, dynamic>>(
      '/store/carts/$cartId/line-items',
      data: <String, dynamic>{'variant_id': variantId, 'quantity': quantity},
    );
    return Cart.fromJson(res.data!['cart'] as Map<String, dynamic>);
  }

  Future<Cart> updateLineItem(
    String cartId,
    String lineItemId, {
    required int quantity,
  }) async {
    final res = await _dio.post<Map<String, dynamic>>(
      '/store/carts/$cartId/line-items/$lineItemId',
      data: <String, dynamic>{'quantity': quantity},
    );
    return Cart.fromJson(res.data!['cart'] as Map<String, dynamic>);
  }

  Future<Cart> removeLineItem(String cartId, String lineItemId) async {
    final res = await _dio.delete<Map<String, dynamic>>(
      '/store/carts/$cartId/line-items/$lineItemId',
    );
    return Cart.fromJson(res.data!['cart'] as Map<String, dynamic>);
  }

  Future<Cart> setEmail(String cartId, String email) async {
    final res = await _dio.post<Map<String, dynamic>>(
      '/store/carts/$cartId',
      data: <String, dynamic>{'email': email},
    );
    return Cart.fromJson(res.data!['cart'] as Map<String, dynamic>);
  }

  Future<Cart> setShippingAddress(String cartId, Address address) async {
    final res = await _dio.post<Map<String, dynamic>>(
      '/store/carts/$cartId',
      data: <String, dynamic>{'shipping_address': address.toJson()},
    );
    return Cart.fromJson(res.data!['cart'] as Map<String, dynamic>);
  }
}

final medusaClientProvider = Provider<MedusaStoreClient>(
  (ref) => MedusaStoreClient(ref.watch(dioProvider)),
);
