import 'package:flutter_test/flutter_test.dart';
import 'package:prototype_app/domain/order_models.dart';

void main() {
  test('parses the Experience API camelCase shipment and return projection',
      () {
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
              'id': 'shev_booked',
              'status': 'booked',
              'eventType': 'booked',
              'occurredAt': '2026-10-21T10:26:27.683Z',
              'providerEventId': 'booked:alloc_01TEST',
            },
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
    expect(shipment.events.last.eventType, 'seller.shipment.delivered');
    expect(order.timeline.every((event) => event.done), isTrue);
    expect(order.timeline.last.label, 'Delivered');
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
        {
          'line_key': 'cali',
          'sku': 'SKU',
          'ordered_qty': 2,
          'delivered_qty': 0
        },
      ],
    });

    expect(shipment.trackingNumber, 'SIM-LEGACY');
    expect(shipment.lines.single.orderedQty, 2);
  });

  test('renders the server order number and money summary', () {
    final order = CustomerOrder.fromApi(<String, dynamic>{
      'order_id': 'cart_01TEST',
      'order_number': 'BK-261026-0Z4M7Q',
      'medusa_order_group_id': 'og_01TEST',
      'status': 'confirmed',
      'currency_code': 'inr',
      'subtotal_minor': 399000,
      'shipping_minor': 9900,
      'discount_minor': 0,
      'total_minor': 408900,
      'lines': <Map<String, dynamic>>[
        {
          'line_key': 'cali_01TEST',
          'sku': 'BAUM-237S1-SET-HEX',
          'title': 'Socket Set',
          'quantity': 1,
          'unit_price': 399000,
        },
      ],
    });

    expect(order.number, 'BK-261026-0Z4M7Q');
    expect(order.subtotal?.formatted, '\u20B93,990');
    expect(order.shipping?.formatted, '\u20B999');
    expect(order.total.formatted, '\u20B94,089');
  });

  test('legacy order without a money summary falls back to line totals', () {
    final order = CustomerOrder.fromApi(<String, dynamic>{
      'order_id': 'cart_01LEGACY',
      'medusa_order_group_id': 'og_01LEGACY',
      'status': 'confirmed',
      'lines': <Map<String, dynamic>>[
        {
          'line_key': 'cali',
          'sku': 'SKU-1',
          'title': 'Plywood Sheet',
          'quantity': 1,
          'unit_price': 399000,
        },
      ],
    });

    expect(order.number, 'Order #BK-cart_01LEGACY');
    expect(order.subtotal, isNull);
    expect(order.shipping, isNull);
    expect(order.total.formatted, '\u20B93,990');
  });

  test('shows the delivery address captured with the order', () {
    final order = CustomerOrder.fromApi(<String, dynamic>{
      'order_id': 'cart_01ADDR',
      'order_number': 'BK-261031-ADDR01',
      'medusa_order_group_id': 'og_01ADDR',
      'status': 'confirmed',
      'shipping_address': <String, dynamic>{
        'address_1': '12 Test Lane',
        'address_2': 'Andheri East',
        'city': 'Mumbai',
        'province': 'Maharashtra',
        'postal_code': '400001',
      },
      'lines': <Map<String, dynamic>>[
        {
          'line_key': 'cali_addr',
          'sku': 'SKU-ADDR',
          'title': 'Tape',
          'quantity': 1,
          'unit_price': 43200,
        },
      ],
    });

    expect(order.addressLabel,
        '12 Test Lane, Andheri East, Mumbai, Maharashtra 400001');
  });

  test('falls back when the order has no address snapshot', () {
    final order = CustomerOrder.fromApi(<String, dynamic>{
      'order_id': 'cart_01NOADDR',
      'medusa_order_group_id': 'og_01NOADDR',
      'status': 'confirmed',
      'lines': <Map<String, dynamic>>[
        {
          'line_key': 'cali_no_addr',
          'sku': 'SKU-NOADDR',
          'title': 'Tape',
          'quantity': 1,
          'unit_price': 43200,
        },
      ],
    });

    expect(order.addressLabel, 'Delivery address captured at checkout');
  });
}
