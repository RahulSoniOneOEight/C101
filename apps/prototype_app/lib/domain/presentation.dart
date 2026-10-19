/// Backend-delivered storefront presentation — hero/campaign banners and root
/// category labels, icons and imagery.
///
/// Commerce owns category identity and hierarchy; the Experience API composes a
/// Medusa category with published CMS presentation. These models only carry the
/// editorial presentation, never price, stock or seller data.
library;

import 'package:flutter/material.dart';

/// A banner returned by `GET /v1/content/presentation`.
class StorefrontBanner {
  const StorefrontBanner({
    required this.contentKey,
    required this.placement,
    required this.title,
    required this.themeKey,
    this.body,
    this.imageUrl,
    this.imageAlt,
    this.actionLabel,
    this.actionUri,
    this.priority = 0,
  });

  final String contentKey;
  final String placement;
  final String title;
  final String themeKey;
  final String? body;
  final String? imageUrl;

  /// CMS alternative text for the creative. Delivered as `image_alt`; required on published banners.
  final String? imageAlt;
  final String? actionLabel;
  final String? actionUri;
  final int priority;

  factory StorefrontBanner.fromJson(Map<String, dynamic> json) {
    return StorefrontBanner(
      contentKey: json['content_key'] as String? ?? '',
      // The console's banner *type* carries the channel (`b2c.home.hero`). Storefront call sites ask
      // for the surface (`home.hero`), so the channel prefix is dropped here, once. Without this the
      // match never succeeded and every CMS-authored banner was ignored in favour of the local seed.
      placement: surfacePlacement(json['placement'] as String? ?? ''),
      title: json['title'] as String? ?? '',
      themeKey: json['theme_key'] as String? ?? 'primary',
      body: json['body'] as String?,
      imageUrl: json['image_uri'] as String?,
      imageAlt: json['image_alt'] as String?,
      actionLabel: json['action_label'] as String?,
      actionUri: json['action_uri'] as String?,
      priority: (json['priority'] as num?)?.toInt() ?? 0,
    );
  }
}

/// A root category composed by the Experience API.
class StorefrontCategory {
  const StorefrontCategory({
    required this.id,
    required this.name,
    required this.label,
    required this.iconKey,
    this.slug,
    this.shortText,
    this.bannerImageUrl,
    this.bannerImageAlt,
  });

  /// Commerce category id (Medusa).
  final String id;
  final String name;
  final String label;
  final String iconKey;
  final String? slug;
  final String? shortText;
  final String? bannerImageUrl;

  /// CMS alternative text for the category banner, delivered as `banner_image_alt`.
  final String? bannerImageAlt;

  factory StorefrontCategory.fromJson(Map<String, dynamic> json) {
    return StorefrontCategory(
      id: json['category_id'] as String? ?? '',
      name: json['name'] as String? ?? '',
      label: json['label'] as String? ?? json['name'] as String? ?? '',
      iconKey: json['icon_key'] as String? ?? 'category',
      slug: json['slug'] as String?,
      shortText: json['short_text'] as String?,
      bannerImageUrl: json['banner_image_uri'] as String?,
      bannerImageAlt: json['banner_image_alt'] as String?,
    );
  }
}

/// A storefront layout section delivered by `GET /v1/content/app-shell`.
///
/// Sections are the backend's merchandising decision: which placements appear, in what order, with
/// which title, badge, limit and visibility. The storefront renders what this says rather than
/// deciding locally.
class StorefrontSection {
  const StorefrontSection({
    required this.placement,
    required this.label,
    this.title,
    this.subtitle,
    this.badge,
    this.collectionKey,
    this.limit,
    this.seeAllLabel,
    this.seeAllUri,
    this.bannerReference,
    this.visible = true,
    this.children = const <StorefrontSection>[],
  });

  final String placement;
  final String label;
  final String? title;
  final String? subtitle;
  final String? badge;

  /// Commerce collection reference. The section points at it; products are resolved at read time.
  final String? collectionKey;
  final int? limit;
  final String? seeAllLabel;
  final String? seeAllUri;

  /// Banner managed under Merchandising → Banners, referenced by its content key.
  final String? bannerReference;
  final bool visible;

  /// Children of a group section (Trade Offers & Deals), in declared order.
  final List<StorefrontSection> children;

  String get displayTitle =>
      (title != null && title!.trim().isNotEmpty) ? title! : label;

  factory StorefrontSection.fromJson(Map<String, dynamic> json) {
    return StorefrontSection(
      placement: json['placement'] as String? ?? '',
      label: json['label'] as String? ?? '',
      title: json['title'] as String?,
      subtitle: json['subtitle'] as String?,
      badge: json['badge'] as String?,
      collectionKey: json['collection_key'] as String?,
      limit: (json['limit'] as num?)?.toInt(),
      seeAllLabel: json['see_all_label'] as String?,
      seeAllUri: json['see_all_uri'] as String?,
      bannerReference: json['banner_reference'] as String?,
      visible: json['visible'] as bool? ?? true,
      children: _parseChildSections(json['children']),
    );
  }
}

