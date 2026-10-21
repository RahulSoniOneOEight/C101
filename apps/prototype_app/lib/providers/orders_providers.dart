import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/experience_api.dart';
import '../domain/order_models.dart';

/// API-backed consumer order history.
///
/// Order success, shipment state and return eligibility are server-owned. There is no seeded order
/// fallback: a failure is shown as an error and a successful empty response is shown as empty.
class ApiOrdersNotifier extends AsyncNotifier<List<CustomerOrder>> {
  @override
  Future<List<CustomerOrder>> build() => _load();

  Future<List<CustomerOrder>> _load() async {
    final items = await ref.read(experienceApiProvider).getMyOrders();
    return items.map(CustomerOrder.fromApi).toList();
  }

  Future<void> refresh() async {
    state = const AsyncValue<List<CustomerOrder>>.loading();
    state = await AsyncValue.guard(_load);
  }
}

final apiOrdersProvider =
    AsyncNotifierProvider<ApiOrdersNotifier, List<CustomerOrder>>(
  ApiOrdersNotifier.new,
);

/// API-backed single order, including the shipment timeline and per-line return eligibility.
final apiOrderProvider =
    FutureProvider.family<CustomerOrder?, String>((ref, orderId) async {
  final data = await ref.watch(experienceApiProvider).getOrder(orderId);
  return CustomerOrder.fromApi(data);
});

final returnByIdProvider =
    FutureProvider.family<Map<String, dynamic>, String>((ref, returnId) {
  return ref.watch(experienceApiProvider).getReturn(returnId);
});
