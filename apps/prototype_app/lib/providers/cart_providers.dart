import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/app_config.dart';
import '../data/experience_api.dart';
import '../data/local_store.dart';
import '../domain/models.dart';
import 'catalog_providers.dart';

/// Raised when the canonical cart cannot be reached or created.
///
/// The UI must show a retryable error instead of claiming the item was added.
class CartUnavailable implements Exception {
  const CartUnavailable([this.message = 'Cart is temporarily unavailable']);

  final String message;

  @override
  String toString() => message;
}

const String _localCartId = 'local_cart';

bool _isServerCart(Cart? cart) => cart != null && cart.id.startsWith('cart_');

/// Cart state controller.
///
/// Keeps a single Medusa cart and exposes add/update/remove operations that
/// round-trip through the API (single source of truth is the backend cart).
/// The last-known cart is persisted locally and restored on startup so the
/// cart survives restarts and remains visible while offline.
///
/// When the backend is unreachable (e.g. the seeded demo catalog with no
/// Medusa instance) the operations degrade to a **local** cart instead of
/// raising an error state, so the cart stays usable in the prototype.
class CartNotifier extends Notifier<AsyncValue<Cart?>> {
  @override
  AsyncValue<Cart?> build() {
    final restored = ref.read(localStoreProvider).readCart();
    if (restored != null && !_isServerCart(restored)) {
      // A fake cart from an older offline fallback is not addressable by the
      // API. Discard it rather than letting every later operation 404.
      Future<void>.microtask(() => _store.writeCart(null));
      return const AsyncValue.data(null);
    }
    return AsyncValue.data(restored);
  }

  ExperienceApi get _client => ref.read(experienceApiProvider);

  LocalStore get _store => ref.read(localStoreProvider);

  Future<void> _setCart(Cart cart) async {
    state = AsyncValue.data(cart);
    await _store.writeCart(cart);
  }

  Future<void> replaceFromServer(Cart cart) => _setCart(cart);

  /// Refreshes from the canonical cart. Best-effort: an offline checkout keeps
  /// the cached cart and surfaces the failure at submit.
  Future<void> rehydrate() async {
    final cart = state.value;
    if (cart == null) return;
    try {
      await _setCart(await _client.getCart(cart.id));
    } catch (_) {
      // Keep the local projection; submit is the authoritative check.
    }
  }

  /// Returns the existing canonical cart or creates one on first use.
  ///
  /// A restored `local_cart` is deliberately treated as absent: it cannot be
  /// addressed by the API and would fail every subsequent operation.
  Future<Cart> _requireCart() async {
    final existing = state.value;
    if (_isServerCart(existing)) return existing!;
    final cart = await _client.createCart();
    await _setCart(cart);
    return cart;
  }

  static bool _isMissingCartError(Object error) =>
      error is DioException && error.response?.statusCode == 404;

  // ---- offline (local) cart helpers ---------------------------------------

  Product? _productFor(String variantId) {
    final products = ref.read(productsProvider).value ?? const <Product>[];
    for (final p in products) {
      if (p.cartVariantId == variantId || p.id == variantId) return p;
      for (final variant in p.variants) {
        if (variant.id == variantId) return p;
      }
    }
    return null;
  }

  /// Price of the specific SKU being added, so a grouped product never uses one
  /// variant's price for another variant's line.
  Money? _variantPrice(Product? product, String variantId) {
    if (product == null) return null;
    for (final variant in product.variants) {
      if (variant.id == variantId) return variant.price;
    }
    return product.price;
  }

  CartLineItem _line(String id, String title, int qty, Money? unit) {
    return CartLineItem(
      id: id,
      title: title,
      quantity: qty,
      unitPrice: unit,
      total: unit == null
          ? null
          : Money(amount: unit.amount * qty, currencyCode: unit.currencyCode),
    );
  }

  Cart _withItems(Cart cart, List<CartLineItem> items) {
    final amount = items.fold<int>(
      0,
      (sum, i) =>
          sum + (i.total?.amount ?? (i.unitPrice?.amount ?? 0) * i.quantity),
    );
    final currency =
        items.isEmpty ? 'INR' : (items.first.unitPrice?.currencyCode ?? 'INR');
    return Cart(
      id: cart.id,
      items: items,
      subtotal: Money(amount: amount, currencyCode: currency),
      total: Money(amount: amount, currencyCode: currency),
    );
  }

