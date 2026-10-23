import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:prototype_app/widgets/cart_feedback.dart';

void main() {
  testWidgets('cart toast is visible briefly and then removed', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Builder(
            builder: (context) => TextButton(
              onPressed: () => showCartAddedToast(context),
              child: const Text('Add'),
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.text('Add'));
    await tester.pump();
    expect(find.text('Added to cart'), findsOneWidget);

    await tester.pump(const Duration(milliseconds: 1000));
    expect(find.text('Added to cart'), findsNothing);
  });
}
