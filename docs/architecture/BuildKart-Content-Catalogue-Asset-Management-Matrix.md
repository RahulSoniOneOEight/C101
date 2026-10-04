# BuildKart — Content, Catalogue, Asset, and Data Management Matrix

**Prepared:** 4 October 2026  
**Companion to:** `BuildKart-Current-Journeys-Screens-Components-Use-Cases.md`  
**Project stage:** Multi-surface prototype  
**Status:** Current architecture plus recommended operating model; not production approval

**CMS candidate evaluation:** `BuildKart-Strapi-Medusa-CMS-Evaluation.md`

---

## 1. Important terminology and status

The approved solution contract currently names:

| Capability | Selected platform/provider |
|---|---|
| Mobile experience | Flutter |
| Web experience | Next.js |
| Commerce | Medusa |
| Marketplace and seller offers | Mercur |
| ERP and inventory | Tryton |
| Search index | Meilisearch |
| Support | Chatwoot |
| Automation/orchestration | Activepieces |
| Operational database | PostgreSQL |
| Payment candidates | Razorpay / Cashfree |
| Logistics candidates | Shiprocket / Delhivery |

> **Mercur versus Mercure:** The selected marketplace platform in the solution
> contract is **Mercur**. **Mercure** is a different real-time update protocol.
> Mercure is not currently selected in the governed architecture. If real-time
> browser/app push through Mercure is required, it must be added as a separate
> integration decision.

### Status labels used below

- **Confirmed:** Present in the current solution or data contract.
- **Recommended:** Proposed operating model that still needs client approval.
- **Prototype:** Current Flutter behavior only; not the production system of record.
- **Open:** Ownership/provider is not yet approved.

### Key unresolved decision

The client requirements explicitly define catalogue, inventory, fulfilment, and
returns ownership as **mixed**. Open question `Q-005A` asks for the final detailed
responsibility matrix. Therefore, this document must not silently declare one
platform as the owner of all product data.

---

## 2. Recommended high-level ownership model

| Information class | Recommended manager | Canonical owner / authority | Delivery to app |
|---|---|---|---|
| Editorial content and campaign creative | CMS + DAM, provider TBD | CMS/DAM | Content API/CDN |
| Master product and variant catalogue | Commerce catalogue administration, with controlled seller contribution | **Open/mixed**; recommended Medusa master catalogue after approval | Medusa Store API, then Meilisearch for discovery |
| Seller identity and seller-specific offers | Seller portal / marketplace operations | Mercur marketplace | Mercur projection into Medusa storefront/read model |
| Inventory availability | ERP/warehouse operations | Tryton ERP | ERP projection to Medusa availability; indexed in Meilisearch where needed |
| Cart and commerce order | Medusa | Medusa commerce | Medusa Store API |
| Payment status | Payment provider integration | Razorpay/Cashfree integration | Provider webhook → Medusa/order projection |
| Shipment status | Logistics integration | Shiprocket/Delhivery integration | Provider webhook → Medusa/order projection |
| Search results | No direct manual editing | Derived Meilisearch index | Meilisearch search API |
| Support tickets/conversations | Support agents and automation | Chatwoot | Support API / contextual deep link |
| Workflow automation | Operations/marketing administrators | Activepieces workflow definitions | Events, scheduled jobs, outbound messages |

---

# Part A — CMS and digital asset management

## 3. Editorial and campaign assets

CMS/DAM is **recommended but no provider has been selected**. The CMS should
control presentation content, not transactional truth such as stock or final
price.

