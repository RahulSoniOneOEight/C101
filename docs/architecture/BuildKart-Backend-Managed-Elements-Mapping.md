# BuildKart — Backend-Managed Elements & Module Mapping

**Client:** client101 · **App:** BuildKart prototype (Flutter) · **Date:** 2026-10-04
**Sources of truth:** `client-projects/client101/contracts/data-contract.yaml` (DC-client101-001),
`client-projects/client101/solution/solution-contract.yaml`, current Flutter surfaces
(`apps/prototype_app/lib/router/app_router.dart` + screens/providers).

> This is a **planning/ownership map** of every content/data element in the current app that
> should be *managed from the backend*, with the canonical owning module and provider.
> Column **“Owner (provider)”** = the governed canonical owner from the data contract.
> Column **“Today”** = what the prototype currently does (fixture / local / live).

---

## 1. Ownership legend (from the governed solution + data contract)

| Module | Provider | Owns (canonical) |
|---|---|---|
| Commerce | **Medusa** | products/variants, prices, cart, checkout, orders, customers/business accounts, promotions |
| Marketplace | **Mercur** | sellers, seller offers, marketplace order allocation, commission, settlement, payout reconciliation |
| ERP | **Tryton** | inventory/availability, warehouse & fulfilment movements, purchasing, accounting projections |
| Search | **Meilisearch** | *derived* search index (products, synonyms, ranking) — not canonical |
| CMS | **TBD — Strapi** (ADAPT candidate, pending approval) | editorial content, banners, home modules, campaign/landing content, localization, app copy |
| DAM | **TBD** | media assets (images/video/docs), renditions, alt text |
| Customer support | **Chatwoot** | tickets, conversations, chat |
| Automation | **Activepieces** | cross-system workflows (webhooks, sync, notifications) |
| Payments | payment-integration provider | payment methods, payment status (projection → commerce) |
| Logistics | logistics-integration provider | shipment/fulfilment status, tracking (projection → commerce) |
| Analytics | analytics provider | behavioural + order events (consumer only) |
| Data | **PostgreSQL** | physical store for the above |

**Boundary rule:** a single field has **one** canonical writer. Other systems consume
projections/read models. Storefronts read a **composed read model**, never join systems directly.

---

## 2. App shell, home & merchandising (D2C)

| Element | Where (current app) | Owner (provider) | Access | Today |
|---|---|---|---|---|
| Brand/greeting header | `HomeHeader` | CMS | read | hardcoded |
| Delivery location (pincode/address) | `HomeHeader` | Commerce (Medusa) customer + address; geocoding external | read | device-local / fixture |
| Home search entry | `HomeHeader` | Search (Meilisearch) | read | Medusa `/store/products` |
| Trust strip (“GST invoices / Verified sellers / Easy returns”) | `HomeHeader` | CMS | read | hardcoded |
| Hero banner (“Monsoon Ready”, image, subtitle, CTA, link) | `HomeHeader` | **CMS** | read | hardcoded |
| Category rail (labels + icons) | `categoriesProvider` | CMS (labels) + DAM (icons) | read | hardcoded list |
| Home scroll-feed modules | `homeModulesProvider` | **CMS** (module composition/order) | read | derived from catalogue |
| · “Flash Deals” carousel + tag | home modules | CMS (title/tag) + Commerce/Mercur (members) | read | fixture |
| · “Best Sellers” carousel + tag | home modules | CMS (title/tag) + Analytics/Merchandising ranking | read | fixture |
| · Secondary banner (“Clearance Sale”) | home modules | **CMS** + DAM | read | hardcoded |
| · “Recommended for You” composition | home modules | CMS (layout) + personalization (Analytics) | read | fixture |
| · “Recently viewed” split slot | home modules | Client-local (device) | local | device-local |
| Promotion badges / % off | product cards | Commerce (Medusa) promotions/prices | read | from product price/MRP |
| Notification bell + unread count | `notification_bell.dart` | CMS/CRM (content) + Notification service | read | device-local fixtures |

---

## 3. Browse, catalogue & search (D2C)

| Element | Where | Owner (provider) | Access | Today |
|---|---|---|---|---|
| Product grid / swimlanes | Home, Browse | Commerce (Medusa catalogue) | read | Medusa + demo fallback |
| Sort options (relevance/price/rating) | `BrowseScreen` | Search (Meilisearch) | read | client-side |
| Filter facets (brand, price, key items) | `BrowseScreen` | Search (Meilisearch) + Commerce | read | client-side |
| Category taxonomy / naming | category rail, browse | CMS + Commerce category tree | read | hardcoded |
| Empty / error / out-of-stock states copy | various | CMS (copy) | read | hardcoded |

---

## 4. Product detail (D2C)

| Element | Where | Owner (provider) | Access | Today |
|---|---|---|---|---|
| Product title, brand, description | PDP | Commerce (Medusa) | read | Medusa/demo |
| Images / media gallery | PDP hero | DAM (assets) + Commerce (association) | read | URL on product |
| Price, MRP, discount | PDP `_priceRow` | Commerce (Medusa) | read | product fields |
| **Seller offers (multiple sellers, best price default)** | PDP “Sold by” | **Mercur** (seller, seller-offer) | read | **dev fixture** (`productSellersProvider`) |
| Seller rating / delivery note | PDP seller rows | Mercur + Logistics projection | read | fixture |
| Price comparison (Flipkart/Amazon/market) | PDP `_benchmark` | CMS/Competitive intel (external) | read | fixture |
| Product specifications | PDP `_specs` | Commerce attributes + CMS (copy) | read | hardcoded |
| Related products | PDP | Search/Commerce (recommendations) | read | catalogue slice |
| Add to Cart / Buy Now | PDP | Commerce (Medusa cart) | **write** | Medusa (local fallback) |

---

## 5. Cart, checkout, orders (D2C)

| Element | Where | Owner (provider) | Access | Today |
|---|---|---|---|---|
| Cart lines, quantities, totals | `/cart`, `cartProvider` | Commerce (Medusa) | write | Medusa (local fallback) |
| Checkout fields (delivery, PO, payment, GST) | `/checkout` | Commerce + Payments + Tryton (tax) | write | fixture |
| Place order | checkout → confirm | Commerce (Medusa order) | **write** | fixture/local |
| Order list & detail | `/orders`, `/orders/:id` | Commerce (Medusa) | read | device-local |
| Order status timeline / cancel eligibility | order detail | Commerce + Logistics projection | read | fixture |
| “You may also like” (cart merchandising) | cart | CMS (composition) + Commerce | read | catalogue slice |
| Order confirmation copy | `/order-confirmed` | CMS (copy) | read | hardcoded |
| Track package | `/track` | **Logistics** (shipment) → Commerce projection | read | fixture |

