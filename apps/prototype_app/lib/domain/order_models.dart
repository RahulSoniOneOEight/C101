import 'models.dart';

/// Consumer order models for the B2C account ("My Orders").
///
/// Integration contract: `GET /store/orders` +
/// `GET /store/orders/:id` (Medusa). Actions map to
/// `POST /store/orders/:id/cancel` and a returns endpoint. Dev fixtures stand
/// in until those are wired.

enum OrderStage { processing, shipped, delivered, cancelled, returned }

extension OrderStageX on OrderStage {
  String get label => switch (this) {
        OrderStage.processing => 'Processing',
        OrderStage.shipped => 'Shipped',
        OrderStage.delivered => 'Delivered',
        OrderStage.cancelled => 'Cancelled',
        OrderStage.returned => 'Returned',
      };
}

/// A single line in an order.
class OrderLine {
  const OrderLine({
    required this.title,
    required this.quantity,
    required this.unitPriceMinor,
    this.brand,
    this.productId,
  });

  final String title;
  final String? brand;
  final String? productId;
  final int quantity;
  final int unitPriceMinor;

  Money get unitPrice =>
      Money(amount: unitPriceMinor, currencyCode: 'INR');

  Money get lineTotal =>
      Money(amount: unitPriceMinor * quantity, currencyCode: 'INR');
}

/// A tracking event in the order timeline.
class OrderEvent {
  const OrderEvent({required this.label, required this.timeLabel, this.done = false, this.active = false});

  final String label;
  final String timeLabel;
  final bool done;
  final bool active;
}

/// A consumer order.
class CustomerOrder {
  const CustomerOrder({
    required this.id,
    required this.number,
    required this.dateLabel,
    required this.stage,
    required this.lines,
    required this.addressLabel,
    required this.timeline,
    this.cancelEligible = false,
    this.returnEligible = false,
  });

  final String id;
  final String number;
  final String dateLabel;
  final OrderStage stage;
  final List<OrderLine> lines;
  final String addressLabel;
  final List<OrderEvent> timeline;

  /// Business-rule flags surfaced by the backend (not UI guesses).
  final bool cancelEligible;
  final bool returnEligible;

  int get itemCount => lines.fold(0, (sum, l) => sum + l.quantity);

  Money get total => Money(
        amount: lines.fold(0, (sum, l) => sum + l.lineTotal.amount),
        currencyCode: 'INR',
      );

  CustomerOrder copyWith({
    OrderStage? stage,
    bool? cancelEligible,
    bool? returnEligible,
    List<OrderEvent>? timeline,
  }) =>
      CustomerOrder(
        id: id,
        number: number,
        dateLabel: dateLabel,
        stage: stage ?? this.stage,
        lines: lines,
        addressLabel: addressLabel,
        timeline: timeline ?? this.timeline,
        cancelEligible: cancelEligible ?? this.cancelEligible,
        returnEligible: returnEligible ?? this.returnEligible,
      );
}
