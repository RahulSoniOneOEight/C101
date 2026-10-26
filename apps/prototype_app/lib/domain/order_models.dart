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
    this.lineKey = '',
    this.sku = '',
    this.deliveredQty = 0,
    this.returnableQty = 0,
    this.returnEligible = false,
    this.ineligibleReason,
    this.deadline,
    this.allowedReasons = const <String>[],
  });

  final String title;
  final String? brand;
  final String? productId;
  final int quantity;
  final int unitPriceMinor;
  final String lineKey;
  final String sku;
  final int deliveredQty;
  final int returnableQty;
  final bool returnEligible;
  final String? ineligibleReason;
  final DateTime? deadline;
  final List<String> allowedReasons;

  Money get unitPrice => Money(amount: unitPriceMinor, currencyCode: 'INR');

  Money get lineTotal =>
      Money(amount: unitPriceMinor * quantity, currencyCode: 'INR');
}

/// A tracking event in the order timeline.
class OrderEvent {
  const OrderEvent(
      {required this.label,
      required this.timeLabel,
      this.done = false,
      this.active = false});

  final String label;
  final String timeLabel;
  final bool done;
  final bool active;
}

class ShipmentLine {
  const ShipmentLine({
    required this.lineKey,
    required this.sku,
    required this.orderedQty,
    required this.deliveredQty,
  });

  final String lineKey;
  final String sku;
  final int orderedQty;
  final int deliveredQty;

  factory ShipmentLine.fromJson(Map<String, dynamic> json) => ShipmentLine(
        lineKey: (json['lineKey'] ?? json['line_key']) as String? ?? '',
        sku: json['sku'] as String? ?? '',
        orderedQty:
            ((json['orderedQty'] ?? json['ordered_qty']) as num?)?.toInt() ?? 0,
        deliveredQty: ((json['deliveredQty'] ?? json['delivered_qty']) as num?)
                ?.toInt() ??
            0,
      );
}

class ShipmentEvent {
  const ShipmentEvent({
    required this.id,
    required this.status,
    required this.eventType,
    required this.occurredAt,
    this.providerEventId = '',
  });

  final String id;
  final String status;
  final String eventType;
  final DateTime? occurredAt;
  final String providerEventId;

  factory ShipmentEvent.fromJson(Map<String, dynamic> json) => ShipmentEvent(
        id: json['id'] as String? ?? '',
        status: json['status'] as String? ?? 'booked',
        eventType: (json['eventType'] ?? json['event_type']) as String? ??
            'shipment.status_changed',
        occurredAt: DateTime.tryParse(
          (json['occurredAt'] ?? json['occurred_at']) as String? ?? '',
        ),
        providerEventId:
            (json['providerEventId'] ?? json['provider_event_id']) as String? ??
                '',
      );
}

class Shipment {
  const Shipment({
    required this.id,
    required this.status,
    required this.trackingNumber,
    required this.provider,
    required this.lines,
    this.deliveredAt,
    this.proofRef,
    this.events = const <ShipmentEvent>[],
  });

  final String id;
  final String status;
  final String trackingNumber;
  final String provider;
  final DateTime? deliveredAt;
  final String? proofRef;
  final List<ShipmentLine> lines;
  final List<ShipmentEvent> events;

  factory Shipment.fromJson(Map<String, dynamic> json) => Shipment(
        id: json['id'] as String? ?? '',
        status: json['status'] as String? ?? 'booked',
        trackingNumber:
            (json['trackingNumber'] ?? json['tracking_number']) as String? ??
                '',
        provider: json['provider'] as String? ?? 'simulated',
        deliveredAt: DateTime.tryParse(
          (json['deliveredAt'] ?? json['delivered_at']) as String? ?? '',
        ),
        proofRef: (json['proofRef'] ?? json['proof_ref']) as String?,
        lines: (json['lines'] as List? ?? const <dynamic>[])
            .whereType<Map<String, dynamic>>()
            .map(ShipmentLine.fromJson)
            .toList(),
        events: (json['events'] as List? ?? const <dynamic>[])
            .whereType<Map<String, dynamic>>()
            .map(ShipmentEvent.fromJson)
            .toList(),
      );
}

class ReturnSummary {
  const ReturnSummary({
    required this.id,
    required this.status,
    required this.resolution,
    required this.lines,
  });