| Item/asset | Who manages it | Recommended system | Management workflow | App usage |
|---|---|---|---|---|
| Home hero banners | Marketing/merchandising team | CMS + DAM | Draft → preview → approve → schedule/publish → expire | `HomeHeader` hero carousel/banner area |
| Secondary promotional banners | Marketing team | CMS + DAM | Upload responsive media, add copy/CTA, target audience, schedule | `MerchandisingBanner` / home modules |
| B2B promotional banners | Trade marketing | CMS + DAM | B2B audience targeting, optional account segment, start/end dates | B2B merchandising units |
| Campaign title and subtitle | Marketing/content editor | CMS | Localized text fields with character limits and preview | Banner, collection, and offer headings |
| CTA label and destination | Marketing editor, route validated by product team | CMS | Select approved internal route/deep link; broken-link validation before publish | “Shop Now”, “View Deals”, “Explore” actions |
| Banner desktop/tablet/mobile image variants | Creative team | DAM | Upload master; generate crops and responsive derivatives; accessibility review | CDN URL chosen by device/layout |
| Banner alt text/accessibility description | Content editor | CMS/DAM metadata | Required before publishing meaningful imagery | Screen-reader semantics |
| Campaign schedule | Marketing operations | CMS | `publish_at`, `unpublish_at`, timezone, priority | Controls visibility without app release |
| Campaign audience/segment | Marketing + data governance | CMS/segmentation service | B2C/B2B, customer segment, geography, account eligibility | App requests content with audience context |
| Homepage section order | Merchandising team | CMS page/module builder | Reorder only approved module types; preview before publish | `MerchandisingModule` feed order |
| Product carousel heading/tag | Merchandising team | CMS | Configure title, tag, product source, item limit | “Flash Deals”, “Best Sellers”, etc. |
| Curated product collection | Merchandising team | CMS stores collection rule/reference; products remain commerce entities | Choose manual SKU list or approved dynamic rule | CMS returns product IDs; app resolves current product/price from commerce |
| Category landing editorial content | Category merchandising | CMS + DAM | Image/copy blocks linked to a commerce category ID | Category landing headers and inspiration blocks |
| Content/inspiration articles | Content team | CMS | Author, review, SEO metadata, schedule, archive | Future inspiration/content surface |
| Onboarding headline and benefits | Product/content team | CMS or remote app configuration | Version, preview, approve; fallback bundled in app | `OnboardingScreen` |
| Help/FAQ content | Support content team | CMS or Chatwoot help centre | Draft/review/publish; support owner approval | `HelpSupportScreen` |
| Terms, privacy, return-policy copy | Legal/content administrators | CMS with immutable version history | Legal approval, effective date, version retention | Account/checkout/legal links |
| Notification campaign copy | CRM/marketing team | CMS/automation template library | Template approval, audience, schedule, frequency cap | Activepieces sends to in-app/push/WhatsApp channels |
| Email, push, and WhatsApp templates | CRM operations | Activepieces/template service; content may originate in CMS | Versioned template, variables, test send, approval | Transactional and lifecycle messaging |

### CMS content model recommended for every banner/module

- stable content ID and version;
- audience: B2C, B2B, or both;
- placement and module type;
- title, subtitle, CTA label;
- approved destination route/deep link;
- mobile/tablet/desktop media references;
- alt text;
- locale;
- start/end timestamps and timezone;
- priority and fallback behavior;
- product/category/collection references by stable ID;
- draft, approved, scheduled, live, expired states;
- author, approver, and audit timestamps.

### Rule: CMS must not own transactional fields

The CMS may select or promote a product but must not independently store the
live selling price, stock quantity, seller availability, tax, or delivery
promise. Those values must be resolved from commerce/marketplace/ERP at render
time or from an approved synchronized read model.

---

## 4. Media and DAM assets

| Asset | Editor/owner | System | Rules |
|---|---|---|---|
| Product hero image | Catalogue operations or approved seller submission | DAM/media storage referenced by master catalogue | Moderation, minimum resolution, neutral background where required |
| Product gallery | Catalogue operations / approved seller | DAM + catalogue media references | Ordered gallery, duplicate detection, safe-area crop |
| Product video | Catalogue operations / approved seller | DAM/video platform | Transcoding, poster frame, duration/file-size policy |
| Specification or installation PDF | Brand/catalogue operations | DAM/document storage | Malware scan, version, product linkage, download tracking |
| Seller logo | Seller, approved by marketplace operations | Mercur seller profile + DAM | File validation, moderation, fallback initials/logo |
| Brand logo | Catalogue/brand administrator | Master catalogue + DAM | One approved canonical asset per brand/version |
| Category image | Category merchandising | CMS/DAM linked to commerce category ID | Responsive derivatives and alt text |
| Campaign artwork | Creative/marketing | CMS/DAM | Rights/licence record, start/end usage date |
| User-uploaded RFQ attachment | Business buyer | Secure object storage linked to RFQ | Authenticated upload, malware scan, access policy, retention |
| Invoice PDF | ERP/accounting or invoicing service | Secure document storage | Signed/expiring URL, customer authorization, immutable version |
| App logo, launcher icon, splash | Product/design engineering | Source repository/build pipeline | Release-controlled; not editable through CMS |
| UI icons | Design system governance | Governed icon registry/code | Phosphor primary; approved fallbacks only; not arbitrary CMS uploads |
| Fonts and design tokens | Design system governance | Design-token source + app package | Versioned and released with UI build |
| Placeholder/error images | Design engineering | App asset bundle/CDN | Stable fallback when remote media fails |

