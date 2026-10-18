import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:prototype_app/data/experience_api.dart';
import 'package:prototype_app/domain/presentation.dart';
import 'package:prototype_app/providers/b2b_trade_providers.dart';
import 'package:prototype_app/providers/catalog_providers.dart';

/// Records the channel the app asks for and returns a canned presentation.
///
/// The defect this guards against was not a wrong image URL: the B2B surfaces never asked the
/// Experience API for the b2b channel at all, so CMS content could not reach them however it was
/// authored. Asserting the requested channel is what makes that regression detectable.
class _FakeExperienceApi extends ExperienceApi {
  _FakeExperienceApi({this.response})
      : super(Dio());

  final StorefrontPresentation? response;
  final List<String> requestedChannels = <String>[];

  @override
  Future<StorefrontPresentation> getPresentation({
    String locale = 'en-IN',
    String channel = 'b2c',
  }) async {
    requestedChannels.add(channel);
    return response ??
        const StorefrontPresentation(
          banners: <StorefrontBanner>[],
          categories: <StorefrontCategory>[],
        );
  }
}

StorefrontPresentation _b2bPresentation() => StorefrontPresentation.fromJson(<String, dynamic>{
      'banners': <dynamic>[],
      'categories': <dynamic>[
        {
          'category_id': 'pcat_plumbing',
          'name': 'Bathroom & Plumbing',
          'label': 'Plumbing',
          'icon_key': 'bathroom-plumbing',
          'banner_image_uri': 'https://images.example.com/b2b-plumbing.jpg',
        },
      ],
    });

void main() {
  test('the B2B presentation is requested for the b2b channel', () async {
    final api = _FakeExperienceApi(response: _b2bPresentation());
    final container = ProviderContainer(
      overrides: [experienceApiProvider.overrideWithValue(api)],
    );
    addTearDown(container.dispose);

    await container.read(b2bPresentationProvider.future);

    expect(api.requestedChannels, <String>['b2b']);
  });

  test('a B2B category banner comes from the CMS presentation', () async {
    final api = _FakeExperienceApi(response: _b2bPresentation());
    final container = ProviderContainer(
      overrides: [experienceApiProvider.overrideWithValue(api)],
    );
    addTearDown(container.dispose);

    await container.read(b2bPresentationProvider.future);

    expect(
      container.read(b2bCategoryBannerImageProvider('Plumbing')),
      'https://images.example.com/b2b-plumbing.jpg',
    );
  });

  test('a category with no authored B2B banner yields null, not an invented image', () async {
    final api = _FakeExperienceApi(
      response: const StorefrontPresentation(
        banners: <StorefrontBanner>[],
        categories: <StorefrontCategory>[],
      ),
    );
    final container = ProviderContainer(
      overrides: [experienceApiProvider.overrideWithValue(api)],
    );
    addTearDown(container.dispose);

    await container.read(b2bPresentationProvider.future);

    expect(container.read(b2bCategoryBannerImageProvider('Plumbing')), isNull);
  });

  test('the trade rail takes its labels, ids and order from the CMS', () async {
    final api = _FakeExperienceApi(response: _b2bPresentation());
    final container = ProviderContainer(
      overrides: [experienceApiProvider.overrideWithValue(api)],
    );
    addTearDown(container.dispose);

    await container.read(b2bPresentationProvider.future);
    final categories = container.read(tradeCategoryOptionsProvider);

    expect(categories, hasLength(1));
    expect(categories.single.id, 'pcat_plumbing',
        reason: 'the rail must filter by commerce category id, not a fixture id');
    expect(categories.single.label, 'Plumbing',
        reason: 'the label comes from Category presentation');
  });

  test('without presentation the trade rail falls back to the local fixture', () async {
    final api = _FakeExperienceApi(
      response: const StorefrontPresentation(
        banners: <StorefrontBanner>[],
        categories: <StorefrontCategory>[],
      ),
    );
    final container = ProviderContainer(
      overrides: [experienceApiProvider.overrideWithValue(api)],
    );
    addTearDown(container.dispose);

    await container.read(b2bPresentationProvider.future);
    final categories = container.read(tradeCategoryOptionsProvider);

    expect(categories, isNotEmpty);
    expect(categories.first.id, TradeCategoryIds.bathroom,
        reason: 'fixtures already speak commerce ids so filtering still works');
  });

  test('the trade catalogue is tagged with the same ids the rail filters on',
      () async {
    final container = ProviderContainer();
    addTearDown(container.dispose);

    final catalogue = container.read(tradeCatalogueProvider);
    final known = container
        .read(tradeDashboardProvider)
        .categories
        .map((category) => category.id)
        .toSet();

    expect(catalogue, isNotEmpty);
    expect(
      catalogue.every((product) => known.contains(product.categoryId)),
      isTrue,
    );
  });
}