/// Reads the nested sections of a group section. Group children are sections themselves, but they are
/// delivered as a direct array rather than under a `sections` key.
List<StorefrontSection> _parseChildSections(dynamic children) {
  if (children is! List) return const <StorefrontSection>[];
  return children
      .whereType<Map<String, dynamic>>()
      .map(StorefrontSection.fromJson)
      .where((section) => section.placement.isNotEmpty)
      .toList();
}

/// Reads the sections out of an app-shell `layout` payload. Returns empty when absent, so a storefront
/// with no configured layout keeps whatever defaults it already had.
List<StorefrontSection> parseLayoutSections(dynamic layout) {
  if (layout is! Map<String, dynamic>) return const <StorefrontSection>[];
  final sections = layout['sections'];
  if (sections is! List) return const <StorefrontSection>[];
  return sections
      .whereType<Map<String, dynamic>>()
      .map(StorefrontSection.fromJson)
      .where((section) => section.placement.isNotEmpty)
      .toList();
}

/// A banner's surface, without the channel that its type carries.
///
/// Delivery publishes the banner *type* (`b2c.home.hero`, `b2b.category.banner`) because the type is
/// the channel's own fact. The storefront asks for a surface (`home.hero`), so the channel segment is
/// dropped on the way in. Legacy values without a channel prefix pass through unchanged.
String surfacePlacement(String placement) {
  final trimmed = placement.trim();
  for (final prefix in const <String>['b2c.', 'b2b.']) {
    if (trimmed.startsWith(prefix)) return trimmed.substring(prefix.length);
  }
  return trimmed;
}

/// The full presentation payload.
class StorefrontPresentation {
  const StorefrontPresentation({
    required this.banners,
    required this.categories,
  });

  final List<StorefrontBanner> banners;
  final List<StorefrontCategory> categories;

  /// Returns a copy with the approved category priority applied (CHG-060).
  ///
  /// The Experience API owns this order. Applying it here as well means a
  /// browser holding an app build ahead of an API release still shows the
  /// governed order, and an already-prioritised list is returned unchanged.
  StorefrontPresentation withStorefrontCategoryPriority() {
    return StorefrontPresentation(
      banners: banners,
      categories: prioritizeStorefrontCategories(categories),
    );
  }

  factory StorefrontPresentation.fromJson(Map<String, dynamic> json) {
    return StorefrontPresentation(
      banners: (json['banners'] as List? ?? const <dynamic>[])
          .whereType<Map<String, dynamic>>()
          .map(StorefrontBanner.fromJson)
          .toList(),
      categories: (json['categories'] as List? ?? const <dynamic>[])
          .whereType<Map<String, dynamic>>()
          .map(StorefrontCategory.fromJson)
          .toList(),
    );
  }

  List<StorefrontBanner> bannersFor(String placement) =>
      banners.where((b) => b.placement == placement).toList();

  StorefrontCategory? categoryByLabel(String? label) {
    if (label == null) return null;
    for (final category in categories) {
      if (category.label == label || category.name == label) return category;
    }
    return null;
  }

  /// Resolves by commerce category id, which is what the trade rail filters on and what the CMS
  /// keys a category banner by.
  StorefrontCategory? categoryById(String? id) {
    if (id == null) return null;
    for (final category in categories) {
      if (category.id == id) return category;
    }
    return null;
  }
}

/// CHG-060 operator-approved category priority, mirrored from the Experience
/// API so a client build ahead of an API release keeps the same order.
const List<String> storefrontCategoryPriority = <String>[
  'lighting & electrical',
  'bathroom & plumbing',
  'paints & finishes',
];

String _normalizedCategoryName(String value) => value
    .trim()
    .toLowerCase()
    .replaceAll(RegExp(r'\band\b'), '&')
    .replaceAll(RegExp(r'\s+'), ' ');

/// Moves only the approved priority categories; preserves every other order.
List<StorefrontCategory> prioritizeStorefrontCategories(
  List<StorefrontCategory> categories,
) {
  final indexed = <({int index, StorefrontCategory category})>[
    for (var i = 0; i < categories.length; i++)
      (index: i, category: categories[i]),
  ];
  int priority(StorefrontCategory category) {
    final names = <String>[
      _normalizedCategoryName(category.name),
      _normalizedCategoryName(category.label),
    ];
    final found = storefrontCategoryPriority
        .indexWhere((candidate) => names.contains(candidate));
    return found < 0 ? storefrontCategoryPriority.length : found;
  }

  indexed.sort((left, right) {
    final compared = priority(left.category) - priority(right.category);
    return compared == 0 ? left.index - right.index : compared;
  });
  return <StorefrontCategory>[for (final entry in indexed) entry.category];
}

