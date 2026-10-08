# CHG-018 Identity Implementation Evidence

Date: 2026-10-08  
Scope: Configurable pilot identities, simulated OTP, Redis sessions and per-user order ownership

## Implemented

- `PILOT_USERS_JSON` accepts a validated deployment-supplied allowlist of at most 20 users.
- `PILOT_EXPECTED_USER_COUNT=20` makes hosted staging fail startup unless all 20 users are configured.
- `PILOT_OTP_CODE` is configurable and constrained to six digits; the challenge response does not
  disclose it.
- OTP challenges and hashed bearer-session keys use Redis TTLs and can be shared across replicas.
- Logout revokes the Redis session.
- Cart creation records the authenticated pilot owner in the durable correlation store.
- Cart mutation, checkout completion and customer order reads enforce that owner and return `404`
  for another pilot user's reference to prevent enumeration.
- The transitional event notification feed is authenticated and filters projections by owner.
- Flutter stores the verified bearer token in the Experience API client and clears it on logout.

## Checks run

| Check | Result |
|---|---|
| `python tooling/validate_chg018_approvals.py` | Pass — 21 role outcomes, G0 approved |
| `python tooling/validate_contracts.py` | Pass — 27 API paths, 22 event channels, 9 fixtures |
| `bun run typecheck` in `services/experience-api` | Pass |
| 20-user config parse/startup validation | Pass |
| `bun run test:identity` with Redis, PostgreSQL and Experience API | Pass |
| `flutter analyze` in `apps/prototype_app` | Pass |
| `flutter test` in `apps/prototype_app` | Pass — 100 tests |

## Runtime integration result

Docker Desktop was started and `bun run test:identity` passed against Redis, PostgreSQL and the
Experience API. It verified:

- unknown identity returns `403`;
- the OTP is not disclosed by the challenge response;
- two auth-store instances share a challenge/session through Redis;
- owner order read succeeds while another pilot user receives `404`; and
- logout invalidates the session.

The two-client Redis assertion demonstrates replica sharing and restart-safe persistence because no
challenge or session state remains in API process memory.

No production provider, credential, customer data or release effect was enabled.
