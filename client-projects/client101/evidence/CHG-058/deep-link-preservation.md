# CHG-058 — authenticated deep-link preservation

**Date:** 2026-10-19
**Status:** Implemented and unit-verified; staging deployment pending
**Change:** `client-projects/client101/changes/CHG-058.yaml`

## Defect

`PinCommerceApp.initState` restored the session and then unconditionally routed to
`/`, `/b2b` or `/notifications`. A signed-in full-page load of `/#/browse`,
`/#/checkout` or `/#/b2b/catalogue` therefore lost the requested route.

## Fix

`apps/prototype_app/lib/core/session_route_policy.dart`:

- `sessionEntryRoutes` lists the temporary entry surfaces: `''`, `/onboarding`,
  `/login`, `/otp`, `/signup`.
- `restoredSessionRedirect` returns the role landing page **only** when the
  current path is one of those entry routes, and returns `null` otherwise.
- `app.dart` now reads the live router location, asks the policy, and only calls
  `go(...)` when the policy returns a destination.

Role landing selection is unchanged: B2B roles → `/b2b`, `customer` → `/`,
anything else → `/notifications`. Query strings are not part of
`uri.path`, so `/browse?tag=Flash%20Deals` keeps its query. Route-specific
cart and identity guards still run inside the screens, untouched.

## Verification

| Check | Result |
|---|---|
| `/onboarding` + customer → `/` | pass |
| `/login` + B2B → `/b2b` | pass |
| `/otp` + non-commerce role → `/notifications` | pass |
| `/browse` preserved | pass |
| `/checkout` preserved | pass |
| `/product/:id` preserved | pass |
| `/b2b/catalogue` preserved | pass |
| `flutter analyze` | pass |
| `flutter test --exclude-tags golden` | 209 pass |

Tests: `apps/prototype_app/test/session_route_policy_test.dart`.

## Deployment

The policy is client-side, so it ships with the next Firebase Hosting build.
The Experience API needs no change for this item.

Released in the web app build `711e5e3` (`STAGING · 711e5e3`). Full-page
refreshes of `/browse`, `/checkout` and `/b2b/catalogue` now keep the requested
route for a restored session; onboarding/login still hand off to the role
landing page.

Staging only; production release remains unauthorized.
