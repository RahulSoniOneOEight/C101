import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:prototype_app/data/experience_api.dart';
import 'package:prototype_app/data/local_store.dart';
import 'package:prototype_app/domain/workspace_models.dart';
import 'package:prototype_app/widgets/cart_build_sheet.dart';

class _CartApi extends ExperienceApi {
  _CartApi() : super(Dio());

  @override
  Future<Map<String, dynamic>> getProduct(String productId,
          {String channel = 'b2c'}) async =>
      <String, dynamic>{
        'id': productId,
        'offers': <Map<String, dynamic>>[
          <String, dynamic>{
            'id': 'offer_current',
            'seller_id': 'seller_1',
            'seller_name': 'Current seller',
            'variant_id': 'variant_1',
            'currency_code': 'inr',
            'unit_amount_minor': 12000,
            'inventory_quantity': 10,
            'in_stock': true,
          },
        ],
      };
}

const _line = DraftLine(
  lineKey: 'line_1',
  productId: 'prod_1',
  variantId: 'variant_1',
  sellerId: 'seller_1',
  offerId: 'offer_snapshot',
  quantity: 2,
  unitAmountMinor: 10000,
  currencyCode: 'INR',
  productTitle: 'Roofing sheet',
  sellerName: 'Original seller',
  sku: 'SKU-1',
);

const _view = WorkspaceDraftView(
  draft: WorkspaceDraft(
    id: 'drf_1',
    workspaceId: 'ws_1',
    channelId: 'ch_1',
    name: 'Shared list',
    lifecycleStatus: 'draft',
    validationStatus: 'unvalidated',
    currentVersion: 1,
    role: 'owner',
  ),
  revision: DraftRevision(
    id: 'rev_1',
    version: 1,
    commercialHash: 'hash_1',
    lines: <DraftLine>[_line],
  ),
  proposals: <DraftProposal>[],
);

void main() {
  testWidgets('cart review shows differences and requires acknowledgement',
      (tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(390, 844);
    addTearDown(tester.view.reset);

    SharedPreferences.setMockInitialValues(<String, Object>{});
    final prefs = await SharedPreferences.getInstance();
    final container = ProviderContainer(
      overrides: <Override>[
        experienceApiProvider.overrideWithValue(_CartApi()),
        localStoreProvider.overrideWithValue(LocalStore(prefs)),
      ],
    );
    addTearDown(container.dispose);

    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: MaterialApp(
          theme: AgencyTheme.light(),
          home: Scaffold(
            body: Builder(
              builder: (context) => Center(
                child: FilledButton(
                  onPressed: () => showCartBuildSheet(
                    context,
                    view: _view,
                    business: false,
                  ),
                  child: const Text('Open review'),
                ),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Open review'));
    await tester.pumpAndSettle();

    expect(find.text('Review before cart build'), findsOneWidget);
    expect(find.textContaining('Price ₹'), findsOneWidget);
    expect(find.text('I acknowledge these differences'), findsOneWidget);
    var button = tester.widget<FilledButton>(
      find.widgetWithText(FilledButton, 'Add confirmed lines to cart'),
    );
    expect(button.onPressed, isNull);

    await tester.tap(find.text('I acknowledge these differences'));
    await tester.pumpAndSettle();
    button = tester.widget<FilledButton>(
      find.widgetWithText(FilledButton, 'Add confirmed lines to cart'),
    );
    expect(button.onPressed, isNotNull);
    expect(tester.takeException(), isNull);
  });
}
