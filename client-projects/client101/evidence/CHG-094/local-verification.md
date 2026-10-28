# CHG-094 — Web checkout session forwarding, verification

Date: 2026-10-29
Status: implemented and verified from a local production build against the staging Experience API.
Staging deployment is separately gated.

## What changed

| File | Change |
|---|---|
| `apps/web/lib/experience-api.ts` | `completeCheckout(input, sessionToken)` sends `Authorization` on cart create, line, customer details, shipping options, shipping method and completion. |
| `apps/web/app/api/checkout/route.ts` | Reads the HTTP-only session cookie; returns 401 without it; forwards the token; maps 401/400/404/409 responses. |
| `apps/web/app/checkout/page.tsx` | Signed-out visitors are redirected to sign-in with a `next` path back to the exact checkout URL. |
| `apps/web/app/sign-in/page.tsx` | Accepts `next` and passes it to the form. |
| `apps/web/app/sign-in/sign-in-form.tsx` | After verification, returns to `next` when it is a safe single-slash path; otherwise `/orders`. |

No Experience API change. No schema change.

## Verification

| Check | Result |
|---|---|
| `tsc --noEmit` | PASS |
| `next build` | PASS |
| Browser QC (local production build → staging API) | 5/5 PASS |
| Signed-out checkout | Redirects to `/sign-in?next=/checkout?…` |
| After sign-in | Returns to the same checkout URL |
| Place order | Server returns canonical group `og_01M623W6Z2PPX94861WA9WE0QP` |
| Order created | `#149` / `order_01M623W6YSVTCMBMS2CWDZAGZ9`, channel `b2c`, status `pending` |

The confirmation shown to the customer is the server's order group, not a client-side guess.

## Data

Order #149 is kept as staging test data, alongside #148 from CHG-093. The payment/ERP gaps recorded
in CHG-093 still apply to both orders.

## Evidence

- `browser-qc.json`
- `screenshots/sign-in-gate.png`, `checkout-form.png`, `checkout-confirmed.png`
- `tools/web-checkout-qc.cjs`

## Deferred

- Deploy the customer web image and repeat the QC on the deployed build.
- Payment collection linkage, simulated capture and ERP reservation (CHG-093 findings).
- B2B pricing and order wiring (CHG-093).
