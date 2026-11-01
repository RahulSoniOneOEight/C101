import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../domain/models.dart';
import 'cart_providers.dart';

/// Last cart failure, surfaced by [showCartErrorToast] when the caller has not
/// supplied a message.
String? lastCartError;

/// Adds a line and reports whether the canonical cart accepted it.
///
/// Screens must only show a success message when this returns `true`. A failed
/// cart operation is never turned into a fake local cart in staging or
/// production; the user gets a retryable error instead.
Future<bool> addToCartSafely(
  WidgetRef ref, {
  required String offerId,
  required String variantId,
  int quantity = 1,
  Money? unitPrice,
  void Function(Object error)? onError,
}) async {
  try {
    await ref.read(cartProvider.notifier).addItem(
          offerId: offerId,
          variantId: variantId,
          quantity: quantity,
          unitPrice: unitPrice,
        );
    lastCartError = null;
    return true;
  } catch (error) {
    lastCartError = cartFailureMessage(error);
    onError?.call(error);
    return false;
  }
}

/// Turns a cart failure into a message an operator can act on.
///
/// The API sends `{detail}` for domain errors (out of stock, archived product,
/// expired cart); surface it instead of a generic “Could not add to cart”.
String cartFailureMessage(Object error) {
  if (error is DioException) {
    final data = error.response?.data;
    if (data is Map) {
      final detail = data['detail'] ?? data['message'];
      if (detail is String && detail.trim().isNotEmpty) {
        return detail.trim();
      }
    }
    final code = error.response?.statusCode;
    if (code == 401) {
      return 'Your session expired. Sign in again, then retry.';
    }
    if (code == 404) {
      return 'This product is no longer available.';
    }
    if (code == 409) {
      return 'This product cannot be added right now (conflict). Please retry.';
    }
    if (code != null) {
      return 'Could not add to cart ($code). Please retry.';
    }
  }
  return 'Could not add to cart. Check your connection and retry.';
}
