# Configurable Business Logic & Rules Framework

**Status:** Proposed — extends `BuildKart-Backend-Managed-Elements-Mapping.md` §15 into an implementable,
project-agnostic framework. Requires human review before implementation.
**Applies to:** B2C + B2B, across Flutter and web, with a shared canonical backend.

## 1. Objective

Avoid individually hardcoding product selection, badges, pricing decisions, seller ranking, offer
eligibility, credit checks or purchasing behaviour into individual screens.

**Invariant:** the frontend renders results and collects inputs; every authoritative business decision
comes from the correct owning service. The same buyer and purchasing context must produce the same
result on Flutter and web.

## 2. Four rule categories

| Category | What it controls | Examples |
|---|---|---|
| **Collection / Selection** | Which products/content appear | Recently Viewed, Best Sellers, Buy Again, New Arrivals, Related |
| **Commercial** | Prices, eligibility, financial calculations | Dealer tiers, promotions, MOQ, quantity tiers, credit |
| **Journey / Workflow** | What users can do and what happens next | RFQ, approval, returns, checkout, cancellation |
| **Experience / Operational** | Display, targeting, event-triggered behaviour | Home composition, notifications, badges, fallbacks |

## 3. Central Rule Registry with distributed execution

Do **not** build one enormous engine that owns every decision. Establish a governed **Rule Registry**
that *references* owners; each owning service executes its own rules.

```text
            ADMIN / BUSINESS CONFIGURATION
                         │
                         ▼
                  RULE REGISTRY
              (governed definitions)
                         │
          ┌──────────────┼───────────────┐
          ▼              ▼               ▼
      Collection     Commercial        Workflow
        Rules          Rules             Rules
          │              │                │
          ▼              ▼                ▼
    CMS / Search /  Medusa / Mercur /  Commerce /
    Analytics       Tryton / Tax        Marketplace
          │              │                │
          └──────────────┼────────────────┘
                         ▼
                   COMPOSED APIs
                         │
            ┌────────────┴────────────┐
            ▼                         ▼
        Flutter App               Web Store
```

Example: the registry records that `best_sellers` uses *net sales over 30 days*, but **Analytics**
computes the ranking. **Commerce/Mercur** calculates dealer pricing — a generic rules engine never does.

The registry is an index, never a second authority. It must not compute prices, eligibility, stock or
tax.

## 4. Standard rule contract

Every configurable rule must carry (extends §15.12):

| Field | Purpose |
|---|---|
| `rule_key` | Stable identifier |
| `rule_type` | collection \| commercial \| journey \| operational |
| `owner` | Authoritative domain/service |
| `trigger` | Event, API request, scheduled run, or user action |
| `conditions` | Eligibility and filtering |
| `parameters` | Configurable values |
| `scope` | Channel, region, account, SKU, category, warehouse, postcode |
| `priority` | Deterministic rule precedence |
| `effective_from` / `effective_to` | Scheduling |
| `fallback` | Safe behaviour on missing data/failure |
| `version` / `status` | Draft \| approved \| published \| retired |
| `audit` | Actor, timestamp, reason, approval reference |

**Precedence (from §15.12):** exact account/SKU → seller/SKU → category/account segment →
channel/region → global default. A more specific rule must not override legal, security or inventory
constraints.

## 5. Rule inventory

Owner notation: **M** = Medusa, **MC** = Mercur, **T** = Tryton, **C** = Commerce, **CMS**, **AN** =
Analytics, **LOG** = Logistics, **PAY** = Payment, **ID** = Identity, **REC** = Recommendation, **PR** =
Procurement, **AUT** = Automation/notifications.

### A. Home, discovery and merchandising

