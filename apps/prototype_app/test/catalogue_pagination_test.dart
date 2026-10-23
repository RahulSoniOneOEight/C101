import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:prototype_app/data/experience_api.dart';
import 'package:prototype_app/domain/models.dart';

/// Serves the catalogue from an in-memory page list, including the `count` the
/// Experience API reports for a metadata-selected catalogue.
class _PagingAdapter implements HttpClientAdapter {
  _PagingAdapter(this.items);

  final List<Map<String, dynamic>> items;
  final List<Map<String, dynamic>> queries = <Map<String, dynamic>>[];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    queries.add(Map<String, dynamic>.of(options.queryParameters));
    final offset = int.parse('${options.queryParameters['offset'] ?? 0}');
    final limit = int.parse('${options.queryParameters['limit'] ?? 50}');
    final page = items.skip(offset).take(limit).toList();
    return ResponseBody.fromString(
      jsonEncode(<String, dynamic>{
        'products': page,
        'count': items.length,
      }),
      200,
      headers: <String, List<String>>{
        Headers.contentTypeHeader: <String>[Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

Map<String, dynamic> _product(String id, String sku) => <String, dynamic>{
      'id': id,
      'title': 'Product $id',
      'metadata': <String, dynamic>{
        'brand': 'BAUM',
        'catalogue_import': 'CHG-049',
        'category_l1': 'Tools & Hardware',
      },
      'categories': <dynamic>[
        <String, dynamic>{
          'id': 'pcat_tools',
          'name': 'Hand Tools',
          'parent_category_id': 'pcat_root',
        },
      ],
      'variants': <dynamic>[
        <String, dynamic>{
          'id': 'variant_$id',
          'title': 'Set - Hex',
          'sku': sku,
          'in_stock': true,
          'offer_count': 1,
          'best_price': <String, dynamic>{
            'id': 'offer_$id',
            'seller_name': 'BuildMaster Supplies',
            'variant_id': 'variant_$id',
            'currency_code': 'inr',
            'unit_amount_minor': 475000,
            'list_amount_minor': 475000,
            'inventory_quantity': 50,
          },
        },
      ],
      'best_price': <String, dynamic>{
        'id': 'offer_$id',
        'seller_name': 'BuildMaster Supplies',
        'variant_id': 'variant_$id',
        'currency_code': 'inr',
        'unit_amount_minor': 475000,
        'list_amount_minor': 475000,
        'inventory_quantity': 50,
      },
      'offer_count': 1,
    };

void main() {
  test('a grouped product keeps every variant price, SKU and traceability field',
      () {
    final product = Product.fromComposedJson(<String, dynamic>{
      'id': 'prod_1',
      'title': '1/2in Drive 24 Pcs Socket Set',
      'metadata': <String, dynamic>{
        'brand': 'BAUM',
        'catalogue_import': 'CHG-049',
        'category_l1': 'Tools & Hardware',
      },
      'categories': <dynamic>[
        <String, dynamic>{
          'id': 'pcat_tools',
          'name': 'Hand Tools',
          'parent_category_id': 'pcat_root',
        },
      ],
      'variants': <dynamic>[
        <String, dynamic>{
          'id': 'variant_hex',
          'title': 'Set - Hex',
          'sku': 'BAUM-237S1-SET-HEX',
          'in_stock': true,
          'offer_count': 1,
          'best_price': <String, dynamic>{
            'id': 'offer_hex',
            'seller_name': 'BuildMaster Supplies',
            'variant_id': 'variant_hex',
            'currency_code': 'inr',
            'unit_amount_minor': 475000,
            'list_amount_minor': 475000,
            'inventory_quantity': 50,
          },
        },
        <String, dynamic>{
          'id': 'variant_bihex',
          'title': 'Set - Bi Hex',
          'sku': 'BAUM-237S1-SET-BI-HEX',
          'in_stock': true,
          'offer_count': 1,
          'best_price': <String, dynamic>{
            'id': 'offer_bihex',
            'seller_name': 'BuildMaster Supplies',
            'variant_id': 'variant_bihex',
            'currency_code': 'inr',
            'unit_amount_minor': 499000,
            'list_amount_minor': 520000,
            'inventory_quantity': 50,
          },
        },
      ],
      'best_price': <String, dynamic>{
        'id': 'offer_hex',
        'seller_name': 'BuildMaster Supplies',
        'variant_id': 'variant_hex',
        'currency_code': 'inr',
        'unit_amount_minor': 475000,
        'list_amount_minor': 475000,
        'inventory_quantity': 50,
      },
      'offer_count': 2,
    });

    // One grouped product, two SKUs — never two product cards.
    expect(product.variantCount, 2);
    expect(product.variantLabel, '2 SKUs');
    expect(product.brand, 'BAUM');
    expect(product.brandLine, 'BAUM · 2 SKUs');
    expect(product.catalogueImport, 'CHG-049');
    expect(product.categoryId, 'pcat_tools');
    expect(product.categoryLabel, 'Tools & Hardware');

    final bihex = product.variants.last;
    expect(bihex.sku, 'BAUM-237S1-SET-BI-HEX');
    expect(bihex.price!.amount, 499000);
    expect(bihex.mrp!.amount, 520000);
    expect(bihex.offerId, 'offer_bihex');
    expect(bihex.sellerName, 'BuildMaster Supplies');
    expect(bihex.stockQty, 50);

    // The default SKU is the first sellable one, not an arbitrary variant.
    expect(product.defaultVariant!.id, 'variant_hex');
    expect(product.cartVariantId, 'variant_hex');
    expect(product.cartOfferId, 'offer_hex');

    // SKU search makes all 500 SKUs discoverable from 233 cards.
    expect(product.matchesQuery('BAUM-237S1-SET-BI-HEX'), isTrue);
    expect(product.matchesQuery('bi hex'), isTrue);
    expect(product.matchesQuery('no-such-sku'), isFalse);
  });

  test('an imported SKU never gets a derived MRP, discount or review tag', () {
    final imported = Product.fromComposedJson(<String, dynamic>{
      'id': 'prod_imported',
      'title': '1/2in Drive 24 Pcs Socket Set',
      'metadata': <String, dynamic>{
        'catalogue_import': 'CHG-049',
        'brand': 'BAUM',
      },
      'best_price': <String, dynamic>{
        'id': 'offer_1',
        'currency_code': 'inr',
        'unit_amount_minor': 475000,
        'list_amount_minor': 475000,
      },
    });
    // The source price is the truth: no invented higher list price, no badge.
    expect(imported.price!.amount, 475000);
    expect(imported.mrp, isNull);
    expect(imported.discountPercent, isNull);
    expect(imported.badges, isEmpty);

    final demo = Product.fromComposedJson(<String, dynamic>{
      'id': 'prod_review',
      'title': 'Review Product',
      'best_price': <String, dynamic>{
        'id': 'offer_r',
        'currency_code': 'INR',
        'unit_amount_minor': 10000,
        'list_amount_minor': 10000,
      },
    });
    // The demonstration catalogue keeps its review-only enrichment.
    expect(demo.mrp, isNotNull);
    expect(demo.badges, isNotEmpty);
  });

  test('the catalogue is read across pages until the reported count', () async {
    final adapter = _PagingAdapter(<Map<String, dynamic>>[
      _product('prod_1', 'SKU-1'),
      _product('prod_2', 'SKU-2'),
      _product('prod_3', 'SKU-3'),
    ]);
    final dio = Dio(BaseOptions(baseUrl: 'https://example.test'))
      ..httpClientAdapter = adapter;
    final api = ExperienceApi(dio);

    final products = await api.getAllComposedProducts(
      catalogueImport: 'CHG-049',
      channel: 'b2b',
      pageSize: 2,
    );

    expect(products, hasLength(3));
    expect(products.map((p) => p.id), <String>['prod_1', 'prod_2', 'prod_3']);
    // Two pages: 2 + 1, then the count is reached.
    expect(adapter.queries, hasLength(2));
    expect(adapter.queries.first['catalogue_import'], 'CHG-049');
    expect(adapter.queries.first['channel'], 'b2b');
    expect(adapter.queries.first['limit'], 2);
    expect(adapter.queries.last['offset'], 2);
  });

  test('without a count, a full page is followed by an empty page', () async {
    final adapter = _NoCountAdapter();
    final dio = Dio(BaseOptions(baseUrl: 'https://example.test'))
      ..httpClientAdapter = adapter;
    final api = ExperienceApi(dio);

    final products = await api.getAllComposedProducts(pageSize: 2);
    expect(products, hasLength(2));
    expect(adapter.calls, 2);
  });

  test('without a count, a short first page ends the scan immediately',
      () async {
    final adapter = _NoCountAdapter(onlyFirst: true);
    final dio = Dio(BaseOptions(baseUrl: 'https://example.test'))
      ..httpClientAdapter = adapter;
    final api = ExperienceApi(dio);

    final products = await api.getAllComposedProducts(pageSize: 2);
    expect(products, hasLength(1));
    expect(adapter.calls, 1);
  });
}

class _NoCountAdapter implements HttpClientAdapter {
  _NoCountAdapter({this.onlyFirst = false});

  final bool onlyFirst;
  int calls = 0;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    calls++;
    final offset = int.parse('${options.queryParameters['offset'] ?? 0}');
    return ResponseBody.fromString(
      jsonEncode(<String, dynamic>{
        'products': offset == 0
            ? <dynamic>[
                _product('prod_1', 'SKU-1'),
                if (!onlyFirst) _product('prod_2', 'SKU-2'),
              ]
            : <dynamic>[],
      }),
      200,
      headers: <String, List<String>>{
        Headers.contentTypeHeader: <String>[Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}
