import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../domain/b2b_models.dart';
import '../domain/models.dart';

/// Demo B2B account matching the reference profile (CUST-B2B-014).
///
/// Real accounts are resolved from the backend later; this is the governed
/// fixture used to exercise the credit + quote flows.
final b2bAccountProvider = Provider<B2BAccount>((ref) {
  return const B2BAccount(
    id: 'cus_b2b_014',
    companyName: 'Reference Retail Ltd',
    creditLimit: Money(amount: 18500000, currencyCode: 'INR'),
    usedCredit: Money(amount: 4200000, currencyCode: 'INR'),
  );
});

/// In-memory RFQ/quote ledger with an approval workflow.
class QuotesNotifier extends Notifier<List<Quote>> {
  @override
  List<Quote> build() => const <Quote>[];

  Quote createQuote(
      {required List<CartLineItem> items, required Money? total}) {
    final timestamp = DateTime.now().microsecondsSinceEpoch.toString();
    final quote = Quote(
      id: 'quote_$timestamp',
      reference: 'Q-$timestamp',
      items: List<CartLineItem>.of(items),
      total: total,
      status: QuoteStatus.draft,
    );
    state = [quote, ...state];
    return quote;
  }

  void submit(String id) => _setStatus(id, QuoteStatus.approvalPending);

  void approve(String id) => _setStatus(id, QuoteStatus.approved);

  void reject(String id) => _setStatus(id, QuoteStatus.rejected);

  void _setStatus(String id, QuoteStatus status) {
    state =
        state.map((q) => q.id == id ? q.copyWith(status: status) : q).toList();
  }
}

final quotesProvider =
    NotifierProvider<QuotesNotifier, List<Quote>>(QuotesNotifier.new);