  final String id;
  final String status;
  final String resolution;
  final List<OrderLine> lines;

  factory ReturnSummary.fromJson(Map<String, dynamic> json) => ReturnSummary(
        id: json['id'] as String? ?? '',
        status: json['status'] as String? ?? 'requested',
        resolution: json['resolution'] as String? ?? 'refund',
        lines: (json['lines'] as List? ?? const <dynamic>[])
            .whereType<Map<String, dynamic>>()
            .map((line) => OrderLine(
                  title: line['sku'] as String? ?? 'Returned item',
                  quantity: ((line['approvedQty'] ??
                              line['approved_qty'] ??
                              line['requestedQty'] ??
                              line['requested_qty']) as num?)
                          ?.toInt() ??
                      0,
                  unitPriceMinor: 0,
                  lineKey:
                      (line['lineKey'] ?? line['line_key']) as String? ?? '',
                  sku: line['sku'] as String? ?? '',
                ))
            .toList(),
      );
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
    this.shipments = const <Shipment>[],
    this.returns = const <ReturnSummary>[],
    this.returnStatus,
    this.medusaOrderGroupId,
    this.subtotalMinor,
    this.shippingMinor,
    this.discountMinor,
    this.totalMinor,
    this.currencyCode = 'INR',
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
  final List<Shipment> shipments;
  final List<ReturnSummary> returns;
  final String? returnStatus;
  final String? medusaOrderGroupId;

  /// Server-owned order money in minor units. Null on orders written before the
  /// completion payload carried a summary; the UI then falls back to line totals.
  final int? subtotalMinor;
  final int? shippingMinor;
  final int? discountMinor;
  final int? totalMinor;
  final String currencyCode;

  int get itemCount => lines.fold(0, (sum, l) => sum + l.quantity);

  Money? get subtotal => subtotalMinor == null
      ? null
      : Money(amount: subtotalMinor!, currencyCode: currencyCode);

  Money? get shipping => shippingMinor == null
      ? null
      : Money(amount: shippingMinor!, currencyCode: currencyCode);

  Money? get discount => discountMinor == null
      ? null
      : Money(amount: discountMinor!, currencyCode: currencyCode);

  /// Server-owned order total (items + shipping - discounts). Falls back to the
  /// line sum only for legacy payloads that predate the stored summary.
  Money get total => Money(
        amount:
            totalMinor ?? lines.fold(0, (sum, l) => sum + l.lineTotal.amount),
        currencyCode: currencyCode,
      );

