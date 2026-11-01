/// Demo PDP gallery (U-017 phase 1).
///
/// The catalogue API exposes a single `thumbnail` per product. For the three
/// allowlisted demo products we add Pexels stock photos so the PDP can show a
/// real slider before the image API lands (phase 2 adds `images[]` and real
/// photos).
///
/// Rules:
/// - the first slide is always the product's own thumbnail;
/// - every added slide is labelled “Representative image” and never presented
///   as the exact product;
/// - these URLs are staging demo content only — do not ship them to production.
library;

class PdpImage {
  const PdpImage({required this.url, this.representative = false});

  final String url;

  /// True when the photo is a category reference, not the exact product.
  final bool representative;
}

/// Pexels complements keyed by product id. Verified 200 on 2026-11-01.
const Map<String, List<String>> demoGallery = <String, List<String>>{
  // IPHONE 17 — generic smartphone photos.
  'prod_01M699CZFCAMBVAVF0THEK25H2': <String>[
    'https://images.pexels.com/photos/12882840/pexels-photo-12882840.png',
    'https://images.pexels.com/photos/25849099/pexels-photo-25849099.png',
    'https://images.pexels.com/photos/15876529/pexels-photo-15876529.jpeg',
  ],
  // Action Tesa HDHMR Board — board/timber references.
  'prod_01M59JS4A6QTH32AXVW9P2D3A3': <String>[
    'https://images.pexels.com/photos/7479035/pexels-photo-7479035.jpeg',
    'https://images.pexels.com/photos/5089122/pexels-photo-5089122.jpeg',
    'https://images.pexels.com/photos/12278570/pexels-photo-12278570.jpeg',
  ],
  // RANGER A/T — tyre references.
  'prod_01M59JHMK6M811FFT63G2WJMCV': <String>[
    'https://images.pexels.com/photos/16685597/pexels-photo-16685597.jpeg',
    'https://images.pexels.com/photos/8886305/pexels-photo-8886305.jpeg',
    'https://images.pexels.com/photos/34357288/pexels-photo-34357288.jpeg',
  ],
};

/// Slides for a product: its own thumbnail first, then any demo complements.
/// Products outside the allowlist keep exactly one slide — never a faked one.
List<PdpImage> pdpImages({required String productId, String? thumbnail}) {
  return <PdpImage>[
    if (thumbnail != null && thumbnail.isNotEmpty)
      PdpImage(url: thumbnail),
    for (final url in demoGallery[productId] ?? const <String>[])
      PdpImage(url: url, representative: true),
  ];
}
