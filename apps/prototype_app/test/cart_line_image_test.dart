import 'package:flutter_test/flutter_test.dart';
import 'package:prototype_app/domain/models.dart';

void main() {
  const product = Product(
    id: 'prod_socket',
    title: 'Socket Set',
    thumbnail: 'https://img.example/socket.jpg',
    variants: <ProductVariant>[
      ProductVariant(id: 'variant_socket', label: 'Hex'),
    ],
  );
  const catalogue = <Product>[product];

  test('canonical cart thumbnail wins', () {
    const line = CartLineItem(
      id: 'line_1',
      title: 'Socket Set',
      quantity: 1,
      productId: 'prod_socket',
      thumbnail: 'https://cart.example/socket.jpg',
    );
    expect(
        cartLineImageUrl(line, catalogue), 'https://cart.example/socket.jpg');
  });

  test('product id resolves the catalogue thumbnail', () {
    const line = CartLineItem(
      id: 'line_1',
      title: 'Different line title',
      quantity: 1,
      productId: 'prod_socket',
    );
    expect(cartLineImageUrl(line, catalogue), product.thumbnail);
  });

  test('variant id resolves the catalogue thumbnail', () {
    const line = CartLineItem(
      id: 'line_1',
      title: 'Hex',
      quantity: 1,
      variantId: 'variant_socket',
    );
    expect(cartLineImageUrl(line, catalogue), product.thumbnail);
  });

  test('legacy title fallback resolves the catalogue thumbnail', () {
    const line = CartLineItem(
      id: 'line_1',
      title: 'Socket Set',
      quantity: 1,
    );
    expect(cartLineImageUrl(line, catalogue), product.thumbnail);
  });
}