---

## 6. B2B Home / trade dashboard

| Element | Where | Owner (provider) | Access | Today |
|---|---|---|---|---|
| Business identity, GST/discount badges, credit meter | B2B account summary | **Commerce (business-account and B2B credit)**; ERP consumes the customer-account projection | read | fixture |
| Category rail (trade) | B2B home | CMS labels + Commerce tree | read | fixture |
| “Quick order” unit (presets/lists) | B2B home | Commerce/Procurement (buyer lists) | read | local/provider |
| “Buy Again” (repeat orders) | B2B home | Commerce (order history) | read | fixture |
| “Trade Offers & Deals” collections | B2B home, `/b2b/offers` | **Mercur** (offers) + Commerce promotions | read | fixture (`trade_offers_providers`) |
| Trade schemes (Free goods / cash offer / credit) | dashboard | **Mercur** (scheme/offer) | read | fixture |
| Trade picks / price advantage | dashboard, `/b2b/price-advantage` | Analytics/Merchandising + Mercur pricing | read | fixture |
| Product grid (B2B) tiles: image, brand, MOQ, tiers, dealer price, MRP, stock, savings | home/catalogue/offers | Commerce (product/price) + Mercur (dealer price/offer) + Tryton (stock) | read | catalogue + fixtures |

---

## 7. B2B catalogue, PDP, offers

| Element | Where | Owner (provider) | Access | Today |
|---|---|---|---|---|
| Trade catalogue paging / categories | `/b2b/catalogue` | Commerce + Search | read | provider |
| Dealer tiers (qty → unit price) | tiles, PDP | **Mercur** (seller-offer tiers) / Commerce price lists | read | fixture |
| Multi-seller “Sold by” on trade PDP | `/b2b/pdp/:id` | **Mercur** | read | fixture |
| Stock label / availability | tiles, PDP | **Tryton** (inventory) → commerce-availability | read | fixture |
| Schemes banner content | offers/schemes | CMS (copy) + Mercur (terms) | read | fixture |

---

## 8. Quick Order & procurement lists (B2B)

| Element | Where | Owner (provider) | Access | Today |
|---|---|---|---|---|
| Buyer procurement lists (Seasonal / Kitchen Works / Floor Essentials + buyer-created) | `/b2b/quick-order`, `/b2b/procurement-lists` | Commerce/Procurement (business-account scoped) | **write** | **device-local** (`LocalStore`) |
| Curated / suggested lists (templates) | Manage Lists | CMS/Merchandising (template) → copied to buyer-owned | read | fixture |
| List SKUs + **saved default quantity** | editor | Commerce/Procurement | **write** | device-local |
| Quick-order **purchase quantity** (temporary) | operate grid | Client-only (session) | local | in-memory |
| Product tiles in grid (image/name/SKU/dealer price) | operate grid | Commerce + Mercur + DAM | read | catalogue/fixture |
| Scan (barcode) | editor | external scanner service/API | write | **not wired (fixture)** |
| Upload list (CSV/Excel/PDF) | editor | Automation (Activepieces) + parser service | **write** | **not wired (fixture)** |

---

## 9. RFQ / quotation journey (B2B)

| Element | Where | Owner (provider) | Access | Today |
|---|---|---|---|---|
| RFQ basket lines (SKU, qty, target price) | `/b2b/rfq` | Commerce (RFQ entity) + Mercur (seller context) | **write** | **device-local** (`b2b_rfq_draft_v1`) |
| RFQ draft (delivery, required-by, remarks) | workspace | Commerce (RFQ draft) | **write** | device-local |
| RFQ submission + reference id/status | submit | Commerce (RFQ lifecycle) | **write** | fixture (no order/payment) |
| Seller quotations (amounts, validity) | `/b2b/quotes-received` | **Mercur** (quote/offer) | read | fixture |
| Quote comparison (per-line) | `/b2b/quote-compare` | Mercur + Commerce | read | fixture |
| Accept quote → order handoff | `/b2b/accept-quote` | Commerce (order) + Mercur (allocation) | **write** | fixture |
| Quotation cart / B2B checkout | `/b2b/quotation-cart`, `/b2b/checkout` | Commerce | write | fixture/local |

---

## 10. Account, profile & support

| Element | Where | Owner (provider) | Access | Today |
|---|---|---|---|---|
| Profile (name, email, mobile, initials) | `/profile`, `/b2b/account` | Commerce (customer / business-account) | **write** | **device-local** |
| Saved addresses, default address | `/addresses` | Commerce (Medusa) | **write** | device-local |
| Wishlist | `/wishlist` | Commerce | **write** | device-local |
| Payment methods / saved cards | `/payments` | **Payments** (tokens) + Commerce | read | device-local (fixtures) |
| GST details / GSTIN | `/gst-invoices` | Commerce (business-account) + Tryton (tax) | **write** | device-local |
| Invoices (PDF) | `/gst-invoices`, downloads | Tryton (accounting) → Commerce projection | read | generated fixture PDF |
| Support tickets / chat | `/help`, `/b2b/chat` | **Chatwoot** | **write** | device-local fixtures |
| Settings (language, notification prefs) | `/settings` | CMS (content) + client prefs | write | device-local |
| Notifications feed | `/notifications` | CMS/CRM + Notification service | read | device-local fixtures |
| Team & roles | `/b2b/team` | Commerce (business-account) | **write** | fixture |
| Approvals (order approval workflow) | `/b2b/approvals` | Commerce (workflow) + Tryton projection | read | fixture |
| Credit overview / limit | `/b2b/credit` | **Commerce (canonical B2B credit)**; Tryton consumes the projection | read | fixture |
| Projects & sites | `/b2b/projects`, `/b2b/site-selector` | Commerce (business-account) | **write** | fixture |
| Material list | `/b2b/material-list` | Procurement (Commerce) | write | fixture |

---

## 11. Media / assets (DAM)

| Element | Owner (provider) | Notes |
|---|---|---|
| Product images, banner images, category icons, scheme art | **DAM (TBD)** | Canonical asset store; Commerce/CMS hold references + alt text |
| Image renditions (thumb/zoom), format, CDN | DAM + CDN | Storefront consumes URLs only |
| Alt text / accessibility metadata | DAM (asset) + CMS (contextual) | Required at publish |

---

## 12. Cross-cutting