### Recommended media pipeline

`Upload → file/type validation → malware scan → moderation/approval → DAM storage → responsive transformation → CDN → app cache`

Media records should retain copyright/source, uploader, approval, focal point,
alt text, dimensions, checksum, and archive status.

---

# Part B — Product catalogue and seller management

## 5. Master product catalogue

The current Flutter app reads products from Medusa `GET /store/products`. The
final canonical owner of the shared/master catalogue remains **open** because
the client declared mixed ownership.

| Product item | Recommended editor | Recommended authority | Synchronization/usage |
|---|---|---|---|
| Master product ID | Catalogue operations/system | Approved master catalogue | Stable across seller offers and channels |
| Product title | Catalogue operations; sellers may propose | Master catalogue, recommended Medusa after Q-005A approval | Indexed into Meilisearch |
| Long/short description | Catalogue operations; seller proposal with moderation | Master catalogue | Store API/PDP and search index |
| Brand/manufacturer | Catalogue operations | Master catalogue/brand registry | Facets and PDP |
| Category/taxonomy | Category administrator | Master catalogue taxonomy | Navigation, filters, search facets |
| SKU and variant ID | Catalogue operations/system | Master catalogue | Referenced by seller offers, stock, cart lines |
| Variant options | Catalogue operations | Master catalogue | Size/finish/pack/UOM selection |
| UOM and pack size | Catalogue operations with ERP validation | Master catalogue, projected to ERP | Pricing and quantity calculations |
| Technical specifications | Catalogue operations/brand | Master catalogue attribute schema | PDP specifications and filters |
| HSN/SAC and GST rate | Finance/catalogue governance | ERP/tax authority projected to commerce, final decision required | Checkout, invoice, B2B detail |
| Base MRP/reference price | Catalogue/finance governance | Mixed; commerce/ERP decision required | Display only when current and valid |
| Base media references | Catalogue operations | Master catalogue + DAM | Product cards/PDP |
| Product publication status | Catalogue operations | Master catalogue | Draft/active/inactive/archived |
| Product badges such as “Bestseller” | Derived analytics or merchandising rule | Commerce/merchandising configuration | Never permanently embedded in Flutter code |
| SEO/storefront metadata | Commerce/content team | Medusa/CMS depending page type | Web channel and share links |

### Recommended shared-catalogue workflow

`Seller/brand proposes product → duplicate/SKU validation → catalogue moderation → master product created/linked → seller offer attached → search re-indexed → storefront visible`

This avoids duplicate products for every seller while preserving seller-specific
commercial offers.

---

## 6. Seller-managed listings and offers

Seller identity and seller offers are canonically owned by the **marketplace**
capability in the current data contract. Mercur is the selected marketplace
provider.

