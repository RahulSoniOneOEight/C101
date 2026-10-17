import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('staging web releases cannot retain an older Flutter app shell', () {
    final bootstrap = File('web/flutter_bootstrap.js').readAsStringSync();
    expect(bootstrap, contains('_flutter.loader.load();'));
    expect(
      bootstrap,
      isNot(contains('serviceWorkerSettings')),
      reason: 'the staging bootstrap must not register an offline app-shell worker',
    );

    final index = File('web/index.html').readAsStringSync();
    expect(index, contains('navigator.serviceWorker.getRegistrations()'));
    expect(index, contains("name.indexOf('flutter-') === 0"));

    final firebase = jsonDecode(File('../../firebase.json').readAsStringSync())
        as Map<String, dynamic>;
    final hosting = firebase['hosting'] as Map<String, dynamic>;
    final headers = (hosting['headers'] as List<dynamic>)
        .whereType<Map<String, dynamic>>()
        .toList();

    for (final source in <String>['/', '/index.html', '**/*.@(js|json)']) {
      final rule = headers.singleWhere((item) => item['source'] == source);
      final values = (rule['headers'] as List<dynamic>)
          .whereType<Map<String, dynamic>>()
          .where((item) => item['key'] == 'Cache-Control')
          .map((item) => item['value'])
          .whereType<String>();
      expect(values, contains(contains('no-store')), reason: '$source may retain an old release');
    }
  });
}
