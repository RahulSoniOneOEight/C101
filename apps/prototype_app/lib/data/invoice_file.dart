/// Platform-conditional invoice file writer.
///
/// Native (Android/desktop) writes to the temporary directory; web triggers a
/// browser download. The selected implementation always exposes the same
/// `saveInvoiceFile` signature so callers stay platform-agnostic.
library;

export 'invoice_file_io.dart'
    if (dart.library.js_interop) 'invoice_file_web.dart';