| Element | Owner (provider) | Notes |
|---|---|---|
| Tax / GST computation | Tryton (rates) → Commerce (applied at checkout) | Single rate source |
| Promotions / discounts | Commerce (Medusa promotions) + Mercur (seller offers) | Don’t duplicate price logic |
| Currency & locale | Commerce + CMS (localized copy) | |
| Search index | **Meilisearch** (derived) | Reindexed from Commerce via Automation |
| Cross-system sync/idempotency | **Activepieces** + Commerce webhooks | Batched, idempotent, field-level ownership |
| Analytics events | Analytics | Consumer only; not a writer |
| Email/SMS/WhatsApp notifications | Automation + provider | Triggered from order/RFQ events |

---

## 13. Ownership boundaries (must-not-change without contract update)

1. **Mercur** owns sellers, seller offers, allocation, commission, settlement. Commerce holds only a
   `commerce-seller` / `commerce-offer` **projection**.
2. **Tryton** is the single source of truth for **inventory/availability**; commerce stores
   `commerce-availability` projection.
3. **Payment** and **shipment** are owned by their integration providers; commerce stores status projections.
4. **CMS** owns *editorial* content only — never price, stock, seller, payment or order data.
5. **Meilisearch** is derived; never canonical.
6. One field → one canonical writer; composition happens in a **composed read model**, not client-side joins.

---

## 14. Current prototype reality (what is not yet backend-managed)

Device-local / fixture today (needs backend contracts before production):

- Procurement lists + saved default quantities (`LocalStore`).
- RFQ draft / submission / reference.
- Account profile, addresses, wishlist, payment methods, GST data, tickets, settings.
- Orders list/detail, tracking, invoices (fixtures).
- Seller offers on product pages (dev fixture).
- Home banners/modules & trust strip (hardcoded).
- Barcode **Scan** and **Upload List** in the list editor (not wired).

**Open items (from prior sessions):** final master-catalogue, inventory, fulfilment and returns
ownership remain open under **Q-005A**; CMS/DAM provider selection and any Strapi implementation
require human approval.

---

## 15. Configurable business rules and assumptions

> These are **proposed rules**, inferred from the current app and journeys. They are not final
> commercial policy until approved by Product, Marketplace, Finance, Operations and Legal.
> Transactional rules must be configured in their owning system—not in Flutter or the CMS.

### 15.1 Seller-offer eligibility and default seller

| Rule | Proposed default | Configuration owner | Current prototype / decision needed |
|---|---|---|---|
| Seller selection scope | Evaluate offers for the exact SKU/variant, requested quantity, customer type, delivery postcode/site and channel (B2C/B2B) | Mercur | Prototype uses three generated offers and does not evaluate postcode/account eligibility |
| Eligible seller | Seller active + verified; offer active/not expired; product sellable in channel; requested quantity available; address serviceable; seller not suspended | Mercur + Tryton + Logistics | Configure all eligibility flags and failure reasons |
| **Default seller** | Select the seller with the **lowest eligible landed payable price** for the requested quantity | **Mercur** | Prototype defaults to the lowest fixture price |
| Landed-price formula | Item subtotal after seller/tier discounts + seller shipping/handling + non-recoverable taxes/fees − applicable offer discount; expose the breakdown | Mercur + Commerce + Logistics + Tax | Business must confirm whether GST and shipping participate in comparison |
| B2B tier pricing | Recalculate the best seller whenever quantity changes; compare the applicable quantity tier, MOQ and case-pack multiple | Mercur | Not fully wired |
| Tie-break order | 1) can fulfil all quantity, 2) earliest promised delivery, 3) preferred/contract seller, 4) higher seller rating, 5) lower cancellation rate, 6) stable seller ID | Mercur | Requires approved priority and service-quality inputs |
| “Best price” badge | Show only on the current cheapest **eligible** offer; recompute after quantity/address/account changes | Mercur read model | Prototype badge is static fixture logic |
| Manual selection | Customer may select another eligible seller; selection persists for the page/session and is explicit in cart | Commerce + Mercur | PDP selection works; durable offer identity is not modelled |
| Seller/offer cart identity | A line is keyed by `variant_id + seller_id + offer_id`; same SKU from different sellers must not silently merge | Commerce | Current cart line is effectively variant-only; backend contract required |
| Offer snapshot | On Add to Cart, store offer ID, seller ID, quoted unit price, tax context, fulfilment promise and pricing timestamp | Commerce + Mercur projection | Not implemented end-to-end |
| Revalidation | Revalidate price, stock, seller eligibility, MOQ and serviceability at Add to Cart and checkout | Commerce orchestrating owners | Never silently charge a changed price |
| Invalid/changed offer | Keep line blocked and explain the change; offer “accept new price”, “choose another seller” or “remove” | Commerce | Requires UX and API error contract |
| Automatic replacement | **Off by default**; never silently switch sellers after user selection | Commerce | Product approval required before enabling substitution |
| No eligible seller | Disable purchase controls; show reason and alternatives/RFQ where applicable | Commerce composed read model | Configure message through CMS, reason from transactional service |

### 15.2 Product, catalogue and publication rules

| Rule | Proposed default | Owner |
|---|---|---|
| Product visibility | Published, channel-enabled, region/account eligible and has at least one active sellable variant | Medusa |
| SKU identity | SKU/variant ID is stable and globally unique; title/image changes never change identity | Medusa/master catalogue (final owner pending Q-005A) |
| Required product data | Title, SKU, category, unit of measure, tax class, primary image, key specs and fulfilment dimensions required before publish | Medusa + DAM |
| Variant selection | Default to configured primary variant only when unambiguous; otherwise require customer selection | Medusa |
| Product image fallback | Primary DAM image → category placeholder → generic accessible placeholder | DAM + CMS |
| Out-of-stock visibility | Product remains discoverable by default but purchase control is disabled; optionally allow notify-me/backorder by category/channel | Medusa + Tryton |
| Product retirement | Unpublish for new sales but retain historical product snapshot on orders/invoices | Medusa + Tryton |
| B2C/B2B visibility | Channel/account rules may expose different assortment, MOQ, seller offers and prices | Medusa + Mercur |

### 15.3 Price, promotion and tax rules

| Rule | Proposed default | Owner |
|---|---|---|
| Price source | Base/list price and commerce promotions from Medusa; seller-specific offer/tier price from Mercur | Medusa + Mercur |
| MRP validity | MRP must be effective-dated, currency-matched and greater than selling price before showing strike-through/discount | Medusa |
| Discount display | `(MRP − payable item price) / MRP`, rounded to a whole percentage; suppress invalid/zero discounts | Commerce read model |
| Currency precision | INR uses two decimal places for calculations; round only at defined line/order boundaries | Commerce + Tryton |
| Promotion stacking | Non-stackable by default; explicit combinability groups and priority decide winning promotions | Medusa + Mercur |
| Tier price | Apply tier for requested quantity; quantity decrease may remove the tier and must trigger revalidation | Mercur |
| Price expiry | Every dynamic seller quote/offer has `valid_from` and `valid_to`; stale price is rejected at checkout | Mercur + Commerce |
| Tax display | Business must choose tax-inclusive vs tax-exclusive display per B2C/B2B channel; invoice uses Tryton-authoritative tax result | Tryton + Commerce |
| Coupon/credit order | Configure whether coupon, scheme, wallet/credit and tax apply before/after each other | Commerce + Finance approval |

