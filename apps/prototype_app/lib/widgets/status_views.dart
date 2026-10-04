import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';

/// Shared error state shown when a remote load fails.
///
/// Shows a clean, user-facing message only; the detailed exception is written
/// to developer logs (via [debugPrint]) and never rendered in the UI.
class ErrorView extends StatelessWidget {
  const ErrorView({super.key, required this.error, this.onRetry});

  final Object error;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    debugPrint('Storefront load error: $error');
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AgencySpacing.lg),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            const Icon(Icons.cloud_off, size: 48),
            const SizedBox(height: AgencySpacing.sm),
            Text("Couldn't load data", style: AgencyText.title),
            const SizedBox(height: AgencySpacing.xs),
            Text(
              "We're having trouble connecting right now.\nPlease try again.",
              style: AgencyText.body,
              textAlign: TextAlign.center,
            ),
            if (onRetry != null) ...<Widget>[
              const SizedBox(height: AgencySpacing.md),
              FilledButton(onPressed: onRetry, child: const Text('Retry')),
            ],
          ],
        ),
      ),
    );
  }
}

/// Shared empty state.
class EmptyView extends StatelessWidget {
  const EmptyView({super.key, required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AgencySpacing.lg),
        child:
            Text(message, style: AgencyText.body, textAlign: TextAlign.center),
      ),
    );
  }
}