| Seller-managed item | Editor | Canonical owner | Controls |
|---|---|---|---|
| Seller organization profile | Seller, reviewed by marketplace operations | Mercur | Approval and audit history |
| Seller logo/contact information | Seller, moderated | Mercur + DAM | Validation and privacy controls |
| KYC documents/status | Seller/compliance team | Marketplace/KYC integration; provider TBD | Restricted access and retention |
| Seller verification badge | Marketplace operations | Mercur | System-generated from approved status; seller cannot self-assign |
| Seller-product association | Seller/catalogue operations | Mercur | Must reference an approved master product/SKU |
| Selling price | Seller within commercial guardrails | Mercur seller offer | Effective dates, minimum/maximum checks, audit |
| MOQ | Seller | Mercur seller offer | Positive quantity/UOM validation |
| Quantity price tiers | Seller | Mercur seller offer | Non-overlapping ranges and monotonic pricing validation |
| Seller-specific lead time | Seller/operations | Mercur seller offer | Constrained by stock/warehouse/serviceability |
| Seller offer status | Seller + marketplace moderation | Mercur | Draft, pending, active, paused, rejected, expired |
| Offer validity dates | Seller | Mercur | Start/end, automatic expiry |
| Seller service areas | Seller/marketplace operations | Mercur | Pincode/region rules |
| Seller return terms | Seller within marketplace policy | Mercur/returns policy | Must not override mandatory platform/legal rules |
| Seller-specific media | Seller submits, marketplace moderates | Mercur + DAM | Used only if approved; master media remains separate |
| Commission configuration | Marketplace finance/admin | Mercur | Configurable; 10% is prototype default, not fixed production policy |
| Marketplace order allocation | Marketplace engine | Mercur | Split by seller/offer/availability |
| Seller settlement and payout | Marketplace finance | Mercur | Settlement cycle/provider still requires approval |

### Seller listing delivery flow

`Seller portal → Mercur validation/moderation → approved seller offer → projection to Medusa storefront → Meilisearch re-index → Flutter listing/PDP`

The app should receive a normalized product with one or more seller offers. The
B2B PDP can choose the best-price offer by rule while still allowing comparison.

---

## 7. Inventory, price, availability, and delivery

| Item | Managed by | Canonical owner | App/read-model behavior |
|---|---|---|---|
| On-hand inventory | Warehouse/ERP operations | **Tryton ERP** (confirmed) | Never edited in CMS or Flutter |
| Reserved inventory | ERP/order allocation process | Tryton ERP | Updated when carts/orders reserve stock according to policy |
| Available-to-sell | Derived from ERP stock/reservations | Tryton ERP projection | Sent to Medusa availability and optionally search index |
| Warehouse location | ERP operations | Tryton ERP | Used for allocation/serviceability |
| Seller offer price | Seller | Mercur | Projected to storefront and search read models |
| Consumer promotional price | Commerce/marketing under promotion rules | Medusa promotions; creative in CMS | Commerce calculates price; CMS only presents campaign |
| B2B negotiated/account price | Commercial/account team | Commerce/business-account pricing capability | Resolved for authenticated account |
| MRP/reference price | Catalogue/finance | Ownership requires Q-005A decision | Used for discount display only if trustworthy/current |
| Coupon/promotion rules | Commerce administrator | Medusa | Eligibility and final calculation happen server-side |
| Delivery promise | Logistics/serviceability calculation | Derived from inventory, warehouse, seller, destination, logistics | Calculated response; not hardcoded content |
| Low-stock/back-in-stock state | ERP event | Tryton → automation/commerce | Triggers listing state and notifications |

### Update expectations

- Product copy/media: publish and cache invalidation; near-real-time is normally
  unnecessary.
- Offer price/MOQ/status: event-driven or short-latency synchronization.
- Stock/availability: event-driven synchronization with reconciliation jobs.
- Order/payment/shipment status: webhook/event-driven updates with idempotency.
- Search: update after product, offer, inventory, or publication changes.

---

## 8. Search, filters, sorting, and recommendations

| Item | Managed by | System | Notes |
|---|---|---|---|
| Search documents/index | Automated projection | Meilisearch | Derived; never manually edited |
| Searchable product text | Catalogue operations | Master catalogue → Meilisearch | Title, SKU, brand, description, attributes |
| Category/brand/price filters | Derived from catalogue/offers | Meilisearch | Facets must use governed fields |
| Stock/seller/serviceability filters | Derived | ERP/Mercur projections → Meilisearch | Freshness must be monitored |
| Sort options | Product/search team configuration | Search configuration | Relevance, price, newest, popularity, etc. |
| Synonyms and stop words | Search merchandising administrator | Meilisearch settings | Versioned, tested, and reversible |
| Featured/boosted results | Merchandising team | Search rules; campaign reference may originate in CMS | Sponsored/boosted treatment should be transparent |
| Recommended products | Recommendation service/rule configuration | Provider TBD | Client requirement says recommendations must remain configurable |
| Recently viewed | Customer behavior | Customer profile/app data | Prototype currently persists locally |
| Competitor price data | Approved crawler/price-intelligence process | External normalized data source | Include source and freshness timestamp; not seller-entered |

