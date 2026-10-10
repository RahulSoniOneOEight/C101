import 'dart:js_interop';

/// Provided by `web/index.html`; triggers a client-side browser download.
@JS('buildkartSaveText')
external void _buildkartSaveText(String fileName, String contents);

/// Hands [contents] to the browser as a downloadable file.
Future<String> saveInvoiceFile(String fileName, String contents) async {
  _buildkartSaveText(fileName, contents);
  return 'Invoice download started';
}