### 15.4 Inventory, delivery and fulfilment rules

| Rule | Proposed default | Owner |
|---|---|---|
| Availability source | Tryton available-to-promise is authoritative; storefront uses a timestamped projection | Tryton |
| Stock displayed | Prefer “In stock / Low stock / Out of stock”; expose exact quantity only when approved | Tryton + CMS copy |
| Low-stock threshold | Configurable by SKU/category/warehouse/channel | Tryton |
| Reservation point | Reserve stock at confirmed order/payment (policy by payment method); cart does not guarantee stock | Commerce + Tryton |
| Reservation expiry | Effective-dated timeout; release automatically on payment failure/expiry | Commerce + Tryton + Automation |
| Backorder | Off by default; enable by SKU/account with promised date and explicit consent | Tryton + Commerce |
| Serviceability | Validate seller/warehouse, postcode/site, weight/size and restricted category before checkout | Logistics + Mercur |
| Split fulfilment | Allowed only when customer sees shipment groups, charges and dates before confirmation | Commerce + Logistics |
| Delivery promise | Computed from cut-off, seller handling, warehouse availability, carrier SLA and holidays | Logistics + Tryton + Mercur |

### 15.5 Search, ranking and merchandising rules

| Rule | Proposed default | Owner |
|---|---|---|
| Search eligibility | Index only published/channel-visible products; stock and price are projections | Meilisearch from Medusa |
| Ranking | Text relevance first, then availability, commercial score/popularity and recency; exact SKU match receives highest boost | Meilisearch |
| Sponsored/paid placement | Must be labelled and kept separate from organic relevance signals | Search + CMS/Legal |
| Synonyms and redirects | Managed centrally and versioned by locale/category | Meilisearch |
| Home module membership | CMS configures module title/layout/audience/schedule and references a saved query or curated IDs; it does not own price/stock | CMS + Search/Commerce |
| “Best Sellers” | Calculated from approved order window; exclude cancellations/returns/fraud | Analytics projection |
| “Recommended for You” | Consent-aware; fallback to popular in-stock products when personalization unavailable | Analytics/Search |
| “Recently viewed” | Device-local by default, bounded list, clearable with privacy controls | Client/privacy policy |

### 15.6 Cart and checkout rules

| Rule | Proposed default | Owner |
|---|---|---|
| Cart merge | Merge only identical variant + seller + offer + fulfilment context | Medusa |
| Quantity validation | Enforce minimum, maximum, MOQ, case pack and available quantity on every change | Commerce + Mercur + Tryton |
| Cart lifetime | Configurable by channel/account; offer snapshots can expire earlier than cart | Medusa |
| Stale cart | Show line-level price/availability changes and require acknowledgement before checkout | Medusa |
| Seller grouping | Group totals, delivery and policies by seller; order may allocate into seller sub-orders | Medusa + Mercur |
| Address | Only verified/serviceable addresses can proceed; default address is customer-controlled | Medusa + Logistics |
| Payment methods | Eligibility depends on customer/account, order value, risk, seller/channel and currency | Payment provider + Commerce |
| Order creation | Idempotent request; no success screen until canonical order reference is returned | Medusa |
| Payment failure | Keep recoverable order/cart state; never report successful order/payment | Payment provider + Medusa |
| Cart price vs PDP | Cart/checkout canonical calculation wins; discrepancies must be shown, not hidden | Medusa |

### 15.7 B2B procurement-list and Quick Order rules

| Rule | Proposed default | Owner |
|---|---|---|
| Quantity separation | `list.defaultQuantity`, `quickOrder.purchaseQuantity` and `cart.quantity` are independent | Commerce/Procurement + client session |
| Duplicate SKU across selected lists | Display once by stable SKU identity; never modify source lists | Commerce/Procurement |
| Initial purchase quantity | Proposed: initialize from saved default once when SKU enters the operating set; later list changes must not overwrite user edits | Client + Product approval |
| Curated template edit | Editing a non-buyer-owned template creates a buyer-owned copy | Commerce/Procurement |
| List ownership | Buyer lists scoped to business account; role permissions determine view/edit/delete/share | Commerce business account/RBAC |
| Unsaved edits | Confirm before leaving editor; server saves use optimistic concurrency/version | Commerce/Procurement |
| Delete | Confirmation required; soft-delete/audit recommended for shared or used lists | Commerce/Procurement |
| Upload | Validate file type/size, malware, schema, SKU resolution and error report; no silent partial import | Parser service + Activepieces + Commerce |
| Barcode scan | Resolve barcode to exactly one active SKU or ask customer to choose; scanner permission is explicit | Scanner service + Commerce |

### 15.8 RFQ and quotation rules

| Rule | Proposed default | Owner |
|---|---|---|
| RFQ eligibility | Configurable by B2B account, category/SKU, quantity/order value and geography | Commerce + Mercur |
| Draft vs cart | RFQ draft is independent of purchase cart; submitting RFQ does not create an order or payment | Commerce |
| Seller routing | Invite only eligible sellers capable of fulfilling SKU, quantity and destination | Mercur |
| Quote validity | Every quote has expiry, currency, taxes, freight, lead time and seller terms | Mercur |
| Quote comparison | Compare landed total and delivery/terms—not headline unit price alone | Mercur composed read model |
| Partial quote | Business must configure whether sellers may quote a subset or alternate SKU | Mercur |
| Revision/negotiation | Version every revision; retain immutable audit trail | Mercur + Commerce |
| Accept quote | Revalidate quote, stock, credit, address and approval; only then create canonical order | Commerce (order/credit/approval) + Mercur + Tryton (stock/tax) |
| Quote expiry | Expired quote cannot be accepted; customer may request refresh | Mercur |

### 15.9 Business account, credit and approval rules

