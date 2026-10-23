# Order page benchmark — BuildKart vs Shopify Admin

Date: 2026-10-23
Scope: functional, UX and operational benchmark of the Admin order detail page.
Not measured: page latency, infrastructure cost, security penetration, mobile app performance.

## Method

BuildKart reference:

- Live staging order `#113` (`order_01M5MGPWNKX5X6GGZDP2VBCREY`), release `5628fca`.
- State: payment captured, ₹15,300 partial refund, delivery delivered 2 of 2, return completed 1 of 2.
- Evidence: screenshots and DOM inspection in
  `client-projects/client101/evidence/CHG-035/order-workbench-screenshots/`.
- Current page is a Medusa/Mercur Admin order page with the BuildKart delivery/returns widget.

Shopify reference:

- Shopify Help Center: Managing order details, order statuses, fulfilling orders,
  refunding orders, creating returns and exchanges, processing returns, editing orders.
- No Shopify store login was used. This is therefore a feature/UX benchmark against documented
  Shopify behavior, not a pixel-by-pixel visual comparison.

## Executive summary

BuildKart has a clean, trustworthy read-only order view and stronger marketplace safety than a
single-store Shopify admin: seller-scoped delivery and returns, explicit versioned transitions,
idempotency, and no hidden refund or stock movement from a return.

Shopify is substantially ahead as an order **workbench**. It puts the primary actions on the order,
uses four explicit status families, and provides guided refund, return, fulfillment, tracking and
customer-communication workflows. BuildKart currently exposes the data but not the full operating
surface.

Approximate core-workflow parity: **50–55%**.
BuildKart is strongest where Shopify is generic (marketplace seller scoping and guardrails).
Shopify is strongest where BuildKart is still thin (guided actions, reconciliation, returns,
tracking, collaboration and scale).

## Scorecard

Scores are a judgement from the evidence above, 1–5.

| Dimension | Weight | BuildKart | Shopify | Main gap |
|---|---:|---:|---:|---|
| Order overview and hierarchy | 15% | 3.5 | 5.0 | No order-level action bar; native “Unfulfilled” conflicts with delivered |
| Payment and refund | 20% | 2.5 | 5.0 | No guided refund; missing order/payment link broke native refund; summary not reconciled |
| Delivery and fulfillment | 15% | 3.0 | 5.0 | Manual statuses only; no carrier, label, tracking or native fulfillment |
| Returns and exchanges | 15% | 2.0 | 5.0 | No return label, fees, inspection, exchange or hard refund link |
| Timeline and communication | 10% | 3.0 | 5.0 | Activity exists; no comments, notes, tags, mentions or email resend |
| Data integrity and reconciliation | 10% | 2.0 | 5.0 | Payment/refund records correct, but native order summary is inconsistent |
| Permissions and safety | 10% | 4.5 | 4.5 | BuildKart is strong here; different model, not a gap |
| Scale and operations | 5% | 2.5 | 5.0 | No verified saved views, bulk order actions or mobile admin |
| **Weighted** | **100%** | **2.9 / 5** | **5.0 / 5** | |

The score is not a target. BuildKart should not clone Shopify; it should reach roughly 70–75% on
core order operations while keeping marketplace isolation and explicit money/stock effects.

## Side-by-side

### Order header and status model

Shopify:

- Order, payment, fulfillment and return statuses are presented as four distinct families.
- Statuses drive the order views and the next task.
- Primary actions are on the order page.

BuildKart:

- Payment, delivery and return are visible, but there is no single status strip.
- The native “Unfulfilled Items” card still says “Awaiting fulfillment” while the BuildKart
  Delivery card says “Delivered”.
- The page has no visible order-level action bar. DOM inspection found no text-labelled actions
  except “Show 1 more activity”; payment actions are icon-only/hidden.
- The native summary can show contradictory totals after refund.

Verdict: Shopify is clearer about “what is the state?” and “what do I do next?”.

### Payment and refund

Shopify:

- Payment states include Pending, Authorized, Due, Expiring, Expired, Paid, Partially refunded,
  Refunded, Partially paid, Voided and Unpaid.
- Refund workflow supports line quantities, discounts, shipping refunds, reason, restock,
  notification email, original payment vs store credit, and permissions.
- Refunds update the financial summary and timeline.

BuildKart:

- Native capture and refund work, and the page shows captured, partially refunded and refund rows.
- There is no guided refund dialog on the order page; the operation is API/native-action driven.
- The first refund attempt failed because the order/payment collection link was missing.
- Order `#113` shows Paid Total ₹25,200, Credit Lines ₹15,300 and Outstanding ₹40,500 after capture
  and refund; the summary is not trustworthy.
- No store credit, over-refund, multi-method split or refund notification controls were verified.

Verdict: record-keeping is partially there; the operating workflow and reconciliation are not.

### Delivery and fulfillment

Shopify:

- Unfulfilled, In progress, On hold, Scheduled, Partially fulfilled, Fulfilled and
  Fulfillment not required.
- Per-fulfillment quantities, tracking number, carrier, shipping labels, split/merge, cancel
  fulfillment, mark as delivered, carrier delivery status and proof-of-delivery photos.
- Customer shipping notifications.

BuildKart:

- Manual delivery states: Booked, Dispatched, In Transit, Out For Delivery, Delivered.
- Delivery is seller-scoped and independent of native Medusa fulfilment.
- Delivered evidence and delivered quantities are enforced.
- No carrier integration, label, tracking number, split/merge or proof-of-delivery photo.
- Terminal shipments correctly hide the update control.

Verdict: BuildKart’s model is safer for marketplace allocation, but it is not a fulfillment
workbench yet.

