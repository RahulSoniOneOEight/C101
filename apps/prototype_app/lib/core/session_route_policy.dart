/// Entry routes are temporary authentication/onboarding surfaces. Once a
/// session is restored they should hand off to the user's role landing page.
const Set<String> sessionEntryRoutes = <String>{
  '',
  '/onboarding',
  '/login',
  '/otp',
  '/signup',
};

/// Returns the role landing route after session restoration, or `null` when
/// [currentPath] is already a meaningful deep link and must be preserved.
String? restoredSessionRedirect({
  required String currentPath,
  required Set<String> roles,
}) {
  final normalized = currentPath.trim().isEmpty
      ? ''
      : currentPath.startsWith('/')
          ? currentPath
          : '/$currentPath';
  if (!sessionEntryRoutes.contains(normalized)) return null;

  if (roles.any((role) => role.startsWith('b2b_'))) return '/b2b';
  if (roles.contains('customer')) return '/';
  return '/notifications';
}
