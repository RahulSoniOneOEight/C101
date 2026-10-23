# BuildKart order page — UI blueprint

Date: 2026-10-23
Status: proposed target UI, based on the Shopify benchmark.
Not implemented. This is a layout and interaction blueprint, not a commitment to add new statuses.

## Desktop line diagram

```text
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ Mercur Marketplace / Admin                    Search…                         Bell   Admin  │
├──────────────────┬───────────────────────────────────────────────────────────────────────────┤
│ Orders           │ Orders / #113                                          [Capture payment]  │
│ Products         │ rsoni001@gmail.com · BuildMaster Supplies              [Refund]           │
│ Inventory        │ 23 Oct 2026, 19:25                                     [Create return]    │
│ Customers        │                                                        [More actions ▾]  │
│ …                ├───────────────────────────────────────────────────────────────────────────┤
│                  │ PAYMENT  Captured ₹40,500   REFUNDED  ₹15,300   DELIVERY  Delivered 2/2  │
│                  │ RETURN   Return Completed 1/2                                             │
│                  │ Seller scope: BuildMaster Supplies                                        │
│                  ├──────────────────────────────────────────────────┬────────────────────────┤
│                  │ Summary                                          │ Customer               │
│                  │ ┌──────────────────────────────────────────────┐ │ rsoni001@gmail.com     │
│                  │ │ VoltEdge Modular Switch 1-Way                │ │                        │
│                  │ │ 2 × ₹15,300                         ₹30,600  │ │ Contact                │
│                  │ │ Shipping                             ₹9,900  │ │ Shipping address       │
│                  │ │ Tax                                      ₹0  │ │ 12 Industrial Estate   │
│                  │ │ Commission                             ₹918  │ │ Bengaluru 560001       │
│                  │ │ Order total                         ₹40,500  │ │                        │
│                  │ │ Refunded                           -₹15,300  │ │ Billing address        │
│                  │ │ Net paid                            ₹25,200  │ │ —                      │
│                  │ └──────────────────────────────────────────────┘ │                        │
│                  │                                                  │ Notes / tags           │
│                  │ Payment & refund                                 │ (future)               │
│                  │ ┌──────────────────────────────────────────────┐ │                        │
│                  │ │ Captured ₹40,500             [Refund]        │ │                        │
│                  │ │ Refund ₹15,300 · 23 Oct      [View payment]  │ │                        │
│                  │ │ Linked return: Return Completed              │ │                        │
│                  │ └──────────────────────────────────────────────┘ │                        │
│                  │                                                  │                        │
│                  │ Delivery                                         │                        │
│                  │ ┌──────────────────────────────────────────────┐ │                        │
│                  │ │ Delivered · v5 · 2 of 2 units       [View]  │ │                        │
│                  │ │ Seller: BuildMaster Supplies                 │ │                        │
│                  │ │ No update control — terminal state           │ │                        │
│                  │ └──────────────────────────────────────────────┘ │                        │
│                  │                                                  │                        │
│                  │ Returns                                          │                        │
│                  │ ┌──────────────────────────────────────────────┐ │                        │
│                  │ │ Return Completed · v4 · 1 of 2 units [View]  │ │                        │
│                  │ │ Reason: Damaged                              │ │                        │
│                  │ │ Refund: ₹15,300 · linked                     │ │                        │
│                  │ │ No update control — terminal state           │ │                        │
│                  │ └──────────────────────────────────────────────┘ │                        │
│                  ├──────────────────────────────────────────────────┴────────────────────────┤
│                  │ Activity                                                               │
│                  │ ● Payment captured ₹40,500                                             │
│                  │ ● Payment refunded ₹15,300                                             │
│                  │ ● Delivered · Out For Delivery · In Transit · Dispatched · Booked      │
│                  │ ● Return requested · Return decision · Return completed                 │
│                  └───────────────────────────────────────────────────────────────────────────┘
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

## What this fixes

1. The four key states are visible together: payment, refund, delivery and return.
2. The primary actions are on the order, not hidden inside native cards.
3. A terminal delivery or return has no update control.
4. The refund is visibly linked to the return.
5. The totals show the refunded amount and net paid without a contradictory outstanding total.
6. Seller scope is explicit.
7. Native fulfilment does not compete with the BuildKart delivery status. If it differs, show a
   muted secondary line, not a second primary badge.

## Conditional action rules

| Condition | Header action | Card action |
|---|---|---|
| Payment authorized | `Capture payment` | — |
| Payment captured or partially refunded | `Refund` | Payment card `Refund` |
| Order eligible for return | `Create return` | Returns card `Create return` |
| Delivery is not terminal | — | `Update delivery` |
| Delivery is delivered | — | None |
| Return is not terminal | — | `Update return` |
| Return is completed | — | None |
| Always | `More actions ▾` | Notes/tags/support actions later |

`More actions` should hold only secondary actions: add note, add tag, resend email, view order
status page. It must not duplicate primary payment, delivery or return actions.

## Status vocabulary

Keep the existing vocabulary. Do not add statuses in this UI pass.

| Area | Allowed values |
|---|---|
| Payment | Native Medusa status only: authorized, captured, partially refunded, refunded, etc. |
| Delivery | Booked, Dispatched, In Transit, Out For Delivery, Delivered |
| Return | Schedule Return, Waiting For Pickup, Return Completed |

## Refund dialog pattern

```text
┌ Refund order #113 ───────────────────────────────────────────┐
│ Items to refund                                             │
│ [x] VoltEdge Modular Switch 1-Way   1 of 2       ₹15,300   │
│                                                             │
│ Shipping refund                     [ ]           ₹0       │
│ Reason                              [Damaged ▾]             │
│ Refund to                           [Original payment ▾]    │
│ Notify customer                     [x]                     │
│                                                             │
│ ─────────────────────────────────────────────────────────── │
│ Refund total                                       ₹15,300  │
│                                      [Cancel] [Review refund] │
└─────────────────────────────────────────────────────────────┘
```

Rules:

- Refund is a native Medusa action.
- Do not add manual payment/refund status options.
- Do not auto-restock from the refund or return.
- Show the linked return and refunded amount before confirmation.
- Block refunds above the captured amount.

## Empty states

| State | Display |
|---|---|
| No payment captured | Payment card: `Authorized` or `Pending`; show `Capture payment` only if applicable |
| No refund | Payment card: `No refund issued`; show `Refund` only if captured |
| No delivery yet | Delivery card: `Booked` or `Not dispatched`; show update control |
| Delivery delivered | Delivery card: `Delivered · n of n units`; no update control |
| No return | Returns card: `No return requested`; show `Create return` only if eligible |
| Return completed | Returns card: `Return Completed · n of n units`; no update control |

## Mobile stack order

1. Header and status strip
2. Primary action buttons; secondary actions under `More`
3. Summary and totals
4. Payment and refund
5. Delivery
6. Returns
7. Customer and addresses
8. Activity timeline

## Do not add

- Operational status tiles
- Staging banner
- Technical details
- A fifth delivery/return status family
- Manual payment status controls
- Automatic refund or stock movement from a return
- Terminal delivery/return update controls

## Open design decisions

1. Should native Medusa fulfilment be shown as a muted secondary line, or hidden when BuildKart
   delivery is authoritative?
2. Should `Create return` live in the header, the Returns card, or both?
3. Do notes/tags belong in the right sidebar or below the timeline?
4. Should the linked refund be read-only on the return card, or open the native refund detail?