### Returns and exchanges

Shopify:

- Return requested, Return in progress, Returned, Inspection complete.
- Create return with item quantities, reason, restocking fee, return shipping fee, return label or
  uploaded label, tracking/carrier, exchange items, and customer communication.
- Process return, restock, refund now or later, exchange, close/cancel/open return.
- Refund and return are linked; a refund without a return does not record a return reason.

BuildKart:

- Three seller-facing labels: Schedule Return, Waiting For Pickup, Return Completed.
- Partial return works (1 of 2 units), with delivered/requested/approved quantities.
- Return events are money-free and stock-free by design.
- No return label, tracking/carrier, fees, inspection, exchange, restock or return-linked refund UI.
- The refund is a separate native action; the return card does not show the refunded amount.

Verdict: safe and simple, but materially behind Shopify for return operations.

### Timeline, notes and customer communication

Shopify:

- Timeline records payments, fulfillments, refunds, returns, emails and staff actions.
- Internal comments, @mentions, attachments, links, order notes and tags.
- Contact customer and resend order emails.

BuildKart:

- Activity timeline shows payment, refund, shipment and return events.
- No comments, notes, tags, attachments, mentions, customer email actions or notification log.
- “System references” exposes metadata/JSON sections.

Verdict: audit is useful; collaboration and customer support are missing.

### Data integrity and safety

BuildKart strengths:

- Seller scoping prevents cross-seller actions.
- Version checks and idempotency keys protect manual transitions.
- Append-only events and privileged audit.
- Returns do not automatically create refunds, payment mutations or stock movements.
- Delivered quantity and proof evidence are enforced.

BuildKart weaknesses:

- Checkout-created orders were missing `order_payment_collection` links, so native refunds failed.
- Native order summaries were not reconciled after capture/refund.
- Delivery and native fulfillment can disagree visibly.

Verdict: BuildKart’s safety model is good; its financial reconciliation is not yet production-grade.

## What Shopify does better

1. Clear “next action” model.
2. Guided refund and return workflows with previews and guardrails.
3. Native fulfillment with tracking, labels and carrier status.
4. Return-to-refund linkage and restock decisions.
5. Timeline collaboration and customer communication.
6. Tags, notes, saved views, bulk actions and mobile admin.
7. Financial summary consistency.

## What BuildKart does better, or should keep

1. Seller-scoped delivery and return operations for a marketplace.
2. Explicit separation of payment, delivery and return states.
3. No hidden money or stock effects from a return.
4. Versioned, idempotent manual transitions with audit.
5. Delivered-quantity and proof-of-delivery enforcement.
6. Simpler return vocabulary for sellers.

These should not be traded away for Shopify parity.

## Deliberate non-parity

Do not copy these Shopify behaviors as-is:

- Automatic refund/restock when a return is processed. Keep explicit, permissioned actions.
- Single-store assumptions. BuildKart must preserve seller isolation and order groups.
- Store credit, over-refund and exchange complexity in the first pass.
- Shipping-label purchasing and carrier accounts before a governed carrier integration.
- Shopify Flow/app ecosystem before the core order workflow is correct.

## Priority recommendations

### P0 — correctness before polish

1. Fix `order_payment_collection` creation in the checkout/order-group path.
2. Add a regression test: checkout → capture → partial refund → assert order transactions and summary.
3. Reconcile native Paid, Refunded, Credit Lines and Outstanding totals after capture/refund.
4. Put payment, delivery and return into one consistent status strip with a clear next action.
5. Add an order-level action bar: Capture payment, Refund, Create return, Add note, More.
6. Link the return to the refund: show refunded amount/status on the return card and block double refund.
7. Explain or resolve the native “Unfulfilled” vs BuildKart “Delivered” conflict.

### P1 — operational parity

8. Guided refund dialog: line quantity, shipping, reason, restock toggle, notification, preview.
9. Guided return dialog: label/tracking, pickup, inspection, fees, close.
10. Timeline comments, notes, tags, attachments and customer notification actions.
11. Tracking number, carrier, proof of delivery and carrier-driven status.
12. Saved views, filters and bulk order actions.

### P2 — scale

13. Exchanges, store credit and partial payment methods.
14. Order editing and address changes.
15. Mobile admin experience.
16. Reporting/automation and app extensions.

## Target order page shape

- Header: order number, seller, payment/delivery/return status chips, primary actions.
- Main: items and totals; payment/refund; delivery; returns; each with a single next action.
- Sidebar: customer, addresses, notes/tags, support actions.
- Bottom: unified activity timeline.
- Guardrails: seller scope, version checks, idempotency, explicit confirmation, no silent money/stock
  effects.

## Sources

- Shopify — Viewing and managing order details:
  https://help.shopify.com/en/manual/fulfillment/managing-orders/managing-order-details
- Shopify — Understanding order statuses:
  https://help.shopify.com/en/manual/fulfillment/managing-orders/order-status
- Shopify — Refunding orders:
  https://help.shopify.com/en/manual/fulfillment/managing-orders/refunding-orders
- Shopify — Creating returns and exchanges:
  https://help.shopify.com/en/manual/fulfillment/managing-orders/returns/creating-returns
- Shopify — Processing returns:
  https://help.shopify.com/en/manual/fulfillment/managing-orders/returns/processing-returns
- Shopify — Fulfilling orders individually:
  https://help.shopify.com/en/manual/fulfillment/fulfilling-orders/single-fulfillment
- Shopify — Editing orders:
  https://help.shopify.com/en/manual/fulfillment/managing-orders/editing-orders
- BuildKart — Order #113 QC:
  `docs/implementation/session-note-2026-10-23-order-113-qc.md`
