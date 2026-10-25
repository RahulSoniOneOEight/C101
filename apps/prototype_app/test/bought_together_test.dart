import 'package:flutter_test/flutter_test.dart';
import 'package:prototype_app/domain/bought_together.dart';

void main() {
  test('parses an in-stock reciprocal pair', () {
    final pair = BoughtTogether.fromJson(<String, dynamic>{
      'pair_id': 'btp_1',
      'channel': 'b2c',
      'paired_availability': 'in_stock',
      'paired': <String, dynamic>{
        'id': 'prod_b',
        'title': 'Ratchet Handle',
        'thumbnail': 'https://example.test/ratchet.jpg',
        'description': '3/8in ratchet',
        'handle': 'ratchet-handle',
        'metadata': <String, dynamic>{'brand': 'BuildMaster'},
        'categories': <dynamic>[],
        'badges': <dynamic>[],
        'variants': <dynamic>[
          <String, dynamic>{
            'id': 'variant_b',
            'title': 'Default',
            'sku': 'RATCHET-38',
            'best_price': <String, dynamic>{
              'id': 'offer_b',
              'seller_id': 'seller_b',
              'variant_id': 'variant_b',
              'currency_code': 'INR',
              'unit_amount_minor': 125000,
              'list_amount_minor': 150000,
              'in_stock': true,
            },
            'offer_count': 1,
            'in_stock': true,
          },
        ],
        'best_price': <String, dynamic>{
          'id': 'offer_b',
          'seller_id': 'seller_b',
          'variant_id': 'variant_b',
          'currency_code': 'INR',
          'unit_amount_minor': 125000,
          'list_amount_minor': 150000,
          'in_stock': true,
        },
        'offer_count': 1,
      },
    });

    expect(pair.hasPair, isTrue);
    expect(pair.paired?.title, 'Ratchet Handle');
    expect(pair.paired?.price?.amount, 125000);
    expect(pair.isOutOfStock, isFalse);
  });

  test('parses an out-of-stock pair without inventing a price', () {
    final pair = BoughtTogether.fromJson(<String, dynamic>{
      'pair_id': 'btp_2',
      'channel': 'b2c',
      'paired_availability': 'out_of_stock',
      'paired': <String, dynamic>{
        'id': 'prod_b',
        'title': 'Ratchet Handle',
        'thumbnail': null,
        'variants': <dynamic>[],
        'best_price': null,
        'offer_count': 1,
      },
    });

    expect(pair.hasPair, isTrue);
    expect(pair.isOutOfStock, isTrue);
    expect(pair.paired?.price, isNull);
  });
}
