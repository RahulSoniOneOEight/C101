{{flutter_js}}
{{flutter_build_config}}

// Staging must always load the release that was just deployed. Offline app-shell caching previously
// kept an older home layout alive after a release, so this bootstrap deliberately registers no
// service worker. Static product imagery and engine binaries still use Firebase's bounded cache.
_flutter.loader.load();