---

# Part C — Customer, commerce, and B2B operational data

## 9. Customer-owned and commerce-owned items

| Item | Managed by | Recommended/canonical system | Current prototype |
|---|---|---|---|
| Consumer profile | Customer/support admin | Medusa customer/account capability | Local persistence |
| Saved addresses | Customer | Medusa customer addresses | Local persistence |
| Wishlist | Customer | Medusa customer extension or dedicated profile service | Local/provider state |
| Recently viewed | Automatic from customer behavior | Customer profile/analytics store | `LocalStore` |
| Cart | Customer via app | Medusa commerce | Medusa with local fallback |
| Saved payment reference/token | Customer via approved payment flow | Payment vault/provider; commerce stores token reference only | Local development fixture/reference |
| Notification preferences | Customer | Customer/account service | Local settings fixture |
| B2B business account | Business admin/commerce operations | Medusa commerce (confirmed canonical owner: commerce) | Development fixtures/local state |
| GSTIN/account tax profile | Business admin with validation | Commerce/ERP projection; final boundary approval needed | Local persistence |
| Team members and roles | Authorized business admin | Commerce business-account capability | Prototype fixtures/actions |
| Credit limit and balance | Authorized credit operations | Commerce (confirmed); ERP consumes projection | Prototype fixtures |
| Approval rules | Business admin/credit operations | Commerce workflow | Prototype approval states |
| Procurement lists | Business buyer | Recommended commerce customer extension | `LocalStore`, auto-saved |
| Projects and sites | Business buyer/admin | Recommended commerce B2B extension | Prototype fixtures |
| RFQ | Business buyer and marketplace sellers | Commerce/marketplace workflow | Prototype state |
| Seller quotes | Seller | Mercur marketplace | Prototype fixtures |
| Accepted quote | Buyer action | Commerce order draft + marketplace quote reference | Prototype flow |

---

## 10. Transaction and operations ownership

These ownerships are explicitly defined in the current data contract where noted.

| Entity/item | Canonical owner | Managed through | Consumers |
|---|---|---|---|
| Order | **Medusa commerce** | Storefront checkout and commerce admin | ERP, analytics, customer app |
| Marketplace order allocation | **Mercur marketplace** | Marketplace allocation workflow | Medusa, ERP, seller operations |
| Payment | **Payment integration** | Razorpay/Cashfree APIs and webhooks | Medusa, ERP |
| Shipment | **Logistics integration** | Shiprocket/Delhivery APIs and webhooks | Medusa, ERP, customer app |
| Inventory | **Tryton ERP** | ERP/warehouse processes | Medusa availability |
| Commission | **Mercur marketplace** | Marketplace finance configuration | ERP |
| Seller settlement | **Mercur marketplace** | Settlement workflow | ERP |
| Payout reconciliation | **Mercur marketplace** | Marketplace finance workflow | ERP, analytics |
| Invoice/tax document | Recommended ERP/accounting authority | ERP/invoice service, secure document store | Customer/B2B app |
| Return request | Mixed/open | Commerce entry; seller/warehouse/logistics processing | Customer app, ERP, marketplace |
| Refund | Payment integration, initiated from approved return/order state | Payment provider + commerce status projection | Customer app, ERP |

### Order lifecycle

`Flutter/Next.js → Medusa cart/checkout → payment authorization/capture → Medusa order → Mercur seller allocation → Tryton inventory/accounting projection → logistics fulfilment → shipment events → customer status`

Every inbound webhook/event must be authenticated, idempotent, auditable, and
safe to retry.

---

## 11. Notifications, support, and automation

