import 'package:flutter_test/flutter_test.dart';
import 'package:prototype_app/domain/models.dart';

void main() {
  test('money is grouped and keeps paise when present', () {
    // Whole amounts stay integers and use Indian grouping for INR.
    expect(const Money(amount: 10000, currencyCode: 'INR').formatted, '₹100');
    expect(
        const Money(amount: 12354900, currencyCode: 'INR').formatted,
        '₹1,23,549');
    expect(
        const Money(amount: 100000000, currencyCode: 'INR').formatted,
        '₹10,00,000');

    // Fractional amounts keep two decimals so summary lines reconcile.
    expect(const Money(amount: 10001, currencyCode: 'INR').formatted,
        '₹100.01');
    expect(const Money(amount: 10099, currencyCode: 'INR').formatted,
        '₹100.99');
    expect(const Money(amount: 50940, currencyCode: 'INR').formatted,
        '₹509.40');
    expect(const Money(amount: 2160, currencyCode: 'INR').formatted, '₹21.60');

    // Other currencies use Western grouping.
    expect(const Money(amount: 2050, currencyCode: 'USD').formatted, '\$20.50');
    expect(const Money(amount: 123456789, currencyCode: 'USD').formatted,
        '\$1,234,567.89');
  });
}
