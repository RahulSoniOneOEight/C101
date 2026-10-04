# agency_flutter_ui

Reusable Flutter experience package.

Layers:
1. foundation
2. themes
3. primitives
4. domain components
5. experience patterns

Expected integrations:
- Design Contract Flutter binding
- Widgetbook
- deterministic fixtures
- golden tests
- Nowa for live client-call visual review and controlled minor refinement

Business rules must not live in UI widgets.


## Nowa boundary

Nowa may be used live with the client for spacing, layout, typography, copy, component styling and presentation-level navigation changes. Any resulting edits must return to the governed Flutter source tree and pass Git diff review plus Visual/Golden QA.

Business rules, finance, permissions, data, integrations, workflow/state-machine logic and architecture must not be introduced through a live Nowa edit; those requests route to Change Contract review.
