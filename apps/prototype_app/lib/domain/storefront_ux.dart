import 'models.dart';

/// Search modes available to B2C customers.
enum StorefrontSearchMode { catalogue, aiDemo }

extension StorefrontSearchModeX on StorefrontSearchMode {
  String get label => switch (this) {
        StorefrontSearchMode.catalogue => 'Catalogue',
        StorefrontSearchMode.aiDemo => 'AI demo',
      };
}

/// A transparent interpretation produced by the deterministic staging helper.
class DemoSearchInterpretation {
  const DemoSearchInterpretation({
    required this.label,
    required this.terms,
    this.categoryHints = const <String>[],
  });

  final String label;
  final List<String> terms;
  final List<String> categoryHints;
}

class _IntentRule {
  const _IntentRule({
    required this.triggers,
    required this.interpretation,
  });

  final List<String> triggers;
  final DemoSearchInterpretation interpretation;
}

const List<String> demoSearchPrompts = <String>[
  'Paint a damp bathroom',
  'Fix a leaking pipe',
  'Brighten my balcony',
  'Drill into concrete',
];

const List<_IntentRule> _intentRules = <_IntentRule>[
  _IntentRule(
    triggers: <String>['damp', 'waterproof', 'bathroom paint', 'wet wall'],
    interpretation: DemoSearchInterpretation(
      label: 'Bathroom waterproofing and finishes',
      terms: <String>[
        'waterproof',
        'paint',
        'primer',
        'putty',
        'sealant',
        'bathroom',
      ],
      categoryHints: <String>['Paints & Finishes', 'Bathroom & Plumbing'],
    ),
  ),
  _IntentRule(
    triggers: <String>['leak', 'leaking', 'pipe repair', 'plumbing repair'],
    interpretation: DemoSearchInterpretation(
      label: 'Pipe repair essentials',
      terms: <String>['pipe', 'fitting', 'valve', 'sealant', 'cpvc', 'tap'],
      categoryHints: <String>['Bathroom & Plumbing'],
    ),
  ),
  _IntentRule(
    triggers: <String>['balcony', 'outdoor light', 'brighten'],
    interpretation: DemoSearchInterpretation(
      label: 'Outdoor lighting',
      terms: <String>['outdoor', 'led', 'light', 'lamp', 'bulb'],
      categoryHints: <String>['Lighting & Electrical'],
    ),
  ),
  _IntentRule(
    triggers: <String>['concrete', 'drill wall', 'masonry'],
    interpretation: DemoSearchInterpretation(
      label: 'Concrete drilling tools',
      terms: <String>['drill', 'hammer', 'rotary', 'bit', 'masonry'],
      categoryHints: <String>['Tools & Hardware'],
    ),
  ),
  _IntentRule(
    triggers: <String>['paint room', 'paint a room', 'repaint'],
    interpretation: DemoSearchInterpretation(
      label: 'Room painting essentials',
      terms: <String>['paint', 'primer', 'putty', 'roller', 'brush'],
      categoryHints: <String>['Paints & Finishes'],
    ),
  ),
];

/// Expands a natural-language prompt using local, reviewed rules only.
DemoSearchInterpretation interpretDemoSearch(String query) {
  final normalised = query.trim().toLowerCase();
  for (final rule in _intentRules) {
    if (rule.triggers.any(normalised.contains)) return rule.interpretation;
  }
  final terms = normalised
      .split(RegExp(r'[^a-z0-9]+'))
      .where((term) => term.length > 2)
      .toSet()
      .toList();
  return DemoSearchInterpretation(
    label:
        terms.isEmpty ? 'Describe what you need' : 'Matching catalogue terms',
    terms: terms,
  );
}

/// Ranks live catalogue products against a transparent demo interpretation.
List<Product> demoAiSearch(List<Product> products, String query) {
  if (query.trim().isEmpty) return const <Product>[];
  final interpretation = interpretDemoSearch(query);
  final exact = query.trim().toLowerCase();
  final scored = <(Product, int, int)>[];
  for (var index = 0; index < products.length; index++) {
    final product = products[index];
    final haystack = <String>[
      product.title,
      product.brand ?? '',
      product.categoryLabel ?? '',
      product.description ?? '',
      for (final variant in product.variants) variant.label,
      for (final variant in product.variants) variant.sku ?? '',
    ].join(' ').toLowerCase();
    var score = product.matchesQuery(exact) ? 20 : 0;
    for (final term in interpretation.terms) {
      if (haystack.contains(term)) score += 3;
    }
    final category = (product.categoryLabel ?? '').toLowerCase();
    if (interpretation.categoryHints
        .any((hint) => category == hint.toLowerCase())) {
      score += 5;
    }
    if (score > 0) scored.add((product, score, index));
  }
  scored.sort((a, b) {
    final byScore = b.$2.compareTo(a.$2);
    return byScore == 0 ? a.$3.compareTo(b.$3) : byScore;
  });
  return scored.map((entry) => entry.$1).toList();
}

enum FulfilmentMode { delivery, pickup }

extension FulfilmentModeX on FulfilmentMode {
  String get label => switch (this) {
        FulfilmentMode.delivery => 'Delivery',
        FulfilmentMode.pickup => 'Pickup',
      };
}

class FulfilmentPreference {
  const FulfilmentPreference({
    this.mode = FulfilmentMode.delivery,
    this.addressId,
    this.pickupPointId,
  });

  final FulfilmentMode mode;
  final String? addressId;
  final String? pickupPointId;

  Map<String, dynamic> toJson() => <String, dynamic>{
        'mode': mode.name,
        'address_id': addressId,
        'pickup_point_id': pickupPointId,
      };

  factory FulfilmentPreference.fromJson(Map<String, dynamic> json) =>
      FulfilmentPreference(
        mode: FulfilmentMode.values.firstWhere(
          (mode) => mode.name == json['mode'],
          orElse: () => FulfilmentMode.delivery,
        ),
        addressId: json['address_id'] as String?,
        pickupPointId: json['pickup_point_id'] as String?,
      );
}

class PickupPoint {
  const PickupPoint({
    required this.id,
    required this.name,
    required this.location,
    required this.hours,
  });

  final String id;
  final String name;
  final String location;
  final String hours;
}

/// Fixture only: it is intentionally not presented as a real public location.
const PickupPoint stagingPickupPoint = PickupPoint(
  id: 'pickup_staging_bhiwadi',
  name: 'BuildKart staging collection desk',
  location: 'Bhiwadi, Rajasthan 301019',
  hours: 'Mon–Sat · 9:00–18:00',
);
