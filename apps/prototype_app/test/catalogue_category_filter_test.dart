import 'package:flutter_test/flutter_test.dart';
import 'package:prototype_app/domain/models.dart';
import 'package:prototype_app/providers/catalog_providers.dart';

Product _product(String id, String title, String? categoryL1,
        {String? brand = 'BAUM'}) =>
    Product(
      id: id,
      title: title,
      brand: brand,
      categoryLabel: categoryL1,
    );

void main() {
  final tools =
      _product('p_tools', '1/2in Drive 24 Pcs Socket Set', 'Tools & Hardware');
  final light =
      _product('p_light', '1 Light Diamond Cut Pendant', 'Lighting & Electrical');
  final bathroom =
      _product('p_bath', '3-Hole Basin Mixer', 'Bathroom & Plumbing');
  final demo = _product('p_demo', 'CPVC Pipe 3/4 in', null, brand: 'Astral');
  final imported = <Product>[tools, light, bathroom];

  test('an imported product filters by its exact sourced category', () {
    final result = filterProductsByHomeCategory(imported, 'Tools & Hardware');
    // The socket set's title contains none of the old tool keywords; it must
    // still appear because its category identity says Tools & Hardware.
    expect(result.map((p) => p.id), <String>['p_tools']);
  });

  test('lighting and bathroom use the same exact identity', () {
    expect(
      filterProductsByHomeCategory(imported, 'Lighting & Electrical')
          .map((p) => p.id),
      <String>['p_light'],
    );
    expect(
      filterProductsByHomeCategory(imported, 'Bathroom & Plumbing')
          .map((p) => p.id),
      <String>['p_bath'],
    );
  });

  test('a category with no imported products is empty, not everything', () {
    expect(
      filterProductsByHomeCategory(imported, 'Pumps & Machines'),
      isEmpty,
    );
  });

  test('products without category identity keep keyword matching', () {
    final result =
        filterProductsByHomeCategory(<Product>[demo], 'Bathroom & Plumbing');
    expect(result.map((p) => p.id), <String>['p_demo']);
  });
}
