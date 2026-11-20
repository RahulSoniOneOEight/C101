# Web chat shared-list editing, proposals and cart build — 20 Nov 2026

Status: **implemented on staging** · Web `release-web-20261120-083349` · Source `f8f1f18`, `8f685b5`
Production: untouched.

## 1. What changed

The web "Ask BazarBee" drawer's Shared list view is now interactive and mirrors the Flutter dock:

- **Multi-draft selector** when a workspace has more than one readable purchase draft.
- **Quantity editing** with `−` / `+`, and **Remove** on accepted lines.
  - A household owner or business buyer/admin auto-accepts their own proposal, so the list updates
    immediately.
  - Other members create a pending proposal and see “Your changes become proposals for the owner.”
- **Pending proposals** are listed with the proposed change, author and base version. Deciders get
  Accept and Reject; other roles see “Waiting for the owner”.
- **Cart build review**:
  - Offered only to a household owner or a business buyer/admin.
  - Business lists additionally require an approved revision whose `revision_id` and
    `commercial_hash` match the current revision.
  - Re-reads every line's current Commerce product/offer for the same variant.
  - Compares the exact offer, unit price, seller, currency, stock and inventory; checks MOQ for B2B.
  - Blocks out-of-stock, short-stock and below-MOQ lines.
  - Requires an explicit acknowledgement checkbox when price, seller, currency or MOQ differs.
  - Adds the confirmed quantities to the retail cart or the separate trade quotation cart, then
    links to `/cart` or `/trade/quote`; **never creates an order**.
  - Before writing, re-reads the draft revision, approval and offers; a changed revision or offer
    requires a fresh review. Writes all lines in one browser-local update, replacing matching
    quantities rather than incrementing on a repeat. Invalid quantities, mixed currencies,
    duplicate offers and mixed-channel retail carts are rejected before a write.

Web proxy additions:

- `GET /api/chat?product=<productId>&channel=b2c|b2b`
- `POST /api/chat` `{ action: "draft-proposal", draftId, expectedVersion, kind, payload }`
- `POST /api/chat` `{ action: "proposal-decision", proposalId, decision: "accept"|"reject" }`

The workspace service remains the authority for membership, roles, proposal decisions, stale
versions and approval state.

## 2. Browser QC

### Household owner — edit and build

Signed in as `superadmin01@buildkart.test`, `Super Admin Home`:

```text
SHARED LIST · Super Admin Home shared list · draft · v1 · unvalidated
Wonder Cement — SKU WON-PPC-DAN-01 · PowerMax Depot — 2 × ₹350 — − + Remove
Changes to this list apply immediately.
```

After `+`:

```text
draft · v2 · unvalidated
Shared list updated.
Wonder Cement — 3 × ₹350
```

Cart review:

```text
Review before cart build
Wonder Cement — SKU WON-PPC-DAN-01 · 3 × ₹400
Price ₹350 → ₹400
[ ] I understand the price, stock, seller or MOQ differences.
Add to cart   Close
```

`Add to cart` was disabled until the acknowledgement was checked. After building:

```text
1 line added to the cart. No order was created. View cart
localStorage: priceMinor 40000, currency INR, channel b2c, quantity 3
Cart page: Wonder Cement — ₹400 each — ₹1,200
```

Screenshots: `web-draft-02-cart-review.png`, `web-draft-03-cart-built.png`,
`web-draft-04-cart-page.png`.

### Business buyer — proposal decision

Signed in as `buyer.b2b01@buildkart.test`, `Arjun Traders Procurement`:

```text
Pending proposals
Change quantity to 4
Proposed by pilot_buyer_b2b02 · based on v24
Accept   Reject
This trade list needs an approved revision before it can become a cart.
```

After **Accept**:

```text
draft · v25 · unvalidated
Proposal accepted.
Wonder Cement — 4 × ₹350
```

A buyer quantity change applied immediately (`v24 → v25` in QC). A business list without a matching
approved revision keeps cart build disabled and explains why.

Screenshots: `web-draft-07-buyer-proposal.png`, `web-draft-08-buyer-accepted.png`.

### Multi-draft selector

A second household list was seeded; the drawer showed both and switched correctly:

```text
options: Super Admin Home second list | Super Admin Home shared list
selected second list: v1 — Wonder Cement 1 × ₹350
selected first list:  v2 — Wonder Cement 3 × ₹350
```

Screenshot: `web-draft-09-selector.png`.

### Seed

`services/hosted/scripts/seed-superadmin-home-cartqc.sql` creates the two staging household lists
used for this QC. It is insert-only and staging-only: rerunning it never resets an edited draft.

## 3. QC corrections and verification

The first staging web release `release-web-20261120-075704` had a cart-routing/duplicate-build
defect. Corrected in `8f685b5` and published as `release-web-20261120-083349`:

- Trade builds now write `bazarbee.trade.quote.v1` (not the retail cart) and link to `/trade/quote`.
  A read-only browser check of the quotation page displayed Wonder Cement at the tier price
  ₹380/unit, MOQ 5 and line total ₹1,900. Screenshot: `web-draft-12-quote-destination.png`.
- Retail/trade builds replace matching quantities in one localStorage write. `node
  --experimental-strip-types --test tests/cart-build.test.mjs` passed **5/5**, including repeated
  builds and conflict/invalid input tests.
- A mocked local Next preview passed retail and trade builds, repeats, stale-revision and
  offer-price-change rejection, missing-approval, wrong-variant, out-of-stock and below-MOQ gates;
  **zero browser page errors**. Screenshot reviewed:
  `web-draft-11-preview-quote.png`. Preview did not write to shared staging data.
- `npm run typecheck` and `npm run build` passed.
- Staging smoke without server-side mutations on the new release: the household review showed
  ₹350 → ₹400 and blocked adding until acknowledgement; after the click, this browser's cart had one Wonder Cement at
  ₹400, quantity 1, INR, B2C, with a `/cart` link and no order. The business draft without matching
  approval kept the trade button disabled. The signed-in B2B product proxy returned 200; the
  anonymous proxy returned 401. Both pages had zero page errors; the deployed web container was
  healthy. Screenshots reviewed: `web-draft-13-staging-retail.png`,
  `web-draft-14-staging-trade-gate.png`.

DeepSeek V4 Pro review was requested but failed with **insufficient balance**. These corrections
were reviewed by GPT Sol and verified as above; **no DeepSeek ship verdict is claimed**. A real
approved-business draft was not available for a live trade-build smoke; the trade happy path was
verified using the isolated preview and the existing quote page renderer.

## 4. Remaining web chat gaps

- Participant removal and role changes (no member-list/remove API).
- Revision approval request UI (the cart gate reads approval state; the web cannot request it yet).
- Unread refresh while the drawer is open on another channel.
- Arrow-key navigation in the tab strips.
- Richer product-reference cards for app-originated shares.
