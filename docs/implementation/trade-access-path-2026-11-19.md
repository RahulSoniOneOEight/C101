# B2C → Trade access path — 19 Nov 2026

Status: **shipped to staging web** · Release `release-web-20261119-182252`
Hosts: `https://gobazarbee.com` · `/trade` · `/trade/catalogue`
Branch: `feat/bazarbee-branding`

## Reported issue

A user signed in on the consumer site could not reach the trade home. Browser QC reproduced it with
the consumer pilot account `rsoni001@gmail.com`:

- The account has only the `customer` role (`pilot_customer_b2c01`).
- The header channel switch was hidden because `hasTrade` was false.
- `/trade` showed the marketing page, but the only CTAs were the Flutter app and the consumer
  catalogue.
- `/trade/catalogue` rendered the trade navigation (`Overview / Catalogue / Quick order / Credit /
  Quote`) before showing “trade account required”, which looked like a broken workspace.

The trade account `buyer.b2b01@buildkart.test` (role `b2b_buyer`, business
`business_arjun_traders`) did work when signed in on the consumer host and switched with the
Shop/Trade control.

## Fix

1. **Header** — the Shop/Trade switch now renders for every signed-in user. A consumer account sees
   Trade with the tooltip “Trade access requires a trade-enabled account”.
2. **Trade marketing page** — a consumer session sees an explicit notice:
   “You are signed in with a consumer account. The trade workspace needs a trade-enabled B2B
   account.”
   A primary **Sign in with a trade account** action points at `/sign-in?next=/trade`. The app and
   consumer-catalogue actions remain.
3. **Access-denied pages** — `/trade/catalogue`, `/trade/credit`, `/trade/quote` and `/trade/pdp/*`
   no longer render the trade workspace navigation for consumer sessions. They show one clean access
   card with **Sign in with a trade account** and **Consumer catalogue** / **Trade overview**.
4. **Copy** — the marketing page no longer says the same consumer account automatically has the
   trade workspace. It states that trade rates, credit, quotes and RFQ need a trade-enabled account,
   and the rollout lists now reflect what is actually live on web.

## Verification

| Step | Result |
|---|---|
| Consumer login `rsoni001` | Header shows **Shop / Trade** |
| Click Trade | `/trade` marketing page with consumer-account notice |
| Trade CTA | **Sign in with a trade account** → `/sign-in?next=%2Ftrade` |
| Consumer `/trade/catalogue` | No trade nav; access card with trade sign-in |
| Sign in with `buyer.b2b01` | Redirected to `/trade` |
| Trade home | “Your trade desk, on the web.” with the trade nav |
| Existing B2B channel switch | Still works for the trade-enabled account |

## Role boundary (important)

Trade access is a **separate B2B role**, not a toggle on a consumer account. A consumer-only account
such as `pilot_customer_b2c01` cannot enter the workspace until it is assigned a `b2b_buyer` role and a
business account. The UI now explains this and gives the correct sign-in path instead of hiding it.

If the consumer tester account should also be able to open the trade workspace, that is a role
assignment (`b2b_buyer` + a business account), not a front-end change.

## Files

- `apps/web/app/components/channel-switch.tsx`
- `apps/web/app/trade/page.tsx`
- `apps/web/app/trade/catalogue/page.tsx`
- `apps/web/app/trade/credit/page.tsx`
- `apps/web/app/trade/quote/page.tsx`
- `apps/web/app/trade/pdp/[id]/page.tsx`

## Rollback

Revert the web commit and redeploy. The previous web release is
`release-web-20261119-181458` (B2B direct-order action, before the trade access path).
