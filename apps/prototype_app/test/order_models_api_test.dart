import 'package:flutter_test/flutter_test.dart';
import 'package:prototype_app/domain/order_models.dart';

void main() {
  test('parses the Experience API camelCase shipment and return projection', () {
    final order = CustomerOrder.fromApi(<String, dynamic>{
      'order_id': 'cart_01TEST',
      'medusa_order_group_id': 'og_01TEST',
      'status': 'confirmed',
      'lines': <Map<String, dynamic>>[
        {
          'line_key': 'cali_01TEST',
          'sku': 'SKU-1',
          'title': 'Plywood Sheet',
          'quantity': 3,
          'unit_price': 100,
        },
      ],
      'return_eligibility': <Map<String, dynamic>>[
        {
          'line_key': 'cali_01TEST',
          'delivered_qty': 3,
          'returnable_qty': 1,
          'eligible': true,
        },
      ],
      'shipments': <Map<String, dynamic>>[
        {
          'id': 'ship_01TEST',
          'status': 'delivered',
          'trackingNumber': 'SIM-TRACK-1',
          'provider': 'simulated',
          'deliveredAt': '2026-10-21T10:26:46.223Z',
          'proofRef': 'staging://proof',
          'lines': <Map<String, dynamic>>[
            {
              'lineKey': 'cali_01TEST',
              'sku': 'SKU-1',
              'orderedQty': 3,
              'deliveredQty': 3,
            },
          ],
          'events': <Map<String, dynamic>>[
            {
              'id': 'shev_01TEST',
              'status': 'delivered',
              'eventType': 'seller.shipment.delivered',
              'occurredAt': '2026-10-21T10:26:46.223Z',
              'providerEventId': 'seller:01TEST',
            },
          ],
        },
      ],
      'returns': <Map<String, dynamic>>[
        {
          'id': 'ret_01TEST',
          'status': 'approved',
          'resolution': 'refund',
          'lines': <Map<String, dynamic>>[
            {
              'lineKey': 'cali_01TEST',
              'sku': 'SKU-1',
              'requestedQty': 2,
              'approvedQty': 2,
            },
          ],
        },
      ],
    });

    final shipment = order.shipments.single;
    expect(shipment.trackingNumber, 'SIM-TRACK-1');
    expect(shipment.proofRef, 'staging://proof');
    expect(shipment.lines.single.orderedQty, 3);
    expect(shipment.lines.single.deliveredQty, 3);
    expect(shipment.events.single.eventType, 'seller.shipment.delivered');
    expect(order.returns.single.status, 'approved');
    expect(order.returns.single.lines.single.quantity, 2);
    expect(order.returnStatus, 'approved');
  });

  test('still parses legacy snake_case shipment payloads', () {
    final shipment = Shipment.fromJson(<String, dynamic>{
      'id': 'ship_legacy',
      'status': 'booked',
      'tracking_number': 'SIM-LEGACY',
      'lines': <Map<String, dynamic>>[
        {'line_key': 'cali', 'sku': 'SKU', 'ordered_qty': 2, 'delivered_qty': 0},
      ],
    });

    expect(shipment.trackingNumber, 'SIM-LEGACY');
    expect(shipment.lines.single.orderedQty, 2);
  });
}