| Feature / Logic | Selection method | Owner |
|---|---|---|
| Recently Viewed | Last unique products; revisit moves SKU to front | Flutter history → optional backend sync |
| Best Sellers | Rank eligible SKUs by net completed sales in period | AN → Collection Resolver |
| Flash Deals | Active qualifying promotions + campaign timing | CMS + Medusa |
| Recommended for You | Browsing/category/purchase signals | REC |
| Buy Again | Past-order SKUs; revalidate seller/price/stock | Commerce |
| New Arrivals | Published within configurable window | Commerce |
| Trending | Recent views/searches/purchases, min thresholds | AN |
| Frequently Bought Together | Co-purchase signals | REC |
| Related Products | Category/attributes/usage/associations | Search + Commerce |
| Seasonal Collections | CMS rules, dates, curated membership | CMS + Commerce |
| Category Chips | Filter collection by category | Search + Commerce |
| Banner Personalization | Channel/region/locale/audience | CMS |
| Swimlane Ordering | Manual/dynamic/hybrid | CMS + Collection Resolver |
| Empty Collection Fallback | Approved alternative or suppress | Collection Resolver |

**Rule:** a CMS admin configures title/layout/selection rule but never maintains dynamic data
(history, stock, transaction rankings).

### B. Product, pricing and purchase controls

| Feature / Logic | Automatic behaviour / rule | Owner |
|---|---|---|
| Default seller selection | Landed-price comparison | MC |
| Best Price badge | Winning eligible offer | MC |
| Discount badge | Current price vs MRP | Commerce |
| Stock badge | In/Low/Out from availability projection | T → Commerce |
| Quantity-price tiers | Unit price at threshold | MC / Commerce |
| MOQ / pack multiple | Validate against product/account rules | Commerce |
| Product visibility | Publication, region, channel, account | Medusa |
| Delivery availability | Postcode/site, seller, logistics coverage | LOG + Commerce |
| Shipping charge | Shipment groups, weight, carrier, policy | LOG + Commerce |
| Promotions / Coupons | Eligibility, combinability, priority, caps, expiry | Medusa |
| Cart quantity merge | Compatible product/seller/offer/fulfilment identity | Medusa |
| Cart revalidation | Recheck price/stock/eligibility/MOQ | Commerce orchestration |
| Payment-method eligibility | Order/account/location/risk | Commerce + PAY |
| Checkout total | Price, discount, tax, delivery, payable | Commerce + Tax |

### C. B2B purchasing and procurement

| Feature / Logic | Rule | Owner |
|---|---|---|
| Procurement List suggestions | Templates by segment/project/category | CMS / Merchandising |
| List multi-selection | Combine + dedupe by stable SKU | PR |
| Quick Order quantity | Saved default once, then preserve edits | Session |
| List default quantity | Reusable SKU quantities, independent of Cart | PR |
| Buy Again | Frequency/recency; revalidate before purchase | Commerce |
| RFQ icon eligibility | Account/SKU/quantity/business conditions | Commerce + MC |
| RFQ basket | Compatible SKU lines in shared draft | B2B Commerce |
| RFQ target price | Buyer-proposed; never treated as agreed | B2B Commerce |
| RFQ seller routing | Eligible sellers for SKUs + destination | MC |
| Quotation comparison | Price, tax, freight, lead time, validity | MC + Commerce |
| Quote expiration | Block acceptance after expiry; offer refresh | MC |
| Quote-to-Order | Revalidate terms/availability/credit/approvals | Commerce |
| Credit eligibility | Credit, exposure, overdue, policy | Commerce Credit |
| Purchase approval | Role/value/category/project/budget | Commerce Workflow |
| Project/site selection | Address, budget, permissions, purchases | Business Account |
| PO validation | Account requiredness, duplicate-number check | Commerce |

**Operate Lists vs Manage Lists:** same persisted list service, different commands — Operate reads
templates + temporary quantities; Manage performs authorised template mutations.

### D. Account, orders, lifecycle and automation

