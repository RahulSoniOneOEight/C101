import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:prototype_app/widgets/staging_strip.dart';

void main() {
  testWidgets('the staging marker is a full-width strip, not a corner ribbon',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
      theme: AgencyTheme.light(),
      home: const Scaffold(body: StagingStrip()),
    ));

    // The strip carries the short build id so a stale tab is visible.
    expect(find.textContaining('STAGING'), findsOneWidget);
    // The Material debug ribbon is unrelated; this one must stay a plain strip.
    expect(find.byType(StagingStrip), findsOneWidget);
    expect(tester.getSize(find.byType(StagingStrip)).height, 16);
    expect(tester.getSize(find.byType(StagingStrip)).width, 800);
  });

  testWidgets('the strip uses the alert token, keeping white text readable',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
      theme: AgencyTheme.light(),
      home: const Scaffold(body: StagingStrip()),
    ));

    final material = tester.widget<Material>(
      find.descendant(of: find.byType(StagingStrip), matching: find.byType(Material)).first,
    );
    expect(material.color, AgencyHomePalette.light.alert);
  });
}