  Cart _localAdd(Cart cart, String variantId, int quantity,
      {Money? unitPrice}) {
    final product = _productFor(variantId);
    final items = List<CartLineItem>.of(cart.items);
    final index = items.indexWhere((i) => i.id == variantId);
    if (index >= 0) {
      final line = items[index];
      items[index] = _line(line.id, line.title, line.quantity + quantity,
          unitPrice ?? line.unitPrice);
    } else {
      items.add(_line(variantId, product?.title ?? variantId, quantity,
          unitPrice ?? _variantPrice(product, variantId)));
    }
    return _withItems(cart, items);
  }

  Future<void> addItem(
      {required String offerId,
      required String variantId,
      required int quantity,
      Money? unitPrice}) async {
    try {
      var cart = await _requireCart();
      try {
        final updated = await _client.addLineItem(cart.id, offerId, quantity);
        await _setCart(updated);
        return;
      } catch (error) {
        // A cached server cart can expire or be deleted server-side. Recover
        // once with a fresh cart; never retry a validation failure.
        if (!_isMissingCartError(error)) rethrow;
        cart = await _client.createCart();
        await _setCart(cart);
        final retried = await _client.addLineItem(cart.id, offerId, quantity);
        await _setCart(retried);
        return;
      }
    } catch (_) {
      // The offline cart is an explicit development-only mode. In staging and
      // production a failure is surfaced so the UI cannot claim success.
      if (AppConfig.allowOfflineCart) {
        final base = _isServerCart(state.value)
            ? state.value!
            : const Cart(id: _localCartId);
        await _setCart(
            _localAdd(base, variantId, quantity, unitPrice: unitPrice));
        return;
      }
      throw const CartUnavailable();
    }
  }

  /// Applies a code against the canonical cart. The engine decides; this only
  /// propagates its answer and never assumes a discount.
  Future<void> applyPromotion(String code) async {
    final cart = state.value;
    if (cart == null) {
      throw PromotionRejected(code: code, reason: 'no_cart');
    }
    try {
      final updated = await _client.addPromotion(cart.id, code);
      await _setCart(updated);
    } on PromotionRejected {
      rethrow;
    } catch (_) {
      throw PromotionRejected(code: code, reason: 'unavailable');
    }
  }

  Future<void> removePromotion(String code) async {
    final cart = state.value;
    if (cart == null) return;
    try {
      final updated = await _client.removePromotion(cart.id, code);
      await _setCart(updated);
    } on PromotionRejected {
      rethrow;
    } catch (_) {
      throw PromotionRejected(code: code, reason: 'unavailable');
    }
  }

  Future<void> updateQuantity(String lineItemId, int quantity) async {
    if (quantity <= 0) return removeItem(lineItemId);
    final cart = state.value;
    if (cart == null) return;
    try {
      final updated =
          await _client.updateLineItem(cart.id, lineItemId, quantity);
      await _setCart(updated);
    } catch (_) {
      await _setCart(_withItems(cart, <CartLineItem>[
        for (final line in cart.items)
          line.id == lineItemId
              ? _line(line.id, line.title, quantity, line.unitPrice)
              : line,
      ]));
    }
  }

  Future<void> removeItem(String lineItemId) async {
    final cart = state.value;
    if (cart == null) return;
    try {
      final updated = await _client.removeLineItem(cart.id, lineItemId);
      await _setCart(updated);
    } catch (_) {
      await _setCart(_withItems(
        cart,
        cart.items.where((line) => line.id != lineItemId).toList(),
      ));
    }
  }

  /// Empties the cart after an order is placed — best-effort server cleanup,
  /// then clears local state so the cart/badge reset.
  Future<void> clear() async {
    final cart = state.value;
    if (cart != null) {
      for (final item in List<CartLineItem>.of(cart.items)) {
        try {
          await _client.removeLineItem(cart.id, item.id);
        } catch (_) {
          // best-effort: still clear locally below
        }
      }
    }
    state = const AsyncValue<Cart?>.data(null);
    await _store.writeCart(null);
  }

  /// Clears only the local projection after canonical order creation succeeds.
  Future<void> clearAfterOrder() async {
    state = const AsyncValue<Cart?>.data(null);
    await _store.writeCart(null);
  }
}

final cartProvider =
    NotifierProvider<CartNotifier, AsyncValue<Cart?>>(CartNotifier.new);
