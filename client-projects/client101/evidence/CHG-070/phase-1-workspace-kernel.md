# CHG-070 — Phase 1 Workspace kernel

**Date:** 2026-10-20
**App build:** `3a35f1a`
**Environment:** staging only
**Status:** REST collaboration kernel deployed; WebSocket feed deferred
**Production:** unauthorized

## Outcome

Phase 1 delivers a real B2B Workspace Service, a private Experience API proxy, and a Flutter
conversation surface. Two business accounts are isolated: Arjun Traders can see and post in its
Procurement/Approvals channels; Shakti Hardware sees only its own workspace and receives `404` for
Arjun's channel.

### Runtime

| Component | Detail |
|---|---|
| Workspace service | `services/workspace`, Bun + PostgreSQL, port 9040, private Docker network |
| Workspace database | `buildkart_workspace` in the existing staging PostgreSQL cluster |
| Experience API proxy | `/v1/workspaces*`, `/v1/channels/*`; authenticates the pilot, signs actor context with HMAC, forwards internally |
| App surface | B2B header Workspace icon → `/#/b2b/workspace` |
| Seed workspaces | `ws_arjun_procurement` (`business_arjun_traders`), `ws_shakti_procurement` (`business_shakti_hardware`) |
| Channels | Procurement and Approvals for Arjun; Procurement for Shakti |

No secret or service origin is exposed to the browser. The Workspace service independently checks
the HMAC, timestamp, business-account role and membership projection.

### Phase 1 API

- `GET/POST /v1/workspaces`
- `GET /v1/workspaces/{id}`
- `GET /v1/workspaces/{id}/channels`
- `GET /v1/workspaces/{id}/activity`
- `GET /v1/channels/{id}/messages`
- `POST /v1/channels/{id}/messages`
- `POST /v1/channels/{id}/read-cursor`

Messages write an append-only activity event and a transactional outbox row in the same database
transaction. The outbox publisher and WebSocket feed are not active in this slice.

## Verification

| Check | Result |
|---|---|
| Workspace and Experience API TypeScript typechecks | pass |
| Flutter analyze | clean |
| Full non-golden Flutter suite | **238 passed** |
| Workspace-specific Flutter tests | pass (includes bigint sequence serialization) |
| Workspace smoke (signed actors) | **pass** |
| Arjun workspace/membership | `ws_arjun_procurement`, Procurement + Approvals |
| Shakti workspace/membership | `ws_shakti_procurement`, Procurement only |
| Cross-tenant channel read | **404** |
| POST message | **201**, new sequence, visible to the author |
| Chrome 390×844 Arjun | workspace name, seed message, message send visible, no console errors |
| Chrome 360×800 Shakti | own workspace, empty state, no Arjun content, no console errors |

Artifacts:

- `workspace-smoke.json`
- `workspace-ui-report.json`
- `workspace-390-arjun.png`
- `workspace-390-arjun-after-send.png`
- `workspace-360-shakti.png`

The first character of a Puppeteer-typed message can be lost to input focus; the server stored and
rendered the submitted body. This is a test-harness typing artifact, not a UI data-loss path.

## Deferred / known gaps

- **WebSocket feed:** `/v1/workspaces/{id}/stream` currently returns `501 stream-not-enabled`; the UI
  polls every 6 seconds. The OpenAPI contract already defines the cursor feed, but it is not proxied
  through the Experience API yet.
- **Outbox publisher:** rows are written; NATS publishing and notification projection are not enabled.
- **Unread badge:** the header accepts a count but the app does not yet fetch it; icon is unbranded
  with a badge.
- **Product shares, purchase drafts, proposals, approvals, revalidation and checkout handoff:** Phase 2
  and Phase 3, intentionally absent.
- Operator audited-read view is not built.
- Host compose and secret files were updated in staging (workspace DB URL, HMAC secret, Firebase
  credential mount). Secrets remain outside Git. A compose backup was created before the edit.
- Full human visual acceptance remains outstanding.

Staging only; production remains unauthorized.