| Rule | Proposed default | Owner |
|---|---|---|
| Account verification | GST/business verification required before trade pricing, credit or invoicing privileges | Commerce + verification provider |
| Credit availability | Commerce business-account credit is authoritative; Tryton/ERP consumes the approved customer-account projection | Commerce |
| Credit checkout | Block when exposure exceeds available credit unless an approved Commerce override exists | Commerce |
| Approval threshold | Configurable by account, role, order/RFQ value, category and cost centre/project | Commerce workflow |
| Role permissions | Least privilege for buyer, requester, approver, finance admin and account admin | Commerce/RBAC |
| Site/project | Selected site may constrain address, assortment, budget, approver and tax treatment | Commerce business account |
| Audit | Record actor, timestamp, before/after values and reason for approvals, credit overrides and role changes; project approved accounting effects to ERP | Commerce; Tryton consumes accounting projection |

### 15.10 Order, cancellation, return and refund rules

| Rule | Proposed default | Owner |
|---|---|---|
| Order status | Commerce status is canonical; shipment/payment states remain separate projections | Medusa |
| Cancellation | Allowed only before configured fulfilment milestone and by authorised role; evaluate each seller allocation | Medusa + Mercur + Logistics |
| Returns | Eligibility window/config varies by category/SKU/seller and item condition | Commerce + Mercur (final ownership pending Q-005A) |
| Refund | Starts only after approved cancellation/return; payment provider result projects to commerce | Payments + Commerce |
| Partial order actions | Support line/quantity-level cancellation, return and refund where provider contracts allow | Commerce |
| Invoice | Immutable after issue; corrections use credit/debit note, not overwrite | Tryton |

### 15.11 CMS, DAM and notification rules

| Rule | Proposed default | Owner |
|---|---|---|
| Content lifecycle | Draft → review → approved → scheduled/published → archived | CMS |
| Audience targeting | Channel, locale, region, customer type and business segment; no transactional eligibility in CMS | CMS |
| Scheduling | Effective dates use a stored timezone; expired campaigns auto-unpublish | CMS |
| CTA links | Route allowlist/deep-link validation; broken target blocks publish | CMS |
| Media publish | Require approved rendition, rights/expiry, alt text and mobile-safe crop | DAM + CMS |
| Content fallback | Locale-specific → default locale → safe application fallback | CMS |
| Transaction notification | Trigger from canonical event; template in CMS/provider; deduplicate by event ID | Owner event + Automation |
| Preferences | Respect channel opt-in/opt-out except legally required transactional messages | Commerce/CRM + notification provider |

### 15.12 Rule configuration governance

Every configurable rule should carry:

- stable `rule_key` and human-readable purpose;
- canonical owning service and accountable business owner;
- scope (global, channel, region, account, seller, category, SKU, warehouse or postcode);
- priority/specificity and deterministic conflict resolution;
- value, unit/currency/timezone, effective start/end and enabled state;
- version, approval state, change reason, author and complete audit history;
- safe fallback when the owning service or projection is unavailable;
- API/schema version and cache invalidation/event semantics;
- test cases, monitoring metric and rollback plan.

**Recommended precedence:** exact account/SKU rule → seller/SKU → category/account segment →
channel/region → global default. A more specific rule must not override legal, security or
inventory constraints.

| Configuration type | Correct home | Do not store in |
|---|---|---|
| Seller eligibility, offer ranking, commissions | Mercur | Flutter, CMS |
| Product/variant visibility, cart/order/promotion policy | Medusa | Flutter, CMS |
| Stock, reservation and tax/accounting controls | Tryton (projected to Commerce where required) | CMS |
| B2B credit limit, availability, holds and overrides | Commerce business-account service (projected to ERP) | CMS, Flutter |
| Search relevance, synonyms, boosts | Meilisearch | Flutter |
| Banner/module layout, copy, schedule, audience | CMS | Medusa price fields |
| Payment eligibility and status | Payment provider + Commerce policy | CMS |
| Serviceability, rates and tracking | Logistics provider | CMS |
| UX feature rollout / kill switch | Dedicated feature-flag/config service (TBD) | CMS editorial entries |

### 15.13 Assumptions requiring explicit business approval

1. Does “cheapest seller” compare **item price only** or full **landed payable price** including
   freight, handling and tax? This document recommends landed payable price.
2. Can a customer intentionally choose a more expensive seller for faster delivery/preference?
   This document assumes **yes**.
3. Are B2C prices tax-inclusive and B2B prices tax-exclusive? Confirm per channel and invoice law.
4. When seller price changes after Add to Cart, may the system auto-update below a tolerance, or
   must every change be acknowledged? This document recommends explicit acknowledgement.
5. Are split-seller orders and split shipments allowed, and how are shipping charges presented?
6. What are the approved seller-rating formula, minimum rating and suspension thresholds?
7. Which promotion types may stack with seller tiers, schemes, coupons and account credit?
8. At what event is inventory reserved, and how long is it held for each payment method?
9. Are backorders/substitutions allowed by category and customer type?
10. What are the RFQ minimums, seller response SLA, quote validity and partial-quote policy?
11. What are the approval thresholds, credit override roles and audit retention requirements?
12. What are cancellation/return windows by category/seller? Final ownership remains under Q-005A.
13. What is the CMS/DAM provider and editorial approval workflow? Strapi remains an ADAPT
    candidate only.

---

## 16. Journey, screen and component gap review

**Review status:** advisory proposal only · **Workflow stage:** `multi-surface-prototype` ·
**Human approvals recorded:** none.

**Reviewed against:** Flutter `app_router.dart` (57 route paths), current screen/domain/provider
inventories and relevant implementations, the UI Implementation Registry, `derived/journey-map.yaml`, `derived/journey-graph.yaml`,
`derived/journey-capability-map.yaml`, `derived/surface-map.yaml`, the Data Contract and the current
design/journey note.

> “Missing from mapping” means the earlier sections did not explicitly list the backend-managed
> element. “Journey gap” means a governed journey exists but the current buyer app does not yet
> provide a complete production flow. This section does **not** promote or modify canonical project
> contracts; material decisions require a Change Contract and human review.

### 16.1 Backend-managed elements present in current screens but previously missing or under-specified

