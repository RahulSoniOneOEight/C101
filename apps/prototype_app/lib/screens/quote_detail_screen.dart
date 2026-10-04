import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../domain/b2b_models.dart';
import '../providers/b2b_providers.dart';
import '../widgets/status_views.dart';

/// Quote detail with the approval workflow (submit / approve / reject).
class QuoteDetailScreen extends ConsumerWidget {
  const QuoteDetailScreen({super.key, required this.quoteId});

  final String quoteId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final quote =
        ref.watch(quotesProvider).where((q) => q.id == quoteId).firstOrNull;

    if (quote == null) {
      return Scaffold(
        appBar: AppBar(),
        body: const EmptyView(message: 'Quote not found'),
      );
    }

    return Scaffold(
      appBar: AppBar(title: Text(quote.reference)),
      body: ListView(
        padding: const EdgeInsets.all(AgencySpacing.md),
        children: <Widget>[
          _StatusBadge(status: quote.status),
          const SizedBox(height: AgencySpacing.md),
          Text('Items', style: AgencyText.title),
          const SizedBox(height: AgencySpacing.sm),
          for (final item in quote.items)
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(item.title),
              trailing: Text(
                '${item.quantity} × ${item.unitPrice?.formatted ?? '—'}',
              ),
            ),
          const SizedBox(height: AgencySpacing.md),
          Text('Total: ${quote.total?.formatted ?? '—'}',
              style: AgencyText.metric),
          const SizedBox(height: AgencySpacing.lg),
          ..._actions(ref, quote),
        ],
      ),
    );
  }

  List<Widget> _actions(WidgetRef ref, Quote quote) {
    final notifier = ref.read(quotesProvider.notifier);
    switch (quote.status) {
      case QuoteStatus.draft:
        return <Widget>[
          FilledButton(
            onPressed: () => notifier.submit(quote.id),
            child: const Text('Submit for approval'),
          ),
        ];
      case QuoteStatus.approvalPending:
        return <Widget>[
          FilledButton(
            onPressed: () => notifier.approve(quote.id),
            child: const Text('Approve'),
          ),
          const SizedBox(height: AgencySpacing.sm),
          OutlinedButton(
            onPressed: () => notifier.reject(quote.id),
            child: const Text('Reject'),
          ),
        ];
      case QuoteStatus.approved:
      case QuoteStatus.rejected:
        return const <Widget>[];
    }
  }
}

class _StatusBadge extends StatelessWidget {
  const _StatusBadge({required this.status});

  final QuoteStatus status;

  @override
  Widget build(BuildContext context) {
    final color = switch (status) {
      QuoteStatus.draft => Colors.blueGrey,
      QuoteStatus.approvalPending => Colors.orange,
      QuoteStatus.approved => Colors.green,
      QuoteStatus.rejected => Colors.red,
    };
    return Chip(
      avatar: Icon(Icons.circle, size: 12, color: color),
      label: Text(status.label),
    );
  }
}
