import 'package:flutter_test/flutter_test.dart';
import 'package:prototype_app/domain/models.dart';

void main() {
  test('money is displayed in whole units rounded up', () {
    expect(const Money(amount: 10000, currencyCode: 'INR').formatted, '₹100');
    expect(const Money(amount: 10001, currencyCode: 'INR').formatted, '₹101');
    expect(const Money(amount: 10099, currencyCode: 'INR').formatted, '₹101');
    expect(const Money(amount: 999, currencyCode: 'INR').formatted, '₹10');
    expect(const Money(amount: 2050, currencyCode: 'USD').formatted, '\$21');
  });
}