| Missing / under-specified element | Current journey or component | Canonical owner / provider | Prototype status / required contract |
|---|---|---|---|
| Onboarding panels, benefit copy and eligibility messaging | `/onboarding` | CMS | Hardcoded; add locale, audience, version, schedule and CTA/deep-link fields |
| Consumer/B2B login mode and account-mode entitlement | `/login`; D2C ↔ B2B switch | Identity/Auth + Commerce business account | UI toggle only; backend must decide which account modes the authenticated user may enter |
| Password authentication, password reset and lockout | Consumer login | Identity/Auth (Medusa auth or approved IdP) | No authentication is performed |
| OTP issue, verify, resend, expiry, attempts and fraud/rate limiting | `/otp` | Identity/Auth + SMS provider + risk service | Hardcoded number/code journey; production API and abuse controls missing |
| Registration, phone/email verification and consent records | `/signup` | Identity/Auth + Commerce customer/business account | Form only; terms/privacy/marketing consent and duplicate-account handling absent |
| Session/token lifecycle, device binding, logout and account recovery | app-wide, Settings logout | Identity/Auth | Navigation-only prototype; secure token storage/revocation contract needed |
| Recent searches and search-history deletion | `/search` | Client-local by default; optional account sync via Search/Commerce | Hardcoded terms; persistence/privacy/retention decision needed |
| Search suggestions, spelling correction, popular queries and zero-result recovery | Search/Browse | Meilisearch + Analytics + CMS copy | Current search is local substring filtering |
| Filter definitions, facet values/counts and sort availability | `/filter`, `/browse`, B2B catalogue/offers | Meilisearch + Commerce/Mercur | Hardcoded options and client-side calculations |
| Product rating, review count, review summary and moderation | Product model, Browse rating sort, seller rows | Reviews service/module **TBD**; seller rating projection in Mercur | Product has rating/count fields but no canonical review owner or review journey is defined |
| Product badges (“Bestseller”, “Premium”), delivery note and unit-of-measure labels | cards, Browse filters, PDP | Commerce/Mercur + Logistics; CMS only for display copy | Fields exist, but badge qualification and delivery promise rules need backend contracts |
| Product gallery and thumbnail media ordering | PDP/design `product-gallery` | DAM + Commerce product association | Current Flutter PDP shows one image; design specifies gallery/thumbnails |
| Variant/options selector and variant-specific price/stock | governed `variant-selector` component | Medusa + Tryton availability | Component retained in design consolidation but not implemented in current PDP flow |
| Wishlist add/remove state on cards/PDP and cross-device sync | `/wishlist` | Commerce customer profile | Wishlist screen exists; entry/toggle coverage and production API remain incomplete |
| External competitor price source, capture timestamp and evidence URL | PDP benchmark comparison | Competitive-intelligence provider **TBD** | Fixture values; requires legal approval, freshness SLA and substantiation |
| Per-line “Frequently bought together” rules | cart design requirement | Merchandising/Analytics + Commerce | Current D2C cart uses one global “You may also like” rail, not per-line cross-sell |
| Coupon/promotion-code entry and validation result | governed `coupon-entry` component | Medusa promotions | Kept component has no current routed app implementation |
| Shipping methods, delivery slot/promise and shipping-charge breakdown | Cart/Checkout | Logistics + Commerce | Checkout currently displays “Free” without rate/serviceability calculation |
| Checkout customer/contact validation | `/checkout` | Commerce customer/cart | Email/name/address fields exist but validation, saved-address choice and identity linkage are incomplete |
| Payment session, provider order/token, 3DS/UPI intent, retry and webhook result | `/checkout`, `/payments` | Payment provider + Commerce | Mock capture path; production reconciliation/idempotency required |
| COD eligibility and fee | Checkout payment selector | Payment/Risk + Commerce + Logistics | Always displayed; requires postcode, amount, customer-risk and seller eligibility |
| Canonical order reference and immutable order snapshot | D2C/B2B confirmation | Medusa + Mercur projections | **Critical:** current confirmation screens can report success without a canonical backend order |
| Order-line seller/offer, tax, promotion, shipment and payment snapshots | Order detail/history | Medusa order | Current consumer order line lacks seller/offer/tax/shipment/payment linkage |
| Cancellation reason, actor, per-line quantity and refund impact | Order detail | Medusa + Payments + Mercur allocation | Current flow is a single confirmation action |
| Return item/quantity, reason, replacement choice, evidence, pickup and inspection | Order detail / required return-refund journey | Medusa + Logistics + Mercur | Current flow immediately marks a return requested; no structured return case |
| Refund amount, method, status timeline and provider reference | required return-refund journey | Payments → Commerce projection | No customer refund-tracking screen |
| Reorder availability/substitution report | D2C order quick link; B2B Buy Again/Reorder | Commerce + Mercur + Tryton | Reorder currently adds historical lines without a production revalidation report |
| Cart-to-quote draft and internal quote approval | `/quotes`, `/quotes/:id` | Commerce approval workflow | Separate legacy quote flow exists but was not listed independently from marketplace RFQ |
| Quote approver, comments, version and decision audit | Quote detail | Commerce/RBAC | Fixture status transitions allow the same client to submit/approve/reject |
| Credit sanctioned/utilized/available | `/b2b/credit` dashboard | **Commerce business-account credit (canonical)** | Rich fixture dashboard; fields were previously only summarized as “credit meter” |
| Overdue and ageing buckets | `/b2b/credit` dashboard | Tryton accounting/receivables projection consumed by Commerce | Fixture values; projection/as-of contract missing |
| Credit transactions and invoice allocation | Credit “Transaction History”, invoices | Commerce credit ledger + Tryton accounting + Payments | Backend feed/reconciliation contract missing |
| Pay-outstanding allocation and receipt | Credit “Pay Now” | Payments + Tryton accounting; status projected to Commerce | UI navigates to checkout; invoice selection/allocation absent |
| Credit-limit increase request, documents, review status and decision | Credit “Limit” | Commerce business-account workflow + authorised Finance reviewers | Snackbar fixture only |
| B2B PO number, cost centre/project and duplicate-PO validation | B2B checkout | Commerce business order + Tryton | PO value is hardcoded; uniqueness/requiredness/account policy needed |
| Project creation, status, owner, budget and members | `/b2b/projects` | Commerce business account/project module | List/detail fixtures; create action not wired |
| Project tabs: material lists, orders, sites and RFQs | Project detail | Commerce/Procurement | Only Material Lists is populated; other tabs are “coming soon” |
| Delivery-site address, contact, serviceability, project association and default site | `/b2b/site-selector` | Commerce + Logistics | Current model only has name/city |
| Material-list line SKU, UOM, requested quantity, seller/price snapshot and version | `/b2b/material-list` | Commerce/Procurement + Mercur | Current model uses display strings and cannot support safe ordering/audit |
| Split-shipment leg, seller allocation, AWB, carrier, ETA and exception reason | `/b2b/tracking` | Logistics + Mercur allocation → Commerce | Current fixture contains seller/AWB/status only |
| Buyer-seller conversation, participant permissions and RFQ/order linkage | `/b2b/chat` | Chatwoot or marketplace messaging **TBD** | In-memory messages; no persistence or entity linkage |
| Chat attachments, moderation, retention and dispute export | Buyer-seller chat | Support/Marketplace + DAM/security | Not modelled |
| Team invitation, membership status and role assignment | `/b2b/team` | Commerce business account/RBAC | Read-only fixture; Invite/Edit not implemented |
| Approval request type, requester/approver, reason/comments, timestamps and action permissions | `/b2b/approvals` | Commerce workflow/RBAC | Current item has only reference, amount and status |
| Trade-offer collection title, description, accent, product query/IDs, account audience and schedule | B2B Home + `/b2b/offers` | CMS/Merchandising + Mercur eligibility | Fixture collections; collection governance was under-specified |
| Scheme qualification, benefit calculation, cap, period and redemption | `/b2b/schemes` | Mercur + Commerce | Current scheme only has title/detail/badge |
| Notification event/deep link, delivery/read timestamps, priority, expiry and dedupe ID | `/notifications` | Source domain + Automation/notification service | Current model has title/body/time label/read only; tapping does not deep-link |
| FAQ entries, contact channels/hours and support categories | `/help` | CMS + Chatwoot | Hardcoded |
| Ticket SLA, priority, order/RFQ attachment, assignee and conversation history | Help & Support | Chatwoot | Current ticket has subject/category/message/status only |
| Invoice signed download URL, expiry, document hash and bulk-export job | GST invoice screens | Tryton + document service/DAM | Current “download” actions are fixtures |
| Privacy policy, terms, version acceptance and account/data-deletion request | Settings/Auth | CMS + Identity/Privacy operations | Privacy content is local UI; deletion/export journey absent |
| Language catalogue and server-side preference sync | Settings | CMS localization + Commerce profile | English/Hindi local preference only |
| Referral entry/reward status | governed `referral` component | Growth/Promotion module **TBD** | Retained in journey consolidation but absent from current routes; Phase-1 scope must be confirmed |

