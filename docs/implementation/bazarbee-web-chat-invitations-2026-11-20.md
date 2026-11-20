# Web chat participants and invitations — 20 Nov 2026

Status: **implemented on staging** · Web `release-web-20261120-073032` · Source `c8a5892`,
`50bfa6c`
Production: untouched.

## 1. What changed

The web "Ask BazarBee" drawer now has a **Participants** view alongside Conversation and Shared list.

- Reads `GET /v1/workspaces/:id/invitations` through the web chat proxy.
- Shows the active participant count and seat capacity.
- Workspace owner/admin/buyer can invite an email address.
- The created one-time invite code is shown once so the owner can share it out of band.
- Pending invitations can be revoked.
- Revoking clears the displayed invite code.
- Users without invitation rights see an explanatory message instead of the form.
- Signed-out users see the sign-in prompt.

Web proxy additions:

- `GET /api/chat?invitations=<workspaceId>`
- `POST /api/chat` `{ action: "invite", workspaceId, email }`
- `POST /api/chat` `{ action: "revoke-invite", workspaceId, invitationId }`

The workspace service remains the authority for membership, capacity, owner/admin checks and token
hashing.

## 2. Browser QC

Created a fresh household workspace (`Super Admin Home`) for the super-admin, then:

```text
Participants
0 of 3 seats used
Invite email: buyer.b2b02@buildkart.test
Invitation created for buyer.b2b02@buildkart.test.
Share this invite code: EURu7lRg6b2PTdJCHJrrvLTyoGNMVyUn1KB9o85HYZA
buyer.b2b02@buildkart.test — pending · expires 11/27/2026 — Revoke
```

After **Revoke**:

```text
Invitation revoked.
buyer.b2b02@buildkart.test — revoked · expires 11/27/2026
invite code hidden
```

Screenshots: `web-invite-05-created.png`, `web-invite-07-revoked-clean.png`.

## 3. Shared pilot workspace note

`ws_bazarbee_pilot` has 21 testers, while the business workspace seat limit is 10. The drawer
therefore shows `21 participants · staging pilot workspace` rather than a misleading `21 of 10 seats
used`. The API still correctly refuses a new invitation once capacity is reached. Invitation QC was
performed on the fresh household workspace, where capacity is available.

## 4. Remaining web chat gaps

- Participant removal and role changes: the workspace API exposes invitation create/revoke and
  participant count, but no member list/remove endpoint.
- Draft editing/proposal decisions and revision approvals.
- Cart-build sheet and checkout handoff.
- Multi-draft selector.
- Unread refresh while the drawer is open on another channel.
- Arrow-key navigation within the view/channel tab strips.

The Flutter dock already has participant invitations and the remaining flows; its audit passed 17/17.
