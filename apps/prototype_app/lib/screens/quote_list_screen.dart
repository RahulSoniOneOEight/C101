import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../providers/b2b_providers.dart';
import '../providers/cart_providers.dart';
import '../widgets/status_views.dart';

/// Lists RFQs; the FAB converts the current cart into a new quote.
class QuoteListScreen extends ConsumerWidget {
  const QuoteListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final quotes = ref.watch(quotesProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Quotes')),
      floatingActionButton: FloatingActionButton(
        tooltip: 'Request a quote',
        onPressed: () {
          final cart = ref.read(cartProvider).value;
          final quote = ref.read(quotesProvider.notifier).createQuote(
                items: cart?.items ?? const [],
                total: cart?.total,
              );
          context.push('/quotes/${quote.id}');
        },
        child: const Icon(Icons.add),
      ),
      body: quotes.isEmpty
          ? const EmptyView(
              message: 'No quotes yet — request one from your cart.')
          : ListView.builder(
              padding: const EdgeInsets.all(AgencySpacing.md),
              itemCount: quotes.length,
              itemBuilder: (context, index) {
                final quote = quotes[index];
                return Card(
                  child: ListTile(
                    title: Text(quote.reference),
                    subtitle: Text(
                      '${quote.items.length} item(s) · ${quote.total?.formatted ?? '—'}',
                    ),
                    trailing: Text(quote.status.label, style: AgencyText.label),
                    onTap: () => context.push('/quotes/${quote.id}'),
                  ),
                );
              },
            ),
    );
  }
}
