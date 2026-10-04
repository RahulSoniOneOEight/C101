import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../domain/models.dart';
import '../domain/payment_models.dart';

/// Governed payment abstraction, mirroring the payments adapter contract:
/// `payments.create_order`, `payments.capture`, `payments.refund`.
///
/// The live Razorpay/Cashfree implementations create the order server-side
/// (provider keys are secrets) and then run the provider's client SDK. Until a
/// live backend is wired, staging uses [MockPaymentGateway] — matching the
/// repo's "mock in staging, real in prod" policy.
abstract interface class PaymentGateway {
  Future<PaymentResult> createAndCapture({
    required Money amount,
    required String orderRef,
  });

  Future<PaymentResult> refund({required String paymentId});
}

/// Deterministic mock used in staging/dev.
class MockPaymentGateway implements PaymentGateway {
  @override
  Future<PaymentResult> createAndCapture({
    required Money amount,
    required String orderRef,
  }) async {
    await Future<void>.delayed(const Duration(milliseconds: 400));
    return PaymentResult(
      id: 'pay_mock_${DateTime.now().microsecondsSinceEpoch}',
      status: PaymentStatus.captured,
      provider: PaymentProvider.mock,
    );
  }

  @override
  Future<PaymentResult> refund({required String paymentId}) async {
    return PaymentResult(
      id: paymentId,
      status: PaymentStatus.refunded,
      provider: PaymentProvider.mock,
    );
  }
}

/// Swappable gateway. Override this in tests or wire the live gateway here once
/// a payment backend exists.
final paymentGatewayProvider = Provider<PaymentGateway>(
  (ref) => MockPaymentGateway(),
);