/// Resolve an allowlisted icon key to a design-system icon. Unknown keys fall
/// back to a neutral category icon so the rail never renders a broken glyph.
IconData categoryIconFor(String iconKey) {
  switch (iconKey) {
    case 'bathroom-plumbing':
      return Icons.bathtub_outlined;
    case 'tiles-plywood':
      return Icons.grid_view_outlined;
    case 'electrical':
      return Icons.electrical_services_outlined;
    case 'agriculture':
      return Icons.grass_outlined;
    case 'pumps-machines':
      return Icons.precision_manufacturing_outlined;
    case 'construction':
      return Icons.construction_outlined;
    case 'paints-finishes':
      return Icons.format_paint_outlined;
    default:
      return Icons.category_outlined;
  }
}

/// Governed fallback mirroring the backend seed so the app is usable offline and
/// before CMS content exists. The backend remains the routine source.
const List<StorefrontBanner> fallbackBanners = <StorefrontBanner>[
  // Seed copy must not assert a saving, a catalogue size or a delivery threshold: before an operator
  // authors a banner, anything quantified here would be shown to shoppers as an evidenced claim.
  // Titles and creative stay; the body states nothing. Operators replace the whole banner anyway.
  StorefrontBanner(
    contentKey: 'hero-monsoon-ready',
    placement: 'home.hero',
    title: 'Monsoon Ready',
    actionLabel: 'Shop now',
    actionUri: '/browse?tag=Flash%20Deals',
    themeKey: 'primary',
    priority: 30,
  ),
  StorefrontBanner(
    contentKey: 'hero-bulk-savings',
    placement: 'home.hero',
    title: 'Bulk Savings',
    actionLabel: 'Shop now',
    actionUri: '/browse?tag=Best%20Sellers',
    themeKey: 'trust',
    priority: 20,
  ),
  StorefrontBanner(
    contentKey: 'hero-free-delivery',
    placement: 'home.hero',
    title: 'Free Delivery',
    actionLabel: 'Shop now',
    actionUri: '/browse?tag=Clearance%20Sale',
    themeKey: 'promotion',
    priority: 10,
  ),
];

const List<StorefrontCategory> fallbackCategories = <StorefrontCategory>[
  StorefrontCategory(
    id: 'fallback-electrical',
    name: 'Lighting & Electrical',
    label: 'Lighting & Electrical',
    iconKey: 'electrical',
    bannerImageUrl:
        'https://images.pexels.com/photos/257736/pexels-photo-257736.jpeg?auto=compress&cs=tinysrgb&w=940',
  ),
  StorefrontCategory(
    id: 'fallback-bathroom',
    name: 'Bathroom & Plumbing',
    label: 'Bathroom & Plumbing',
    iconKey: 'bathroom-plumbing',
    bannerImageUrl:
        'https://images.pexels.com/photos/2062426/pexels-photo-2062426.jpeg?auto=compress&cs=tinysrgb&w=940',
  ),
  StorefrontCategory(
    id: 'fallback-paints',
    name: 'Paints & Finishes',
    label: 'Paints & Finishes',
    iconKey: 'paints-finishes',
  ),
  StorefrontCategory(
    id: 'fallback-tiles',
    name: 'Tiles & Plywood',
    label: 'Tiles & Plywood',
    iconKey: 'tiles-plywood',
    bannerImageUrl:
        'https://images.pexels.com/photos/276724/pexels-photo-276724.jpeg?auto=compress&cs=tinysrgb&w=940',
  ),
  StorefrontCategory(
    id: 'fallback-agriculture',
    name: 'Agriculture & Seeds',
    label: 'Agriculture & Seeds',
    iconKey: 'agriculture',
    bannerImageUrl:
        'https://images.pexels.com/photos/265216/pexels-photo-265216.jpeg?auto=compress&cs=tinysrgb&w=940',
  ),
  StorefrontCategory(
    id: 'fallback-pumps',
    name: 'Pumps & Machines',
    label: 'Pumps & Machines',
    iconKey: 'pumps-machines',
    bannerImageUrl:
        'https://images.pexels.com/photos/175709/pexels-photo-175709.jpeg?auto=compress&cs=tinysrgb&w=940',
  ),
  StorefrontCategory(
    id: 'fallback-construction',
    name: 'Construction',
    label: 'Construction',
    iconKey: 'construction',
    bannerImageUrl:
        'https://images.pexels.com/photos/1216589/pexels-photo-1216589.jpeg?auto=compress&cs=tinysrgb&w=940',
  ),
];

const String fallbackCategoryBannerImage =
    'https://images.pexels.com/photos/10284048/pexels-photo-10284048.jpeg?auto=compress&cs=tinysrgb&w=940';
