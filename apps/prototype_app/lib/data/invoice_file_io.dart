import 'dart:io';

/// Writes [contents] next to the platform temporary directory and returns a
/// user-facing confirmation message.
Future<String> saveInvoiceFile(String fileName, String contents) async {
  final file = File('${Directory.systemTemp.path}/$fileName');
  await file.writeAsString(contents);
  return 'Invoice saved to ${file.path}';
}