  factory CustomerOrder.fromApi(Map<String, dynamic> json) {
    final eligibility = <String, Map<String, dynamic>>{};
    for (final item
        in (json['return_eligibility'] as List? ?? const <dynamic>[])
            .whereType<Map<String, dynamic>>()) {
      eligibility[item['line_key'] as String? ?? ''] = item;
    }
    final rawLines = (json['lines'] as List? ?? const <dynamic>[])
        .whereType<Map<String, dynamic>>()
        .toList();
    final lines = rawLines.map((line) {
      final lineKey = line['line_key'] as String? ?? '';
      final eligible = eligibility[lineKey];
      return OrderLine(
        title: line['title'] as String? ?? 'Ordered item',
        quantity: (line['quantity'] as num?)?.toInt() ?? 0,
        unitPriceMinor: (line['unit_price'] as num?)?.toInt() ?? 0,
        productId: line['product_id'] as String?,
        lineKey: lineKey,
        sku: line['sku'] as String? ?? '',
        deliveredQty: (eligible?['delivered_qty'] as num?)?.toInt() ?? 0,
        returnableQty: (eligible?['returnable_qty'] as num?)?.toInt() ?? 0,
        returnEligible: eligible?['eligible'] as bool? ?? false,
        ineligibleReason: eligible?['ineligible_reason'] as String?,
        deadline: DateTime.tryParse(eligible?['deadline'] as String? ?? ''),
        allowedReasons:
            (eligible?['allowed_reasons'] as List? ?? const <dynamic>[])
                .whereType<String>()
                .toList(),
      );
    }).toList();
    final shipments = (json['shipments'] as List? ?? const <dynamic>[])
        .whereType<Map<String, dynamic>>()
        .map(Shipment.fromJson)
        .toList();
    final returns = (json['returns'] as List? ?? const <dynamic>[])
        .whereType<Map<String, dynamic>>()
        .map(ReturnSummary.fromJson)
        .toList();
    final created = DateTime.tryParse(json['created_at'] as String? ?? '');
    final currency =
        (json['currency_code'] as String?)?.trim().toUpperCase() ?? 'INR';
    int? minor(String key) => (json[key] as num?)?.toInt();
    final serverNumber = (json['order_number'] as String?)?.trim();
    final anyDelivered =
        shipments.any((shipment) => shipment.status == 'delivered');
    final anyShipped = shipments.any((shipment) => [
          'in_transit',
          'out_for_delivery',
          'picked_up'
        ].contains(shipment.status));
    final status = json['status'] as String? ?? 'confirmed';
    final stage = status != 'confirmed'
        ? OrderStage.processing
        : anyDelivered
            ? OrderStage.delivered
            : anyShipped
                ? OrderStage.shipped
                : OrderStage.processing;
    final shipmentEvents = shipments
        .expand((shipment) => shipment.events)
        .where((event) => event.occurredAt != null)
        .toList()
      ..sort((left, right) => left.occurredAt!.compareTo(right.occurredAt!));
    final timeline = <OrderEvent>[
      OrderEvent(
        label: 'Order placed',
        timeLabel: created == null ? '' : _dateLabel(created),
        done: true,
      ),
      if (shipmentEvents.isEmpty)
        for (final shipment in shipments)
          OrderEvent(
            label: shipment.status.replaceAll('_', ' '),
            timeLabel: shipment.deliveredAt == null
                ? 'Simulated delivery'
                : _dateLabel(shipment.deliveredAt!),
            done: shipment.status == 'delivered',
          )
      else
        for (final event in shipmentEvents)
          OrderEvent(
            label: _statusLabel(event.status),
            timeLabel: _dateTimeLabel(event.occurredAt!),
            done: event != shipmentEvents.last ||
                const <String>[
                  'delivered',
                  'rto_delivered',
                  'cancelled',
                ].contains(event.status),
            active: event == shipmentEvents.last &&
                !const <String>['delivered', 'rto_delivered', 'cancelled']
                    .contains(event.status),
          ),
    ];
    return CustomerOrder(
      id: json['order_id'] as String? ?? '',
      number: (serverNumber != null && serverNumber.isNotEmpty)
          ? serverNumber
          : 'Order #BK-${json['order_id'] ?? ''}',
      dateLabel:
          created == null ? 'Staging order' : 'Placed ${_dateLabel(created)}',
      stage: stage,
      lines: lines,
      addressLabel: 'Delivery address captured at checkout',
      timeline: timeline,
      returnEligible: lines.any((line) => line.returnEligible),
      shipments: shipments,
      returns: returns,
      returnStatus: returns.isEmpty ? null : returns.first.status,
      medusaOrderGroupId: json['medusa_order_group_id'] as String?,
      subtotalMinor: minor('subtotal_minor'),
      shippingMinor: minor('shipping_minor'),
      discountMinor: minor('discount_minor'),
      totalMinor: minor('total_minor'),
      currencyCode: currency,
    );
  }

  static String _dateLabel(DateTime value) =>
      '${value.day} ${_month(value.month)} ${value.year}';

  static String _dateTimeLabel(DateTime value) {
    final hour = value.hour.toString().padLeft(2, '0');
    final minute = value.minute.toString().padLeft(2, '0');
    return '${value.day} ${_month(value.month)}, $hour:$minute';
  }

  static String _statusLabel(String value) {
    final words = value.replaceAll('_', ' ');
    return words.isEmpty
        ? 'Shipment update'
        : words[0].toUpperCase() + words.substring(1);
  }

  static String _month(int month) => const <String>[
        'Jan',
        'Feb',
        'Mar',
        'Apr',
        'May',
        'Jun',
        'Jul',
        'Aug',
        'Sep',
        'Oct',
        'Nov',
        'Dec',
      ][month - 1];

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
        shipments: shipments,
        returns: returns,
        returnStatus: returnStatus,
        medusaOrderGroupId: medusaOrderGroupId,
      );
}
