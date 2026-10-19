import 'models.dart';

/// Stable descending display-fitness order for the staged catalogue (CHG-060).
///
/// Equal scores preserve the source order, so the list stays deterministic and
/// an explicit shopper sort can still take over afterwards.
List<Product> orderProductsByDisplayImage(List<Product> products) {
  final indexed = <({int index, Product product})>[
    for (var i = 0; i < products.length; i++) (index: i, product: products[i]),
  ];
  indexed.sort((left, right) {
    final compared = right.product.displayImageScore
        .compareTo(left.product.displayImageScore);
    return compared == 0 ? left.index - right.index : compared;
  });
  return <Product>[for (final entry in indexed) entry.product];
}
