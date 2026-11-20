# Web chat shared list + read cursors — 20 Nov 2026

Status: **implemented on staging** · Web `release-web-20261120-071856` · Source `6d8b173`
Production: untouched.

## 1. What changed

The web "Ask BazarBee" drawer now has:

- **Conversation / Shared list** view tabs.
- A read-only shared-list view backed by the existing workspace APIs:
  - `GET /v1/workspaces/:id/purchase-drafts`
  - `GET /v1/purchase-drafts/:id`
- Line detail: product title, SKU, seller, quantity and unit price.
- Draft status/version/validation and pending proposals.
- A refresh action for the list.
- **Unread badges** on channel tabs and the chat launcher.
- **Read cursors**: loading a channel calls
  `POST /v1/channels/:id/read-cursor` with the latest message sequence; the channel's unread count
  is cleared locally and on the next workspace read.

The web API proxy (`/api/chat`) now forwards:
- `?drafts=<workspaceId>`
- `?draft=<draftId>`
- `action: "mark-read"` with `channelId` and `sequence`

## 2. Staging data for QC

`services/hosted/scripts/seed-web-shared-list.sql` creates:

- draft `drf_bazarbee_pilot` in `ws_bazarbee_pilot`;
- accepted line: Wonder Cement, qty 2, ₹350, PowerMax Depot;
- pending proposal: `update_quantity` by `pilot_buyer_b2b01`.

A second QC message from `pilot_buyer_b2b01` was inserted into the procurement channel to exercise
the unread badge.

## 3. Verification

Browser QC at 1440 px:

```text
Shared list tab
SHARED LIST
BazarBee Pilot shared list
draft · v1 · unvalidated
Wonder Cement
SKU WON-PPC-DAN-01 · PowerMax Depot
2 × ₹350
Pending proposals
update quantity
pilot_buyer_b2b01
Refresh shared list
```

Read cursor:

```text
Before opening chat:
procurement unread = 1

Chat tabs:
Assistant, Procurement1

After selecting Procurement:
procurement unread = 0
read_cursor.last_event_sequence = 132
```

Screenshots: `web-shared-02-list.png`, `web-shared-04-read-procurement.png`.

## 4. QC follow-ups

DeepSeek V4 Pro reviewed the increment and returned **ship**. Corrected:

- mark-read now checks the response before clearing the local unread badge;
- signed-out users see the sign-in prompt on the Shared list tab;
- initial message loading paginates up to 10 pages and displays the latest 100, so a >50-message
  channel can be marked fully read;
- `mark-read` rejects an empty/ambiguous sequence;
- the aside no longer announces the whole drawer; the launcher unread count is part of its
  accessible name; view/channel tabs have `aria-controls`, linked tabpanels and roving tabindex.

Arrow-key navigation within the tabs remains a follow-up; mouse/Enter activation works.

## 5. Remaining web drawer gaps

- Invitations/participant management.
- Draft editing/proposal decisions and revision approvals.
- Cart-build sheet and checkout handoff.
- Multi-draft selector (the web view shows the first draft).
- New-message unread refresh while the drawer is open on another channel; the badge updates when
  channels are reloaded.

The Flutter dock already has these flows; its audit passed 17/17
(`conversation_dock_test`, `cart_build_sheet_test`, `workspace_screen_test`).
