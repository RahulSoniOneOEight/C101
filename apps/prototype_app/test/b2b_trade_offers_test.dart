import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:prototype_app/domain/presentation.dart';
import 'package:prototype_app/providers/catalog_providers.dart';
import 'package:prototype_app/providers/trade_offers_providers.dart';

/// The B2B trade surface used to decide its own categories and order. It now takes the order, labels
/// and visibility from the layout an operator publishes for the b2b channel, while product membership
/// still resolves through the governed offers path. These assertions pin both halves down, and pin the
/// fallback so a channel with no layout keeps working.
StorefrontSection _child(String placement, {String? title, bool visible = true}) =>
    StorefrontSection(placement: placement, label: placement, title: title, visible: visible);

StorefrontSection _group(List<StorefrontSection> children, {bool visible = true}) =>
    StorefrontSection(
      placement: 'trade_offers',
      label: 'Trade Offers & Deals',
      visible: visible,
      children: children,
    );

ProviderContainer _container(List<StorefrontSection> sections) {
  final container = ProviderContainer(
    overrides: [
      b2bLayoutSectionsProvider.overrideWith((ref) async => sections),
    ],
  );
  addTearDown(container.dispose);
  return container;
}

void main() {
  test('with no layout published the governed local defaults still drive the rail', () async {
    final container = _container(const <StorefrontSection>[]);
    await container.read(b2bLayoutSectionsProvider.future);

    final featured = container.read(featuredTradeOffersProvider);
    expect(
      featured.map((c) => c.title).toList(),
      <String>['Seasonal', 'Best Deals', 'Schemes'],
      reason: 'an unauthored channel keeps its defaults rather than rendering nothing',
    );
  });

  test('the layout decides trade-offer order, labels and visibility', () async {
    final container = _container(<StorefrontSection>[
      _group(<StorefrontSection>[
        _child('schemes', title: 'Dealer Schemes'),
        _child('best_deals', visible: false),
        _child('seasonal', title: 'Monsoon Picks'),
      ]),
    ]);
    await container.read(b2bLayoutSectionsProvider.future);

    final featured = container.read(featuredTradeOffersProvider);
    expect(
      featured.map((c) => c.title).toList(),
      <String>['Dealer Schemes', 'Monsoon Picks'],
      reason: 'order comes from the layout and a hidden child does not render',
    );
    expect(featured.first.id, 'off_schemes');
    expect(
      featured.first.productIds,
      isNotEmpty,
      reason: 'product membership still resolves through the offers path, not the layout',
    );
  });

  test('a child the app cannot render is skipped rather than shown as an empty tile', () async {
    final container = _container(<StorefrontSection>[
      _group(<StorefrontSection>[
        _child('seasonal'),
        _child('mystery_promo'),
      ]),
    ]);
    await container.read(b2bLayoutSectionsProvider.future);

    final featured = container.read(featuredTradeOffersProvider);
    expect(featured.map((c) => c.id).toList(), <String>['off_seasonal']);
  });

  test('an unrecognised or empty group falls back to the defaults', () async {
    final container = _container(<StorefrontSection>[
      _group(<StorefrontSection>[_child('mystery_promo')]),
    ]);
    await container.read(b2bLayoutSectionsProvider.future);

    final featured = container.read(featuredTradeOffersProvider);
    expect(
      featured.map((c) => c.title).toList(),
      <String>['Seasonal', 'Best Deals', 'Schemes'],
      reason: 'a group the app cannot render must not blank the home',
    );
  });

  test('a hidden group is ignored', () async {
    final container = _container(<StorefrontSection>[
      _group(<StorefrontSection>[_child('schemes')], visible: false),
    ]);
    await container.read(b2bLayoutSectionsProvider.future);

    final featured = container.read(featuredTradeOffersProvider);
    expect(featured.map((c) => c.title).toList(),
        <String>['Seasonal', 'Best Deals', 'Schemes']);
  });

  test('group children parse from the delivered layout', () {
    final layout = <String, dynamic>{
      'sections': <dynamic>[
        {
          'placement': 'trade_offers',
          'label': 'Trade Offers & Deals',
          'visible': true,
          'children': <dynamic>[
            {'placement': 'schemes', 'label': 'Schemes', 'visible': false},
            {'placement': 'seasonal', 'label': 'Seasonal', 'visible': true},
          ],
        },
      ],
    };

    final sections = parseLayoutSections(layout);
    expect(sections, hasLength(1));
    expect(sections.first.children.map((c) => c.placement).toList(),
        <String>['schemes', 'seasonal']);
    expect(sections.first.children.first.visible, isFalse);
  });
}
