import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';

import '../domain/presentation.dart';

/// Optional CMS welcome creative. Returns no space when the banner has no image or the image fails,
/// so the existing onboarding/login layout is never broken by missing content.
class WelcomeBanner extends StatelessWidget {
  const WelcomeBanner({required this.banner, super.key});

  final StorefrontBanner banner;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final wide = constraints.maxWidth >= 700;
        final url = wide
            ? (banner.imageDesktopUrl ??
                banner.imageTabletUrl ??
                banner.imageMobileUrl ??
                banner.imageUrl)
            : (banner.imageMobileUrl ??
                banner.imageTabletUrl ??
                banner.imageDesktopUrl ??
                banner.imageUrl);
        if (url == null || url.trim().isEmpty) {
          return const SizedBox.shrink();
        }
        return Padding(
          padding: const EdgeInsets.only(bottom: AgencySpacing.lg),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(AgencyRadius.lg),
            child: AspectRatio(
              aspectRatio: wide ? 16 / 7 : 16 / 9,
              child: Image.network(
                url,
                fit: BoxFit.cover,
                semanticLabel: banner.imageAlt,
                errorBuilder: (context, error, stackTrace) =>
                    const SizedBox.shrink(),
              ),
            ),
          ),
        );
      },
    );
  }
}
