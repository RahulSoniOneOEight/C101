import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../domain/models.dart';
import '../domain/storefront_collection.dart';
import '../providers/collection_providers.dart';

/// The page behind a collection's customer-facing URL.
///
/// Every collection gets one: `collectionKey` is either a commerce collection handle (the operator's
/// collection) or a curated registry key. A key that resolves to nothing is shown as not found, never as
/// an empty page or a list of unrelated products.
class CollectionScreen extends ConsumerWidget {
  const CollectionScreen({required this.collectionKey, super.key});

  final String collectionKey;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(storefrontCollectionProvider(collectionKey));
    final resolved = state.value;

    return Scaffold(
      appBar: AppBar(
        title: Text(resolved?.title ?? _humanise(collectionKey)),
      ),
      body: RefreshIndicator(
        onRefresh: () async =>
            ref.invalidate(storefrontCollectionProvider(collectionKey)),
        child: state.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, _) => _Message(
            icon: Icons.link_off,
            title: error is CollectionNotFoundException && error.isEmpty
                ? 'Nothing here yet'
                : 'Collection not found',
            body: error is CollectionNotFoundException && error.isEmpty
                ? 'This collection exists but has no products available right now. Check back, or browse the catalogue.'
                : 'This link does not point to a collection. It may have been renamed or removed.',
            onBrowse: () => context.go('/'),
          ),
          data: (collection) => collection.products.isEmpty
              ? _Message(
                  icon: Icons.inventory_2_outlined,
                  title: 'No products yet',
                  body:
                      'This collection has no deliverable products right now.',
                  onBrowse: () => context.go('/'),
                )
              : _Grid(products: collection.products),
        ),
      ),
    );
  }
}

class _Grid extends StatelessWidget {
  const _Grid({required this.products});

  final List<Product> products;

  @override
  Widget build(BuildContext context) {
    return GridView.builder(
      padding: const EdgeInsets.all(16),
      physics: const AlwaysScrollableScrollPhysics(),
      gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
        maxCrossAxisExtent: 240,
        mainAxisSpacing: 12,
        crossAxisSpacing: 12,
        childAspectRatio: 0.62,
      ),
      itemCount: products.length,
      itemBuilder: (context, index) {
        final product = products[index];
        return ProductCard(
          title: product.title,
          priceLabel: product.price?.formatted ?? 'Price on request',
          previousPriceLabel: product.mrp?.formatted,
          discountLabel: product.discountPercent == null
              ? null
              : '${product.discountPercent}% off',
          imageUrl: product.thumbnail,
          brand: product.brand,
          badges: product.badges.isEmpty ? const <String>[] : product.badges,
          variant: ProductCardVariant.large,
          onPressed: () => context.push('/product/${product.id}'),
        );
      },
    );
  }
}

class _Message extends StatelessWidget {
  const _Message({
    required this.icon,
    required this.title,
    required this.body,
    required this.onBrowse,
  });

  final IconData icon;
  final String title;
  final String body;
  final VoidCallback onBrowse;

  @override
  Widget build(BuildContext context) {
    // Wrapped in a scroll view so pull-to-refresh still works on an empty or failed page.
    return ListView(
      padding: const EdgeInsets.fromLTRB(24, 80, 24, 24),
      physics: const AlwaysScrollableScrollPhysics(),
      children: <Widget>[
        Icon(icon, size: 48),
        const SizedBox(height: 16),
        Text(title,
            style: Theme.of(context).textTheme.titleLarge,
            textAlign: TextAlign.center),
        const SizedBox(height: 8),
        Text(body, textAlign: TextAlign.center),
        const SizedBox(height: 24),
        Center(
          child: FilledButton(
              onPressed: onBrowse, child: const Text('Browse the catalogue')),
        ),
      ],
    );
  }
}

/// "monsoon-site-essentials" reads as "Monsoon Site Essentials" until a title exists.
String _humanise(String key) => key
    .split(RegExp(r'[-_]'))
    .where((part) => part.isNotEmpty)
    .map((part) => '${part[0].toUpperCase()}${part.substring(1)}')
    .join(' ');
