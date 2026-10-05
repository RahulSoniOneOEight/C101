import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/experience_api.dart';
import '../data/local_store.dart';
import '../domain/models.dart';
import 'catalog_providers.dart';

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
    return AsyncValue.data(restored);
  }

  ExperienceApi get _client => ref.read(experienceApiProvider);

  LocalStore get _store => ref.read(localStoreProvider);

  Future<void> _setCart(Cart cart) async {
    state = AsyncValue.data(cart);
    await _store.writeCart(cart);
  }

  /// Returns the existing cart or creates one on first use.
  Future<Cart> _requireCart() async {
    final existing = state.value;
    if (existing != null) return existing;
    final cart = await _client.createCart();
    await _setCart(cart);
    return cart;
  }

  // ---- offline (local) cart helpers ---------------------------------------

  Product? _productFor(String variantId) {
    final products = ref.read(productsProvider).value ?? const <Product>[];
    for (final p in products) {
      if ((p.variantId ?? p.id) == variantId) return p;
    }
    return null;
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
          unitPrice ?? product?.price));
    }
    return _withItems(cart, items);
  }

  Future<void> addItem(
      {required String offerId,
      required String variantId,
      required int quantity,
      Money? unitPrice}) async {
    try {
      final cart = await _requireCart();
      final updated = await _client.addLineItem(cart.id, offerId, quantity);
      await _setCart(updated);
    } catch (_) {
      // Offline / demo: keep a working local cart rather than an error state.
      final base = state.value ?? const Cart(id: 'local_cart');
      await _setCart(
          _localAdd(base, variantId, quantity, unitPrice: unitPrice));
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
}

final cartProvider =
    NotifierProvider<CartNotifier, AsyncValue<Cart?>>(CartNotifier.new);