| Item | Editor/source | System | Management |
|---|---|---|---|
| Transactional order notification | Order/payment/shipment event | Activepieces + messaging channel | Approved template with event variables |
| Marketing notification | CRM/marketing team | CMS/template library + Activepieces | Consent, audience, schedule, frequency cap |
| Back-in-stock/price-drop alert | Inventory/offer event | Tryton/Mercur → Activepieces | Customer subscription and deduplication |
| Cart/browse abandonment | Behavioral event | Analytics/event store → Activepieces | Delay, suppression if purchased, consent |
| B2B approval alert | Commerce workflow event | Medusa/Activepieces | Route only to authorized approver |
| In-app notification | Source business event | Recommended notification service/read model | Audience-scoped B2C/B2B inbox and read state |
| Push token | Customer device | Notification infrastructure | Secure token lifecycle and opt-out |
| WhatsApp message | Approved automation | Meta WhatsApp Cloud candidate | Template approval and consent |
| Support ticket | Customer/support agent | Chatwoot | Status, assignment, SLA, audit |
| Buyer-seller chat | Buyer/seller with order/RFQ context | Recommended Chatwoot with marketplace authorization | Prevent cross-seller data exposure |
| FAQ/help article | Support content team | CMS or Chatwoot help centre | Review and publish workflow |

The current Flutter notification feed is fixture/provider-backed and keeps read
state in memory. Production requires a persistent notification inbox or an
approved provider projection.

---

# Part D — App-managed assets and configuration

## 12. Items that should remain release-controlled

These are application/design-system assets and should not be casually editable
through CMS:

| Item | Managed by | Location/process |
|---|---|---|
| Brand color tokens | Design-system governance | Shared Flutter UI package/token source |
| Typography scale | Design-system governance | Shared Flutter UI package/token source |
| Spacing and radius tokens | Design-system governance | Shared Flutter UI package/token source |
| Semantic component definitions | Design and engineering | UI implementation registry/shared package |
| Navigation structure and protected routes | Product/engineering | `app_router.dart`, reviewed app release |
| Permission and role enforcement | Security/backend engineering | Server-side authorization plus UI state |
| App launcher icon and splash | Product/design engineering | App build assets |
| Standard UI icons | Design system | Governed icon registry |
| Loading/error/empty-state behavior | Product/engineering | Shared widgets and screen implementation |
| Analytics event schema | Product analytics governance | Versioned event contract |
| Integration credentials | Platform/security operations | Environment/secret manager; never CMS or app bundle |

CMS can change approved content within a component’s contract, but it should not
change arbitrary layout code, permissions, pricing logic, tax logic, or checkout
rules.

---

# Part E — Flutter consumption and fallback behavior

## 13. Current code versus target management

| Surface element | Current Flutter source | Target management |
|---|---|---|
| Product listing | `MedusaStoreClient.listProducts()` with cached/demo fallback | Medusa storefront read model composed from approved master catalogue, Mercur offers, and Tryton availability |
| Product detail | Product provider/Medusa, B2B fixtures for seller offers | Medusa product + Mercur seller offers + ERP availability |
| Product images | Medusa thumbnail or demo Pexels URL | DAM/CDN reference stored on master product or approved seller media |
| Categories | Hardcoded `categoriesProvider` | Approved master taxonomy; optional CMS editorial image/copy |
| Home product modules | Derived in `homeModulesProvider` | CMS module definitions/product references; live product data resolved from commerce |
| Home clearance banner | Hardcoded `MerchandisingBannerData` | CMS/DAM with scheduling and deep-link validation |
| Header hero banners | Presentational Flutter content | CMS/DAM responsive campaign assets |
| B2B offers/collections | Provider fixtures | Mercur/Medusa commercial rules plus CMS creative/placement |
| Seller offers | B2B fixture models | Mercur canonical seller offers |
| Inventory | Demo/provider state | Tryton canonical availability projection |
| Search/filter | Client-side filtering in prototype | Meilisearch index and facets |
| Cart | Medusa with local fallback | Medusa canonical cart |
| Procurement lists | `LocalStore` | Commerce B2B customer extension |
| Profile/account data | `LocalStore` fixtures | Medusa/customer-account services |
| Payment | Mock staging gateway | Approved Razorpay/Cashfree integration |
| Tracking | Fixtures | Logistics provider projection |
| Invoice PDF | Local development generation | ERP/invoice service signed download URL |
| Notifications | Fixture/provider and in-memory read state | Persistent notification service + Activepieces delivery |
| Support/chat | Prototype UI | Chatwoot integration |

## 14. Runtime assembly recommendation

The app should receive a channel-ready read model rather than joining every
backend directly on-device.

Example product-listing response:

- master product ID, variant ID, title, brand, primary media;
- category and filter attributes;
- current customer/account-visible price;
- MRP where valid;
- best/current seller offer and seller count;
- stock/availability status rather than unrestricted raw warehouse quantities;
- MOQ, UOM, price tiers;
- campaign/badge references;
- delivery/serviceability summary;
- data freshness/version timestamps.