### 16.2 Required journey coverage gaps

| Governed journey | Current coverage | Missing production flow/screens | Primary owner |
|---|---|---|---|
| Browse-to-buy | Partial prototype | Live catalogue/search composition, variant selection, offer identity, serviceability, canonical checkout/order | Medusa + Mercur + Tryton + Payments/Logistics |
| Search-to-buy | Partial prototype | Meilisearch query/suggestions/facets, search analytics and production add-to-cart/checkout | Meilisearch + Medusa |
| Order tracking | Fixture UI | Carrier events, shipment-leg detail, ETA/exceptions, contact/support handoff | Logistics → Commerce |
| **Return-refund** | **Major gap** | Select items/qty/reason, replacement/refund choice, evidence, pickup, seller review/inspection, status and refund tracking | Medusa + Mercur + Logistics + Payments |
| Quote-to-order | Interactive fixture | Persisted RFQ, seller routing, quote versions, validity, acceptance, approval, order creation and audit | Commerce + Mercur |
| Repeat order | Partial B2B | Availability/price/seller changes, substitutions, unavailable-line report and explicit customer acceptance | Medusa + Mercur + Tryton |
| Credit order | Separate fixture screens | Integrate Commerce-owned credit eligibility and approval state into checkout; pending/rejected/override branches | Commerce; ERP consumes approved projection |
| **Seller onboarding** | **No current app surface** | Business registration, KYC/document upload, verification, approval/rejection/remediation | Mercur + verification/Automation |
| **Seller catalogue** | **No current app surface** | Add/map product, set seller offer/tier/MOQ, submit inventory projection, publish/unpublish offer | Mercur + Medusa + Tryton |
| **Marketplace order** | **No current commerce-admin surface** | Receive canonical order, split/allocate, exception handling and release to seller | Medusa + Mercur |
| **Seller fulfilment** | **No current seller/warehouse surface** | Pick, pack, labels/manifest, dispatch, proof of delivery and exceptions | Logistics + Tryton + Mercur |
| **Seller return** | **No current seller surface** | Receive return, inspect/grade, approve/reject adjustment and evidence | Medusa + Mercur + Tryton |
| **Seller settlement** | **No current seller/finance surface** | Eligible-order review, commission/fee/tax breakdown, settlement statement, accounting post and payout reconciliation | Mercur + Tryton/Finance |
| Project-site purchasing | Partial B2B fixture | Durable projects/sites/material lists, budget/approval, serviceability and order association | Commerce/Procurement |
| Project-site reorder | Partial B2B fixture | Reorder from project history with current SKU/offer/stock reconciliation | Commerce + Mercur + Tryton |
| Cart merchandising | Partial | Per-line FBT composition and explainable/suppressible recommendation source | Merchandising/Analytics |
| External price comparison | Fixture only | Approved source, freshness/provenance, product matching, legal disclaimer and failure behavior | Competitive-intelligence provider TBD |

### 16.3 Required surfaces not represented by the current Flutter route table

The governed `surface-map.yaml` requires more than the buyer mobile app. Absence from Flutter is
not automatically an implementation defect—some belong to separate web/admin products—but they
must be covered by the overall solution and backend mapping.

| Surface | Required capability/content | Current evidence |
|---|---|---|
| Web store | Responsive D2C/B2B commerce journeys and shared component/data contracts | No corresponding routes in this Flutter app review |
| Seller portal | Onboarding, catalogue/offers, orders, fulfilment, returns, settlements | No buyer-app routes; governed seller journeys remain required |
| Commerce admin | Marketplace order receive/split/allocate/release, catalogue/order operations | No current buyer-app routes |
| Ops console | Exceptions, retries, dead letters, reconciliation and support handoff | No current buyer-app routes |
| Analytics | Merchandising, conversion, seller/order/credit performance | Data consumer declared; no surface reviewed here |
| ERP | Inventory and accounting operations; invoices and marketplace settlement/customer-account projections | Tryton is selected; B2B credit remains canonically owned by Commerce |
| Warehouse (recommended) | Pick/pack/dispatch/returns receiving | No surface reviewed |
| Customer support (recommended) | Chat/ticket agent workspace and customer context | Chatwoot selected; only customer-side fixture exists |

### 16.4 Component/data-contract omissions

Purely visual primitives do not need backend ownership. The following governed components do need
explicit payload, permission and state contracts:

