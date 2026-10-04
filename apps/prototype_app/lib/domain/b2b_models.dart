import 'models.dart';

/// Approval lifecycle of a B2B quote (RFQ).
enum QuoteStatus {
  draft('Draft'),
  approvalPending('Approval pending'),
  approved('Approved'),
  rejected('Rejected');

  const QuoteStatus(this.label);

  final String label;
}

/// A B2B customer account with a credit facility.
class B2BAccount {
  const B2BAccount({
    required this.id,
    required this.companyName,
    required this.creditLimit,
    required this.usedCredit,
  });

  final String id;
  final String companyName;
  final Money creditLimit;
  final Money usedCredit;

  Money get availableCredit => Money(
        amount: creditLimit.amount - usedCredit.amount,
        currencyCode: creditLimit.currencyCode,
      );
}

/// A request-for-quote (RFQ) with an approval workflow.
class Quote {
  const Quote({
    required this.id,
    required this.reference,
    required this.items,
    required this.total,
    required this.status,
  });

  final String id;
  final String reference;
  final List<CartLineItem> items;
  final Money? total;
  final QuoteStatus status;

  Quote copyWith({QuoteStatus? status}) => Quote(
        id: id,
        reference: reference,
        items: items,
        total: total,
        status: status ?? this.status,
      );
}