The backend composition layer should resolve Medusa, Mercur, Tryton, and
Meilisearch data before returning a stable storefront contract.

## 15. Fallback rules

| Failure | Recommended behavior |
|---|---|
| CMS unavailable | Serve last valid cached published layout/content; never show draft content |
| Banner media unavailable | Hide optional banner or use approved placeholder without breaking layout |
| Medusa catalogue unavailable | Show cached catalogue with freshness notice or retry state; do not accept invalid checkout |
| Mercur seller offers unavailable | Hide seller-specific purchasing or show unavailable state; do not invent price/MOQ |
| Tryton inventory unavailable/stale | Mark availability as unconfirmed and validate again before checkout |
| Meilisearch unavailable | Offer limited catalogue fallback or retry; product detail can still resolve by stable ID |
| Payment provider unavailable | Keep order/payment pending; queue safe retry where contract permits; never show paid |
| Logistics unavailable | Preserve order and show tracking temporarily unavailable; reconcile later |
| Notification channel unavailable | Queue/retry according to policy; avoid duplicate sends |

---

# Part F — Required administrative surfaces

## 16. Operational tools needed

| Admin surface | Primary users | Manages |
|---|---|---|
| CMS page/module editor | Marketing/content | Banners, headings, CTA, section order, schedule, audience |
| DAM/media library | Creative/catalogue teams | Images, video, documents, derivatives, metadata |
| Catalogue admin | Catalogue operations | Master products, variants, attributes, taxonomy, publication |
| Seller portal | Sellers | Profile, offer price, MOQ, tiers, lead time, service area, submissions |
| Marketplace moderation | Marketplace operations | Seller approval, listing approval, policy violations |
| Commerce admin | Commerce operations | Promotions, carts/orders, customers, refunds initiation |
| ERP admin | Warehouse/finance | Inventory, warehouses, accounting, tax/invoice data |
| Search merchandising | Search/category managers | Synonyms, boosts, sort/relevance settings |
| Support console | Support agents | Tickets, chat, escalation, SLA |
| Automation console | CRM/operations | Event workflows, templates, retries, alerts |
| Finance/settlement console | Finance and marketplace operations | Commission, settlement, payout reconciliation |

All administrative actions should include role-based access, audit history,
approval where required, and reversible publication/configuration changes.

---

# Part G — Decisions required before production implementation

## 17. Open decisions

1. Approve the final `Q-005A` ownership matrix for master catalogue, seller
   contributions, inventory, fulfilment, and returns.
2. Select a CMS/DAM provider and define preview, approval, scheduling, and CDN
   behavior.
3. Confirm whether the master catalogue is Medusa-owned or managed by a separate
   PIM/master-data capability projected into Medusa.
4. Confirm whether “Mercure” was intended as real-time event transport. If yes,
   add it separately; do not confuse it with Mercur marketplace.
5. Define product and seller-listing moderation roles and SLAs.
6. Define which price is controlled by seller, commerce promotion, account
   contract, or ERP, including conflict precedence.
7. Define inventory reservation and stale-availability behavior.
8. Select final payment, logistics, messaging, and media-storage providers.
9. Confirm invoice generation authority and signed-document download contract.
10. Define return/refund ownership across customer service, seller, warehouse,
    logistics, payment, and commerce.
11. Define personalization/recommendation provider and consent model.
12. Define content locales, legal approval, accessibility, and asset-rights
    governance.

---

## 18. Recommended ownership rule in one sentence

**CMS manages what is said and promoted; the master catalogue manages what the
product is; Mercur manages who sells it and on what seller terms; Tryton manages
what inventory exists; Medusa manages the cart and order; payment/logistics
providers manage transaction and fulfilment status; Meilisearch serves the
derived discovery index; and Flutter renders these approved read models.**

---

## Governance statement

Confirmed ownerships in this note come from the current solution and data
contracts. CMS selection, master-catalogue ownership, and several mixed-domain
boundaries are recommendations pending human approval. This note must not be
used to change canonical entity ownership without updating the Data Contract,
dependency map, integration contracts, and validation evidence.