| Component | Missing contract items |
|---|---|
| `ProductCard` / B2B trade cards | Stable product/variant/offer IDs, eligibility, stock timestamp, price expiry, action permissions, unavailable reason |
| `ProductGallery` | Ordered assets, rendition/crop, video/type, alt text, rights expiry and fallback |
| `VariantSelector` | Option matrix, valid combinations, selected variant, price/availability delta and disabled reason |
| `CartLine` | Seller/offer/fulfilment identity, price-change state, inventory error, promotion allocation and line actions |
| `CheckoutSummary` | Item, seller, shipping, promotion, tax, credit and rounding breakdown with calculation version |
| `CouponEntry` | Validation status/code, scope, benefit, rejection reason, combinability and expiry |
| `OrderCard` | Permission-derived actions, seller/shipment groups, payment/approval state and latest event timestamp |
| `ReturnStatus` | Return case ID, line quantities, reason, evidence, pickup/inspection/refund states and next allowed actions |
| `ShipmentStatus` | Shipment leg/AWB/carrier, event history, ETA, exception reason and support action |
| `CreditLimit` | Currency, sanctioned/used/available/pending, ageing/overdue, as-of timestamp and blocking reason |
| `ApprovalStatus` / `WorkflowAction` | Actor permission, version, allowed transitions, comments/reason, optimistic-lock token and audit reference |
| `RFQForm` / RFQ Workspace | RFQ ID/version/status, line seller scope, target-price semantics, expiry, attachments, submit eligibility and validation errors |
| `ReorderAction` / Buy Again | Revalidation result per line, substitutions, current offer, unavailable quantity and acceptance state |
| `Notification` | Event ID, type, audience, deep link, priority, expiry, read/delivery timestamps and dedupe key |
| `Referral` | Program eligibility, referral code/link, reward rules/status and fraud controls; scope currently unconfirmed |
| `DataTable` / `Chart` | Query period, currency/unit, timezone, access scope, data freshness, export permission and empty/error states |

### 16.5 Additional configurable rules found by the review

| Rule area | Proposed rule / decision required | Owner |
|---|---|---|
| Authentication | OTP/password attempt limits, resend delay, expiry, session lifetime, device/session revocation and account recovery | Identity/Auth |
| Account mode | B2B mode requires active business membership; switching mode changes channel, price list, cart and permissions without leaking data | Identity + Commerce |
| Consent/privacy | Version and timestamp terms/privacy/marketing consent; support access/export/deletion and retention policy | Identity/Privacy + CMS |
| Search history | Local by default; consent required for account sync/personalization; provide delete/clear | Search/Privacy |
| Reviews | Only eligible purchasers may create verified reviews; moderation, edits, abuse reporting and seller response require policy | Reviews module TBD |
| Competitor prices | Define source allowlist, match confidence, maximum age, tax/shipping normalization, disclaimer and automatic suppression when stale | Competitive-intelligence provider + Legal |
| Recommendations | Exclude current cart, unavailable/ineligible products and blocked sellers; identify sponsored placement | Analytics/Search/Mercur |
| Reorder | Never recreate historical price/seller blindly; show all changed, substituted or unavailable lines before cart creation | Commerce + Mercur + Tryton |
| Return case | Eligibility must be line-level and backend-provided; capture reason/evidence; refund begins only after configured inspection/approval | Commerce + Mercur + Logistics + Payments |
| Return replacement | Replacement is a new fulfilment obligation linked to the return; revalidate stock/seller/serviceability | Commerce + Mercur + Tryton |
| Credit limit request | Require configurable evidence and approval chain; no limit changes from client-side state | Commerce business-account workflow + authorised Finance reviewers |
| PO number | Configure requiredness and uniqueness scope per business account/project; duplicate PO requires explicit override permission | Commerce + Tryton |
| Projects/sites | Enforce account ownership, member access, budget/cost-centre, default site and archival behavior | Commerce/RBAC |
| Material-list conversion | Preserve list version; resolve current SKU/offer/stock; show unresolved lines; never silently drop a line | Commerce/Procurement |
| Chat | Only participants in the linked RFQ/order may chat; configure retention, moderation, attachments and dispute export | Marketplace/Chatwoot + Security |
| Team invites | Invitation expiry, domain/phone verification, maximum members, role assignment and revoke/deactivate audit | Commerce/RBAC |
| Approval action | Approver cannot approve own request unless policy permits; stale-version actions fail; rejection reason required | Commerce workflow |
| Notification deep link | Target must be allowlisted and authorised at open time; expired/deleted entities use a safe fallback | Notification service + source domain |
| Support SLA | Category/priority determine response SLA and escalation; ticket must link to authorised order/RFQ when supplied | Chatwoot + Automation |
| Invoice download | Signed, short-lived, account-authorised URLs; bulk download runs as an audited asynchronous export | Tryton + document service |
| Confirmation screen | Display success only after canonical order/payment outcome; never infer success from navigation or cleared local cart | Medusa + Payment provider |

### 16.6 Prioritised missing-item register

| Priority | Missing item | Reason |
|---|---|---|
| **P0 — production blocker** | Real identity/auth, OTP/session/consent and account-mode entitlement | Current routes navigate without authentication |
| **P0 — production blocker** | Canonical cart/offer identity and seller allocation | Multi-seller price cannot be safely ordered or fulfilled without it |
| **P0 — production blocker** | Canonical checkout/order creation and idempotent payment result | Current confirmation can show success without a backend order |
| **P0 — production blocker** | Tryton availability projection and reservation policy | Fixture stock cannot support production promises |
| **P0 — production blocker** | Live logistics/serviceability/shipment event contract | Delivery promises and tracking are fixtures |
| **P0 — required journey** | End-to-end return/refund case and refund tracking | Governed required journey is materially incomplete |
| **P0 for marketplace launch** | Seller onboarding/catalogue/order/fulfilment/return/settlement and commerce-admin allocation surfaces | Six required marketplace journeys lack current surfaces |
| **P1** | Credit/approval integrated with B2B checkout; limit request/pay-outstanding workflows | Existing rich UI is disconnected from canonical finance state |
| **P1** | Durable projects/sites/material lists and project-site order association | Client-brief journeys are only partial fixtures |
| **P1** | Production Meilisearch suggestions/facets/sorts and query analytics | Current search/browse is local filtering |
| **P1** | Notifications/deep links, support SLAs, buyer-seller chat governance | Existing screens lack event/entity/security contracts |
| **P1** | Legal/privacy, document export and audit/retention rules | Required before handling customer/business data |
| **P2 / scope decision** | Ratings/reviews, competitor comparison provider, referral program, richer personalization | Owner/provider or Phase-1 scope is not yet confirmed |

### 16.7 Review conclusion

The previous mapping covered the major buyer-facing commerce domains, but it under-counted
**identity/authentication**, **operational state and audit data**, **project/credit detail**, and the
full **seller/operator side** of the governed marketplace. The most important correction is to treat
the app as one surface in a multi-surface system: Medusa/Mercur/Tryton/CMS mappings are not complete
until the seller portal, commerce admin, fulfilment, return/refund and settlement journeys are also
represented and validated.
