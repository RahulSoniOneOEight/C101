import 'dart:async';

import 'package:flutter/material.dart';

OverlayEntry? _activeCartToast;
Timer? _activeCartToastTimer;

void _removeActiveCartToast() {
  _activeCartToastTimer?.cancel();
  _activeCartToastTimer = null;
  final entry = _activeCartToast;
  _activeCartToast = null;
  if (entry != null && entry.mounted) entry.remove();
}

/// Short-lived cart feedback rendered above the bottom navigation.
///
/// A Material snackbar is intentionally not used: on web it can stay visible
/// behind the shell transition and cover the bottom navigation. This overlay is
/// removed on a fixed timer, so it cannot become a persistent black strip.
void showCartAddedToast(BuildContext context, {String? label}) {
  _showCartToast(
    context,
    message: label ?? 'Added to cart',
    icon: Icons.check_circle_outline,
    background: const Color(0xFF1F2937),
    duration: const Duration(milliseconds: 900),
  );
}

void showCartErrorToast(BuildContext context, [String? message]) {
  _showCartToast(
    context,
    message: message ?? 'Could not add to cart. Please retry.',
    icon: Icons.error_outline,
    background: Theme.of(context).colorScheme.error,
    duration: const Duration(milliseconds: 2200),
  );
}

void _showCartToast(
  BuildContext context, {
  required String message,
  required IconData icon,
  required Color background,
  required Duration duration,
}) {
  final overlay = Overlay.maybeOf(context, rootOverlay: true);
  if (overlay == null) return;
  _removeActiveCartToast();

  final entry = OverlayEntry(
    builder: (_) => Positioned(
      left: 16,
      right: 16,
      bottom: 84,
      child: IgnorePointer(
        child: Material(
          color: Colors.transparent,
          child: Center(
            child: DecoratedBox(
              decoration: BoxDecoration(
                color: background,
                borderRadius: BorderRadius.circular(24),
                boxShadow: const <BoxShadow>[
                  BoxShadow(
                    color: Color(0x33000000),
                    blurRadius: 12,
                    offset: Offset(0, 4),
                  ),
                ],
              ),
              child: Padding(
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 11),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: <Widget>[
                    Icon(icon, size: 18, color: Colors.white),
                    const SizedBox(width: 8),
                    Flexible(
                      child: Text(
                        message,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style:
                            const TextStyle(color: Colors.white, fontSize: 13),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  );

  _activeCartToast = entry;
  overlay.insert(entry);
  _activeCartToastTimer = Timer(duration, _removeActiveCartToast);
}
