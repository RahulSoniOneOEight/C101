import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../domain/models.dart';
import '../domain/presentation.dart';
import '../domain/storefront_ux.dart';
import '../providers/catalog_providers.dart';
import '../widgets/status_views.dart';

enum DiscoveryTab { categories, brands }

/// Catalogue-derived B2C exploration: categories, use cases and brands.
class DiscoveryHubScreen extends ConsumerStatefulWidget {
  const DiscoveryHubScreen(
      {this.initialTab = DiscoveryTab.categories, super.key});

  final DiscoveryTab initialTab;

  @override
  ConsumerState<DiscoveryHubScreen> createState() => _DiscoveryHubScreenState();
}

class _DiscoveryHubScreenState extends ConsumerState<DiscoveryHubScreen> {
  late DiscoveryTab _tab = widget.initialTab;
  final TextEditingController _brandSearch = TextEditingController();
  String _brandQuery = '';

  @override
  void dispose() {
    _brandSearch.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final productsState = ref.watch(productsProvider);
    final colors =
        Theme.of(context).extension<AgencyColors>() ?? AgencyColors.light;
    return Scaffold(
      appBar: AppBar(title: const Text('Discover')),
      body: productsState.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => ErrorView(
          error: error,
          onRetry: () => ref.invalidate(productsProvider),
        ),
        data: (products) => ListView(
          padding: const EdgeInsets.all(AgencySpacing.md),
          children: <Widget>[
            Container(
              padding: const EdgeInsets.all(AgencySpacing.md),
              decoration: BoxDecoration(
                color: colors.surfaceInteractive,
                borderRadius: BorderRadius.circular(AgencyRadius.lg),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Text('What are you working on?',
                      style: TextStyle(
                          fontSize: 17,
                          fontWeight: FontWeight.w700,
                          color: colors.contentPrimary)),
                  const SizedBox(height: AgencySpacing.xs),
                  Text('Start with a task, category or brand.',
                      style: TextStyle(
                          fontSize: 12, color: colors.contentSecondary)),
                  const SizedBox(height: AgencySpacing.sm),
                  Wrap(
                    spacing: AgencySpacing.xs,
                    runSpacing: AgencySpacing.xs,
                    children: <Widget>[
                      for (final prompt in demoSearchPrompts)
                        ActionChip(
                          avatar: const Icon(Icons.auto_awesome, size: 15),
                          label: Text(prompt,
                              style: const TextStyle(fontSize: 11)),
                          onPressed: () => context.push(
                            '/search?mode=ai&q=${Uri.encodeComponent(prompt)}',
                          ),
                        ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: AgencySpacing.md),
            SizedBox(
              width: double.infinity,
              child: SegmentedButton<DiscoveryTab>(
                segments: const <ButtonSegment<DiscoveryTab>>[
                  ButtonSegment<DiscoveryTab>(
                    value: DiscoveryTab.categories,
                    icon: Icon(Icons.grid_view_outlined, size: 17),
                    label: Text('Categories'),
                  ),
                  ButtonSegment<DiscoveryTab>(
                    value: DiscoveryTab.brands,
                    icon: Icon(Icons.sell_outlined, size: 17),
                    label: Text('Brands'),
                  ),
                ],
                selected: <DiscoveryTab>{_tab},
                onSelectionChanged: (selection) =>
                    setState(() => _tab = selection.first),
              ),
            ),
            const SizedBox(height: AgencySpacing.md),
            if (_tab == DiscoveryTab.categories)
              _categories(products)
            else
              _brands(products),
          ],
        ),
      ),
    );
  }

  Widget _categories(List<Product> products) {
    final categories = ref.watch(presentationProvider).categories;
    if (categories.isEmpty) {
      return const EmptyView(message: 'No categories available');
    }
    return GridView.builder(
      shrinkWrap: true,
      primary: false,
      physics: const NeverScrollableScrollPhysics(),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        mainAxisSpacing: AgencySpacing.sm,
        crossAxisSpacing: AgencySpacing.sm,
        mainAxisExtent: 160,
      ),
      itemCount: categories.length,
      itemBuilder: (context, index) =>
          _categoryCard(categories[index], products),
    );
  }

  Widget _categoryCard(StorefrontCategory category, List<Product> products) {
    final colors =
        Theme.of(context).extension<AgencyColors>() ?? AgencyColors.light;
    final image = ref.watch(categoryBannerImageProvider(category.label));
    final count = filterProductsByHomeCategory(products, category.label).length;
    return Semantics(
      button: true,
      label: '${category.label}, $count products',
      child: InkWell(
        borderRadius: BorderRadius.circular(AgencyRadius.lg),
        onTap: () => context.push(
          '/browse?category=${Uri.encodeComponent(category.label)}',
        ),
        child: Container(
          clipBehavior: Clip.antiAlias,
          decoration: BoxDecoration(
            color: colors.surfaceRaised,
            borderRadius: BorderRadius.circular(AgencyRadius.lg),
            border: Border.all(color: colors.borderDefault),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              SizedBox(
                height: 96,
                width: double.infinity,
                child: Image.network(
                  image,
                  fit: BoxFit.cover,
                  semanticLabel: category.bannerImageAlt ?? category.label,
                  errorBuilder: (_, __, ___) => Icon(
                      categoryIconFor(category.iconKey),
                      color: colors.actionPrimary),
                ),
              ),
              Padding(
                padding: const EdgeInsets.all(AgencySpacing.sm),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text(category.label,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                            fontSize: 12,
                            height: 1.2,
                            fontWeight: FontWeight.w700,
                            color: colors.contentPrimary)),
                    Text('$count products',
                        style: TextStyle(
                            fontSize: 10, color: colors.contentSecondary)),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _brands(List<Product> products) {
    final colors =
        Theme.of(context).extension<AgencyColors>() ?? AgencyColors.light;
    final grouped = <String, List<Product>>{};
    for (final product in products) {
      final brand = product.brand?.trim();
      if (brand == null || brand.isEmpty) continue;
      grouped.putIfAbsent(brand, () => <Product>[]).add(product);
    }
    final brands = grouped.keys
        .where(
            (brand) => brand.toLowerCase().contains(_brandQuery.toLowerCase()))
        .toList()
      ..sort((a, b) {
        final byCount = grouped[b]!.length.compareTo(grouped[a]!.length);
        return byCount == 0 ? a.compareTo(b) : byCount;
      });
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        TextField(
          controller: _brandSearch,
          onChanged: (value) => setState(() => _brandQuery = value.trim()),
          decoration: InputDecoration(
            hintText: 'Find a brand',
            prefixIcon: const Icon(Icons.search, size: 18),
            filled: true,
            fillColor: colors.surfacePage,
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(AgencyRadius.md),
              borderSide: BorderSide(color: colors.borderDefault),
            ),
          ),
        ),
        const SizedBox(height: AgencySpacing.md),
        if (brands.isEmpty)
          const EmptyView(message: 'No matching brands')
        else
          GridView.builder(
            shrinkWrap: true,
            primary: false,
            physics: const NeverScrollableScrollPhysics(),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              mainAxisSpacing: AgencySpacing.sm,
              crossAxisSpacing: AgencySpacing.sm,
              mainAxisExtent: 112,
            ),
            itemCount: brands.length,
            itemBuilder: (context, index) {
              final brand = brands[index];
              final items = grouped[brand]!;
              final image = items.first.thumbnail;
              return InkWell(
                borderRadius: BorderRadius.circular(AgencyRadius.lg),
                onTap: () => context.push(
                  '/browse?brand=${Uri.encodeComponent(brand)}',
                ),
                child: Container(
                  padding: const EdgeInsets.all(AgencySpacing.sm),
                  decoration: BoxDecoration(
                    color: colors.surfaceRaised,
                    borderRadius: BorderRadius.circular(AgencyRadius.lg),
                    border: Border.all(color: colors.borderDefault),
                  ),
                  child: Row(
                    children: <Widget>[
                      ClipRRect(
                        borderRadius: BorderRadius.circular(AgencyRadius.sm),
                        child: SizedBox(
                          width: 48,
                          height: 72,
                          child: image == null
                              ? Icon(Icons.inventory_2_outlined,
                                  color: colors.contentSecondary)
                              : Image.network(image,
                                  fit: BoxFit.cover,
                                  errorBuilder: (_, __, ___) => Icon(
                                      Icons.inventory_2_outlined,
                                      color: colors.contentSecondary)),
                        ),
                      ),
                      const SizedBox(width: AgencySpacing.sm),
                      Expanded(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: <Widget>[
                            Text(brand,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w700,
                                    color: colors.contentPrimary)),
                            Text('${items.length} products',
                                style: TextStyle(
                                    fontSize: 10,
                                    color: colors.contentSecondary)),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
      ],
    );
  }
}
