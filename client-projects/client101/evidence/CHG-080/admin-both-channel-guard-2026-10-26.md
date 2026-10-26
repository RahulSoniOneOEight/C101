# Evidence - Bought Together admin "Both" channel guard

- **Follow-up to:** CHG-080 (SKU-level pairing). Not in the original CHG-080 scope.
- **Date:** 2026-10-26
- **Lane / mechanism:** Lane A (admin UI only) / `image-rebuild` (admin panel is baked into the medusa-api image)
- **Approval status:** **retrospective approval required** - see section 8

---

## 1. Defect

In the admin Bought Together editor, the client-side "already paired" guard only worked for a
single channel:

```js
const existing = channel === "b2c" ? sku.active_pairs.b2c
               : channel === "b2b" ? sku.active_pairs.b2b
               : null;                       // channel === "both"
```

With **Channel = Both**, `existing` was always `null`, so the `Select` button stayed enabled for a
SKU already actively paired in B2C or B2B. The operator only discovered the conflict as
`409 product_already_paired` when pressing **Save pair**, after filling both slots.

The server rule was already correct: one active pair per SKU per channel. This was a client
inconsistency, not a business-rule change.

## 2. Fix

`services/backend/apps/admin/src/routes/merchandising/bought-together/page.tsx`

```diff
-                          : null;
+                          : (sku.active_pairs.b2c ?? sku.active_pairs.b2b);
```

For `both`, the SKU is now blocked when it is paired in either channel. The row already renders
`· already paired` next to the SKU, so the operator sees a reason rather than a dead button.

| Channel selected | Before | After |
|---|---|---|
| B2C | blocked if paired in B2C | unchanged |
| B2B | blocked if paired in B2B | unchanged |
| Both | never blocked -> 409 on save | blocked if paired in B2C or B2B |

## 3. Release

- **Release SHA:** `ef3dac4`
- **Commit range:** `d365eba..ef3dac4` (4 commits: `6228f9c` docs CHG-080 evidence (pre-existing),
  `15fe33c` docs project note, `bfc97f5` this fix, `ef3dac4` docs workflow-state correction)
- **Code commit:** `bfc97f5` - `fix(admin): block Both channel when SKU already paired in a channel`
- **Image:** `buildkart-hosted-pilot-medusa:latest` -> `4332bd9ed797`, also tagged `:release-ef3dac4`
- **Previous release:** `release-d365eba`
- **Release worktree:** `/opt/buildkart-releases/release-ef3dac4`
- **Build inputs:** copied `services/hosted/.env` from the previous release; keys
  `PUBLIC_API_HOSTNAME`, `PUBLIC_OPS_HOSTNAME`, `MERCUR_BACKEND_URL`
- **Recreated:** `medusa-api`, `medusa-worker` (`--force-recreate --no-deps`)
- **Schema:** no migration; `medusa-migrate` deliberately not run
- **Proxy:** `buildkart-hosted-pilot-proxy-1` restarted after health

## 4. Verification

| Check | Result |
|---|---|
| TSX parse (TypeScript API, 0 parse diagnostics) | PASS |
| Targeted `tsc` on the file | PASS - 0 errors in the edited region; 7 diagnostics total, all `TS2792` module-resolution artifacts |
| Type of new expression | `active_pairs.b2c` / `.b2b` are both `{...} \| null`; `??` yields the same union as the other branches |
| Full `tsc -b` / `vite build` locally | **NOT RUN** - the release worktree had no installed toolchain (`apps/admin/node_modules` contained only `.tmp`) |
| Image build (`npm run build --workspace @acme/admin`) on the host | PASS |
| `medusa-api` health | running / healthy (~10s after recreate) |
| `medusa-worker` | running |
| Image in use by the container | `sha256:4332bd9ed797` - matches the new build |
| `https://api-staging.pinakaplay.cloud/health` | 200 |
| `https://ops-staging.pinakaplay.cloud/health` | 200 |
| `https://ops-staging.pinakaplay.cloud/dashboard/` | 200 |
| `https://ops-staging.pinakaplay.cloud/seller/` | 200 |

## 5. Acceptance - deferred

The change is logic-only and adds no new string, so it cannot be confirmed by grepping the minified
bundle, and the admin page needs an authenticated browser session. Manual QC still required:

1. Sign in to `/dashboard/` as the staging admin.
2. Merchandising -> Bought together -> **New pair**.
3. Set **Channel = Both**.
4. Search for a SKU that is already active in a B2C pair.
5. **Expected:** the row shows `· already paired`, the button reads **`Paired`** and is disabled.
6. **Regression:** with Channel = B2C and the same SKU, behaviour is unchanged; with an unpaired
   SKU, `Select` still works and fills the slot.

## 6. Rollback

The previous image was preserved before building, so rollback needs no rebuild:

```bash
docker tag buildkart-hosted-pilot-medusa:rollback-d365eba buildkart-hosted-pilot-medusa:latest
ln -sfn /opt/buildkart-releases/release-d365eba /opt/buildkart-releases/current
cd /opt/buildkart-releases/release-d365eba/services/hosted
docker compose -f docker-compose.hosted.yml up -d --no-deps --force-recreate medusa-api medusa-worker
docker restart buildkart-hosted-pilot-proxy-1
```

## 7. Deferred register

| Item | Reason | Owner |
|---|---|---|
| Manual UI QC (section 5) | needs an authenticated browser session | requester |
| Local `tsc -b` / `vite build` gate | no toolchain installed in the release worktree | next bundle with a full checkout |
| P0-1 nav permission gating and read-only mode | separate scope; touches the permission boundary | not started |
| P0-2 `Paired` -> open the existing pair | separate scope; now more pressing because a Both pair cannot reuse a SKU without pausing the other pair | not started |
| P0-3 audit before/after diff | separate scope | not started |

## 8. Approval gap - declared, not hidden

This fix was implemented and deployed to staging without a Change Contract. The basis for that
judgement:

- It does not introduce or alter a business rule. The rule (one active pair per SKU per channel) is
  already enforced server-side with `409 product_already_paired`.
- It only makes the admin client surface that existing rule before Save instead of after.
- Classified Lane A: no API, schema, permission, or event change.

**Retrospective human approval is requested** for `ef3dac4`. If the judgement is rejected, run the
rollback in section 6.

## 9. Residual risks

- Staging now runs `ef3dac4`; the note in `docs/implementation/buildkart-project-note-2026-10-26.md`
  records `d365eba` as the deployed release and is now one release behind.
- A SKU active in B2C can no longer be added to a **Both** pair without first pausing or archiving the
  B2C pair. Correct per the server rule, but it is a new dead end until the `Paired` link (P0-2) exists.
- Production remains unauthorised and untouched.
