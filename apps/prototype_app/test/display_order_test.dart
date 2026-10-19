import 'package:flutter_test/flutter_test.dart';
import 'package:prototype_app/domain/image_quality_order.dart';
import 'package:prototype_app/domain/models.dart';
import 'package:prototype_app/domain/presentation.dart';

const _high = 'prod_01M59JS4A6QTH32AXVW9P2D3A3'; // 97
const _low = 'prod_01M59JHKBZ41EJTYW3X6MCXZC6'; // 43

StorefrontCategory _category(String name) =>
    StorefrontCategory(id: name, name: name, label: name, iconKey: 'category');

void main() {
  group('display image order', () {
    test('fixture scores put the display-ready product first', () {
      final ordered = orderProductsByDisplayImage(const <Product>[
        Product(id: _low, title: 'Socket Set'),
        Product(id: _high, title: 'HDHMR Board'),
      ]);
      expect(ordered.map((p) => p.id), <String>[_high, _low]);
    });

    test('the API score wins over the fixture', () {
      final ordered = orderProductsByDisplayImage(const <Product>[
        Product(id: _high, title: 'HDHMR Board', imageQualityScore: 5),
        Product(id: _low, title: 'Socket Set'),
      ]);
      expect(ordered.map((p) => p.id), <String>[_low, _high]);
    });

    test('unknown products keep their relative order after scored ones', () {
      final ordered = orderProductsByDisplayImage(const <Product>[
        Product(id: 'unknown-a', title: 'A'),
        Product(id: _low, title: 'Socket Set'),
        Product(id: 'unknown-b', title: 'B'),
      ]);
      expect(
        ordered.map((p) => p.id),
        <String>[_low, 'unknown-a', 'unknown-b'],
      );
    });
  });

  group('storefront category priority', () {
    test('moves only the three approved categories and preserves the rest', () {
      final ordered = prioritizeStorefrontCategories(<StorefrontCategory>[
        _category('Agriculture & Seeds'),
        _category('Paints & Finishes'),
        _category('Bathroom & Plumbing'),
        _category('Lighting & Electrical'),
        _category('Tools & Hardware'),
      ]);
      expect(
        ordered.map((c) => c.name),
        <String>[
          'Lighting & Electrical',
          'Bathroom & Plumbing',
          'Paints & Finishes',
          'Agriculture & Seeds',
          'Tools & Hardware',
        ],
      );
    });

    test('is idempotent on an already prioritised list', () {
      final once = prioritizeStorefrontCategories(<StorefrontCategory>[
        _category('Agriculture & Seeds'),
        _category('Lighting & Electrical'),
        _category('Bathroom & Plumbing'),
      ]);
      final twice = prioritizeStorefrontCategories(once);
      expect(twice.map((c) => c.name), once.map((c) => c.name));
    });

    test('tolerates "and" and mixed case in the commerce name', () {
      final ordered = prioritizeStorefrontCategories(<StorefrontCategory>[
        _category('Agriculture & Seeds'),
        const StorefrontCategory(
          id: 'pcat_light',
          name: 'LIGHTING AND ELECTRICAL',
          label: 'Lighting & Electrical',
          iconKey: 'electrical',
        ),
      ]);
      expect(ordered.first.id, 'pcat_light');
    });
  });
}
