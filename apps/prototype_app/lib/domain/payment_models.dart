/// Payment providers, mirroring the governed `connectors/provider-registry.yaml`
/// candidates (razorpay, cashfree) plus the staging mock and cash-on-delivery.
enum PaymentProvider { mock, razorpay, cashfree, cod }

/// Lifecycle of a payment, mirroring the `payment.*` events.
enum PaymentStatus { pending, captured, failed, refunded }

/// Result of a payment operation.
class PaymentResult {
  const PaymentResult({
    required this.id,
    required this.status,
    required this.provider,
    this.error,
  });

  final String id;
  final PaymentStatus status;
  final PaymentProvider provider;
  final String? error;

  bool get isCaptured => status == PaymentStatus.captured;
}
