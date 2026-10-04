import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../domain/order_models.dart';

/// Consumer order history.
///
/// Integration contract: `GET /store/orders`, `GET /store/orders/:id`,
/// `POST /store/orders/:id/cancel` and a returns endpoint. Dev fixtures stand
/// in until Medusa wires those. Cancel/return eligibility is a **backend
/// business rule** surfaced here as flags — the UI never guesses it.
class OrdersNotifier extends Notifier<List<CustomerOrder>> {
  @override
  List<CustomerOrder> build() => _seed();

  CustomerOrder? byId(String id) {
    for (final o in state) {
      if (o.id == id) return o;
    }
    return null;
  }

  void cancel(String id) {
    state = <CustomerOrder>[
      for (final o in state)
        if (o.id == id)
          o.copyWith(
            stage: OrderStage.cancelled,
            cancelEligible: false,
            returnEligible: false,
            timeline: <OrderEvent>[
              ...o.timeline,
              const OrderEvent(label: 'Cancelled', timeLabel: 'Just now', done: true),
            ],
          )
        else
          o,
    ];
  }

  void requestReturn(String id) {
    state = <CustomerOrder>[
      for (final o in state)
        if (o.id == id)
          o.copyWith(
            stage: OrderStage.returned,
            cancelEligible: false,
            returnEligible: false,
            timeline: <OrderEvent>[
              ...o.timeline,
              const OrderEvent(
                  label: 'Return requested', timeLabel: 'Just now', active: true),
            ],
          )
        else
          o,
    ];
  }
}

final ordersProvider =
    NotifierProvider<OrdersNotifier, List<CustomerOrder>>(OrdersNotifier.new);

final orderByIdProvider =
    Provider.family<CustomerOrder?, String>((ref, id) {
  for (final o in ref.watch(ordersProvider)) {
    if (o.id == id) return o;
  }
  return null;
});

List<CustomerOrder> _seed() => <CustomerOrder>[
      CustomerOrder(
        id: '12345',
        number: 'Order #BK-12345',
        dateLabel: 'Placed 24 Sep 2026',
        stage: OrderStage.delivered,
        addressLabel: 'B-24, Shanti Kunj, Bhiwadi, Rajasthan 301019',
        returnEligible: true,
        lines: const <OrderLine>[
          OrderLine(
              title: '18V Drill Kit',
              brand: 'BuildPro',
              productId: 'prod_drill',
              quantity: 1,
              unitPriceMinor: 649900),
          OrderLine(
              title: 'Angle Grinder 4 in',
              brand: 'Bosch',
              productId: 'prod_grinder',
              quantity: 1,
              unitPriceMinor: 329900),
          OrderLine(
              title: 'Ceramic Floor Tiles 600x600 Matt',
              brand: 'CERAMICA',
              productId: 'prod_tiles',
              quantity: 2,
              unitPriceMinor: 115000),
        ],
        timeline: const <OrderEvent>[
          OrderEvent(label: 'Order placed', timeLabel: '24 Sep, 10:12', done: true),
          OrderEvent(label: 'Packed', timeLabel: '24 Sep, 16:40', done: true),
          OrderEvent(label: 'Shipped', timeLabel: '25 Sep, 09:05', done: true),
          OrderEvent(label: 'Out for delivery', timeLabel: '26 Sep, 08:30', done: true),
          OrderEvent(label: 'Delivered', timeLabel: '26 Sep, 14:20', done: true),
        ],
      ),
      CustomerOrder(
        id: '12344',
        number: 'Order #BK-12344',
        dateLabel: 'Placed 27 Sep 2026',
        stage: OrderStage.shipped,
        addressLabel: 'B-24, Shanti Kunj, Bhiwadi, Rajasthan 301019',
        cancelEligible: true,
        lines: const <OrderLine>[
          OrderLine(
              title: 'CPVC Pipe 3/4 in',
              brand: 'Astral',
              productId: 'prod_cpvc',
              quantity: 10,
              unitPriceMinor: 8400),
          OrderLine(
              title: 'Ball Valve 25mm',
              brand: 'Zoloto',
              productId: 'prod_ballvalve',
              quantity: 5,
              unitPriceMinor: 18600),
        ],
        timeline: const <OrderEvent>[
          OrderEvent(label: 'Order placed', timeLabel: '27 Sep, 11:02', done: true),
          OrderEvent(label: 'Packed', timeLabel: '27 Sep, 18:15', done: true),
          OrderEvent(label: 'Shipped', timeLabel: '28 Sep, 09:40', done: true),
          OrderEvent(label: 'Out for delivery', timeLabel: 'Expected today', active: true),
          OrderEvent(label: 'Delivered', timeLabel: 'Expected today'),
        ],
      ),
      CustomerOrder(
        id: '12343',
        number: 'Order #BK-12343',
        dateLabel: 'Placed 01 Oct 2026',
        stage: OrderStage.processing,
        addressLabel: 'Plot 14, Industrial Area, Bhiwadi, Rajasthan 301019',
        cancelEligible: true,
        lines: const <OrderLine>[
          OrderLine(
              title: 'Emulsion Paint 20L',
              brand: 'Asian Paints',
              productId: 'prod_paint',
              quantity: 2,
              unitPriceMinor: 235000),
          OrderLine(
              title: 'Bathroom Fittings Set',
              brand: 'Jaquar',
              productId: 'prod_fittings',
              quantity: 1,
              unitPriceMinor: 245000),
        ],
        timeline: const <OrderEvent>[
          OrderEvent(label: 'Order placed', timeLabel: '01 Oct, 09:20', done: true),
          OrderEvent(label: 'Packed', timeLabel: 'In progress', active: true),
          OrderEvent(label: 'Shipped', timeLabel: 'Pending'),
          OrderEvent(label: 'Delivered', timeLabel: 'Pending'),
        ],
      ),
    ];