| Feature / Logic | Trigger / behaviour | Owner |
|---|---|---|
| OTP issuance / resend | Enforce expiry, resend delay, attempt limits | ID |
| B2B mode entitlement | Verified membership | ID + Commerce |
| Address selection | Defaults + delivery serviceability | Commerce + LOG |
| Wishlist | Product refs, independent of price | Commerce |
| Order confirmation | Success only after canonical order | Medusa |
| Order status | Canonical order + payment + shipment projections | Commerce |
| Shipment notifications | Carrier/fulfilment status changes | LOG + AUT |
| Order cancellation | Fulfilment milestone, allocation, permissions | Commerce |
| Return eligibility | Line/quantity/category/seller/window | Commerce |
| Refund initiation | After approved cancellation/return | Commerce + PAY |
| Refund tracking | Provider outcome + reconciliation | PAY → Commerce |
| Abandoned Cart | Inactivity; consent/policy-gated | AN + AUT |
| Back-in-stock alerts | Sellable availability returns | Inventory + AUT |
| Support escalation | Category/priority/SLA/ticket | Chatwoot + AUT |
| Invoice generation | Immutable from authoritative transaction | T |
| Notifications feed | Domain events + dedupe + expiry | Notification service |

**Note:** Abandoned-cart and back-in-stock are *additional recommendations*, not confirmed Phase-1;
they require explicit approval before activation.

## 6. Work packages

1. **Rule inventory & ownership** — turn §15 into a machine-readable registry; classify each rule as
   provider-supported / hardcoded-in-flutter / fixture-backed / new-capability / pending-approval.
2. **Dynamic Collection Resolver** — shared `collection` contract with per-collection resolvers
   (recently_viewed, best_sellers, flash_deals, buy_again, new_arrivals, related, frequently_bought,
   manual, personalized); each resolver has its own algorithm.
3. **Commercial & eligibility rules** — governed responses for eligible products, offers/default seller,
   quantity tiers, MOQ, prices/discounts, availability, action eligibility, cart revalidation.
   Executes in Medusa/Mercur/Tryton — never CMS or frontend.
4. **Event-triggered workflows** — canonical events (`product.viewed`, `cart.updated`,
   `order.confirmed`, `shipment.status_changed`, `rfq.submitted`, `quotation.received`,
   `quotation.accepted`, `return.approved`). Consequential events use durable integration; analytics
   signals use a lighter consent-aware path.
5. **Cross-surface rule verification** — one rule → equivalent outcome on Flutter and web; enforced as
   contract tests against the shared Experience API.

## 7. Implementation priority

1. Rule Registry & contracts (ownership + configuration foundation).
2. Dynamic Collections (Recently Viewed, manual, Best Sellers, Buy Again).
3. Product & commercial rules (eligibility, seller selection, discounts, stock, tiers).
4. B2B procurement rules (Operate Lists, saved quantities, RFQ eligibility, quote lifecycle).
5. Lifecycle automations (order, return, shipment, support, notifications).
6. Admin configuration & QA (preview, permissions, publish, rollback, app/web parity).

Production blockers (durable reconciliation, outbox/inbox, evidence closure) remain mandatory in
parallel; this framework does not defer them.

## 8. Cross-surface parity tests

| Scenario | Expected outcome |
|---|---|
| Same SKU/qty/account on Flutter + Web | Same authoritative dealer-price |
| SKU viewed twice | One Recently Viewed entry, moved to front |
| Product unpublished | Removed from eligible dynamic collections |
| Quantity crosses tier | Updated applicable unit price |
| Duplicate SKU across two lists | One display entry under dedupe rules |
| RFQ on Flutter, opened on web | Same persisted RFQ + status |
| Stock unavailable | Purchase blocked or revalidated |

## 9. Relationship to existing governance

- Inherits `BuildKart-Backend-Managed-Elements-Mapping.md` §15 ownership and §15.13 assumptions.
- Does not change canonical ownership (CHG-017 D-017-01, Data Contract).
- Provider-dependent rules remain `pending-approval` until provider selection (same discipline as
  E-017-003 Razorpay).
- This document is **proposed**; it becomes authoritative only through governed approval.
