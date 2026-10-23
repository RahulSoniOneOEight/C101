import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../domain/models.dart';
import 'cart_providers.dart';

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
}) async {
  try {
    await ref.read(cartProvider.notifier).addItem(
          offerId: offerId,
          variantId: variantId,
          quantity: quantity,
          unitPrice: unitPrice,
        );
    return true;
  } catch (_) {
    return false;
  }
}
