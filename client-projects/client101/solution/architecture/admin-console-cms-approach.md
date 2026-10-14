# Admin Console and CMS Approach

**Change proposal:** CHG-036 revision 4
**Stage:** Multi-surface prototype  
**Status:** Proposed for human review; no implementation or production authorization

## 1. Recommendation

Keep **Mercur Admin as the only routine operator interface**. Keep Strapi private and treat its own
admin panel as a break-glass recovery tool. Build editorial capabilities as native Mercur pages that
call the authenticated Medusa content facade; the facade calls Strapi over the private network.

Organise the experience around operator jobs rather than backend providers:

1. Find content that needs attention.
2. Edit safely in the correct locale and channel.
3. Validate and preview the customer-facing projection.
4. Review what changed.
5. Publish, schedule or unpublish with explicit authority.
6. Confirm delivery and inspect an audit trail.

Do not reproduce Medusa product, category, promotion, campaign, pricing, inventory or seller forms in
CMS. Show their identity and status as read-only context, with deep links to their native editors.

Apply a strict **one property, one control** rule. A property may be displayed in several contexts,
but only one routine operator surface can edit it. Every other occurrence is a read-only value,
status, reference selector or link to the authoritative editor. The private Strapi admin is an
audited break-glass recovery surface, not a second routine control panel.

## 2. Design principles

1. **One routine console, multiple systems of record.** A unified experience does not mean duplicated
   data ownership.
2. **Task-first information architecture.** Use operator language such as Home page, Banners and
   Category presentation; provider labels such as Strapi are secondary status/context.
3. **Progressive disclosure.** Show routine fields first. Place segmentation, scheduling, key values
   and technical diagnostics in clearly labelled advanced sections.
4. **Safe by default.** Save creates a draft. Publishing is separate, permissioned and confirmed.
5. **Preview the delivered contract.** Preview through the Experience API projection, not an isolated
   CMS rendering that can disagree with the app.
6. **Additive Mercur extensions.** Use route pages, widgets, custom fields and the host-owned navigation
   configuration. Do not fork native pages.
7. **Native design system only.** Use `@medusajs/ui`, `@medusajs/icons`, Medusa UI tokens and public
   `@mercurjs/dashboard-shared` primitives. Use the typed SDK and TanStack Query; no direct `fetch`.
8. **Accessible operations.** Status is not communicated by colour alone; forms, drawers, dialogs,
   tables and error summaries must work by keyboard and meet WCAG 2.2 AA.
9. **Observable delivery.** Operators can distinguish saved, published, scheduled, delivered, stale,
   revoked and failed states.
10. **Singular control ownership.** Register one authoritative edit surface for every property. Never
    present two controls that can independently change the same stored or projected value.
11. **Govern complexity incrementally.** Harden the current draft/modified/published lifecycle before
    adding a larger approval engine.

### Shopify admin and content-management benchmark

The bounded Phase 1 design reviewed Shopify's current official admin guidance and content model:

- Shopify recommends matching the host admin rather than differentiating for its own sake. BuildKart
  therefore uses Medusa/Mercur primitives and tokens, not Shopify Polaris.
- Shopify App Home patterns distinguish resource index, detail, settings and dashboard jobs. BuildKart
  adopts a resource-index content library with search, filters, clear status and one primary action.
- Shopify admin extensions add contextual blocks/actions to native resources, while admin intents open
  the native editor. BuildKart follows the same principle with read-only editorial context and links
  from native products/categories rather than duplicate forms.
- Shopify metaobjects separate governed field definitions from content entries. BuildKart keeps schema
  definitions engineering-governed and exposes only approved entry fields to operators.
- Shopify's theme editor combines a section/module outline with an immediate preview. BuildKart reserves
  this pattern for the later governed Layout Builder instead of treating raw JSON as the end state.
- Shopify recommends backing up/reviewing theme changes. BuildKart uses explicit drafts, confirmation,
  immutable audit and governed fallback rather than direct live editing.

Official references reviewed:

- `https://shopify.dev/docs/apps/design`
- `https://shopify.dev/docs/apps/build/admin`
- `https://shopify.dev/docs/apps/build/app-home`
- `https://help.shopify.com/en/manual/custom-data/metaobjects`
- `https://help.shopify.com/en/manual/online-store/themes/customizing-themes/theme-editor`

Shopify branding, Polaris, iframe architecture and generic metafield duplication are not adopted.

## 3. Singular-control ownership

The control boundary is defined at property level, not only at entity level. For example, Medusa owns
category identity and hierarchy while CMS owns the category's localized presentation. These are
different properties and therefore different controls; neither screen may edit the other's values.

| Property | Single authoritative routine control | Behavior everywhere else |
|---|---|---|
| Banner title, body, image, alt text, CTA, theme and schedule | Mercur Editorial > Banner editor, persisted in Strapi | Layouts select the banner key and show a read-only summary/link |
| Home module order and module configuration | Mercur Editorial > Layout builder, persisted in Strapi | Banner/collection editors do not control page order |
| Category id, handle, hierarchy and commerce membership | Native Medusa Category editor | Editorial view shows read-only category identity and a native-editor link |
| Localized category label, short text, icon and presentation image | Mercur Editorial > Category presentation editor, persisted in Strapi | Native category page shows status and an Edit presentation link only |
| Product identity, variants, SKU, offers, price and inventory | Native Medusa/Mercur product and offer controls | Product editorial view shows read-only commerce context |
| Product guidance, localized supporting copy and SEO | Mercur Editorial > Product editorial editor, persisted in Strapi | Native product page shows coverage/status and one editor link |
| Promotion mechanics, eligibility, limits and activation | Native Medusa Promotion editor | Banners/layouts may reference or link to the promotion but cannot edit it |
| Campaign budget, grouping and activation | Native Medusa Campaign editor | Merchandising overview shows read-only state and a native-editor link |
| Commerce collection membership | Native Medusa Collection editor | CMS can reference the collection key but cannot maintain a competing member list |
| FAQ/help title and body | Mercur Editorial > Help/article editor, persisted in Strapi | Customer surfaces consume published projection and do not edit it |
| Publication action | Mercur Editorial publication control | Full-page editors save drafts only; lists and contextual widgets link to the same publication action |

Before adding any field, update this ownership map with: property name, canonical owner, authoritative
editor route, backing API, consumer and read-only appearances. CI and review should reject overlapping
routine editors. If ownership is unresolved, the field remains read-only or hidden until a governed
decision is approved.

### Complete proposed control matrix

Status meanings: **Live** = writable control and intended consumer exist in staging; **Partial** =
control or consumer exists but the full loop is incomplete; **Pending** = proposed, not implemented;
**Read-only** = intentionally has no routine write control.

#### Editorial and storefront presentation

| Element/property | Canonical owner | One writable control | Other appearances | Status |
|---|---|---|---|---|
| Environment | Deployment platform | Deployment configuration only | Permanent Staging/Production label in the console | Read-only in UI |
| Active channel | Content context | Global Mercur Editorial channel selector | Included in list filters, editor header and preview | Partial; `b2c` delivery exists |
| Active locale | CMS localized record | Global Mercur Editorial locale selector | Included in list filters, editor header and preview | Live for `en-IN`/`hi-IN` records |
| Publication status | CMS document lifecycle | Mercur Editorial document publication action | Status badge and read-only summary elsewhere | Live |
| Banner title/body/CTA | CMS | Mercur Editorial > Banner editor | Layout and storefront previews are read-only | Live |
| Banner placement/audience/priority | CMS | Mercur Editorial > Banner editor | Overview/list filters and layout references are read-only | Live; segments excluded |
| Banner start/end schedule | CMS | Mercur Editorial > Banner editor | Upcoming calendar/overview is read-only | Partial; timezone semantics pending |
| Banner image reference and alt text | CMS | Mercur Editorial > Banner editor | Layout and app render only | Partial; URL supported, governed alt-text control to verify |
| Banner media asset | Future DAM | Future asset picker inside Banner editor | Strapi media browser and raw URL become migration/break-glass only | Pending |
| Banner theme | CMS using governed allowlist | Banner editor theme selector | App resolves key to design-system treatment | Partial |
| Hero title/subtitle/theme | CMS | Banner editor for `home.hero` | Home layout references and app render only | Live |
| Hero image | CMS | Same `home.hero` Banner editor | App render only | Partial; app consumer pending |
| Campaign-strip content/image/action | CMS | Banner editor for `home.campaign-strip` | App render only | Live |
| Banner segment targeting | Unapproved | No routine control until targeting/privacy contract exists | Hide unsupported field or label not delivered | Pending |
| Layout module order/configuration | CMS | Future Mercur Editorial Layout builder | Overview and previews are read-only | Partial; raw JSON exists, app ordering remains local |
| Layout banner/collection references | CMS composition | Layout builder reference selector | Referenced record properties open in their own editor | Partial |
| Category display label/short text/icon/image | CMS | Category presentation editor | Native Medusa Category page shows status/link only | Live for root presentation |
| Category-specific banner composition | CMS | Category presentation editor | App category page renders published projection | Partial |
| Product subtitle/guidance/SEO | CMS | Product editorial editor | Native product page shows coverage/status/link only | Partial; app consumer pending |
| Curated collection title/copy/reference | CMS | Curated collection editor | Layout builder selects the reference key | Partial |
| Curated product membership | Commerce/Medusa | Native Medusa Collection editor | CMS shows selected collection read-only; no `productIds` editor | Pending correction |
| FAQ/help/policy editorial content | CMS | Help/article editor | Customer app renders published projection | Partial; app consumer pending |
| Icon and theme allowlists | Governed app/design configuration | Reviewed code/configuration change | Editors expose selectors, never free-form values | Partial |
| Draft preview | Experience projection | Preview action in the authoritative content editor | Other pages link to the same preview | Pending |
| Change comparison | CMS/Experience projection | Review step in the authoritative content editor | Publication confirmation summarizes the result | Pending |
| Delivery freshness/source | Experience API | No content write control; diagnostics refresh action only | Merchandising overview and audit detail | Pending operator view |
| CMS mutation history | Audit store | No edit control | Read-only history from the content detail | Audit capture live; UI pending |
| Governed fallback content | Reviewed source configuration | Change contract plus reviewed code/config update | Diagnostics identify when fallback is active | Read-only to routine editors |

#### Commerce, marketplace and finance

| Element/property | Canonical owner | One writable control | Other appearances | Status |
|---|---|---|---|---|
| Category identity/handle/hierarchy | Commerce/Medusa | Native Medusa Category editor | CMS presentation editor receives read-only identity | Live |
| Category commerce membership | Commerce/Medusa | Native Medusa category/product controls | CMS cannot add/remove products | Live |
| Product identity and master data | Commerce/Medusa | Native Mercur/Medusa Product editor | CMS product editorial shows read-only identity | Live |
| Variants and SKUs | Commerce/Medusa | Native Product/Variant editor | CMS and layouts are read-only | Live |
| Seller offer | Marketplace/Mercur | Native Offer editor | Product/editorial/merchandising views are read-only | Live |
| Offer price | Marketplace/Mercur | Native Offer/price control | CMS banners cannot define prices or discounts | Live |
| B2B price lists | Commerce/Medusa | Native Price List editor | App and CMS consume/display calculated result only | Control live; app application pending |
| Inventory availability and stock movement | ERP/Tryton | Tryton inventory operation | Medusa/Mercur consumes projection and shows status | Governance/integration pending; avoid parallel writes |
| Promotion mechanics/eligibility/limits | Commerce/Medusa | Native Promotion editor | Merchandising overview and banners link/read only | Live |
| Campaign grouping/budget/activation | Commerce/Medusa | Native Campaign editor | Merchandising overview and CMS content link/read only | Live in staging scope |
| Staging bootstrap configuration | Governed configuration | Reviewed fixture/seed change creates native records | No routine preset UI; operators use the resulting native records | Staging/test only |
| Seller identity/lifecycle/team | Marketplace/Mercur | Native Seller controls | Orders, offers and finance display read-only seller data | Live |
| Customer/customer-group data | Commerce/Medusa | Native Customer controls | Editorial targeting may reference approved groups only | Live; targeting use pending |
| Cart and checkout state | Commerce | Customer journey/API workflow | Admin/CMS may inspect but cannot edit editorially | Prototype/staging |
| Order lifecycle | Commerce/Medusa | Native Order workflows | CMS has no control | Live staging controls |
| Fulfilment/returns/refunds | Commerce plus providers | Native order/fulfilment workflows | CMS has no control | Provider readiness varies |
| Shipping options/profiles | Commerce/Medusa | Native Shipping controls | Storefront consumes eligible options | Live staging controls |
| Regions and tax configuration | Commerce/Medusa plus approved tax policy | Native Region/Tax controls | CMS has no control | Requires Finance/Tax approval for production |
| Commission rates/rules | Marketplace/Mercur | Native Commission controls | Settlement views consume calculated lines | Live staging presets; production terms unapproved |
| Settlement statement | Marketplace finance projection | No write control in current staging slice | Custom statement page is read-only | Read-only fixture |
| Payout execution | Marketplace/payment provider | Future approved payout workflow | Statement and reconciliation pages read-only | Disabled/pending production design |
| B2B credit/MOQ/approval rules | Commerce | Future native commerce workflow | CMS may explain the rule but cannot set it | Separate pending change |
| Payment execution | Payment provider/integration | Provider-backed payment workflow | Admin shows evidence/status; CMS has no control | Simulation only |

#### Access, governance and platform controls

| Element/property | Canonical owner | One writable control | Other appearances | Status |
|---|---|---|---|---|
| Edge access eligibility | Identity/security platform | Cloudflare Access or approved equivalent | Mercur displays no duplicate edge-access switch | Pending |
| Admin capability role | Medusa/Mercur identity and RBAC | Authorized user/role administration | UI visibility mirrors but does not replace server authorization | Partial; hardening pending |
| Content author/publisher permission | Medusa facade plus CMS boundary | Same authorized role administration | Content screens only reflect granted capability | Pending least-privilege split |
| Strapi break-glass access | Security operations | Audited emergency-access procedure | Not linked as a routine editor | Private/live, process hardening pending |
| CMS schema/allowed fields | Application/CMS engineering | Reviewed schema and facade-definition change | Operator forms are generated from approved definition | Live boundary; changes governed |
| CMS/API secrets and signing keys | Deployment secret store | Server-side secret management | Never displayed in browser or API payload | Live staging boundary |
| Webhook processing/replay state | Experience integration | Automated signed webhook receiver | Diagnostics are read-only | Live |
| Projection cache/invalidation | Experience API | Automated cache policy | Operator diagnostics and bounded refresh action only | Live backend; UI pending |
| Production release authorization | Human release authority | Governed approval record | Admin shows status but cannot self-authorize | Explicitly false |

Where the current system violates this matrix, the first change is to remove or disable the competing
write control. A second control must not be retained merely for convenience.

## 4. Recommended information architecture

### Merchandising overview

Make the overview an operational dashboard rather than a link directory.

| Section | Shows | Primary actions |
|---|---|---|
| Needs attention | Modified drafts, validation failures, expired/scheduled items | Review draft, fix issue |
| Live storefront | Active hero, campaign strip, layout and category presentation by channel/locale | Preview live |
| Upcoming | Scheduled starts/ends in the operator's timezone | Review schedule |
| Delivery health | CMS connectivity, projection freshness, last webhook, last successful refresh | Inspect diagnostics |
| Commerce configuration | Links to Promotions, Campaigns and Collections | Open native Medusa editor |

The page must clearly show **Staging**, selected **channel** (`b2c`/`b2b`) and **locale** (`en-IN`/
`hi-IN`). Environment cannot be inferred only from the URL or badge colour.

### Content library

Replace the current six large selector buttons and basic table with a native searchable data table:

- persistent content-type navigation or tabs;
- search by title/key;
- filters for status, locale, channel, placement and schedule;
- pagination and stable URL query parameters;
- sortable updated/published timestamps;
- status text plus badge;
- row action menu for Edit, Preview, Duplicate to locale, Publish/Unpublish and View history;
- empty, loading, permission-denied and CMS-unavailable states with recovery guidance.

Use a route-based full-page editor for every governed content type. This keeps browser history, deep
links, refreshes and unsaved-change protection predictable while leaving enough space for future
preview and validation. Routine fields appear first; permissioned advanced/recovery fields remain
separate and visually subordinate.

### Native commerce pages

Add only contextual, read-only editorial widgets or rows to native product/category/campaign pages:

- editorial coverage and publication status;
- active locale/channel;
- link to the matching editorial document;
- warning when a commerce record has no required presentation;
- no duplicated CMS form and no CMS-owned commerce field.

## 5. Content-type controls

| Content type | Routine editor | Recommended controls | Ownership guardrail |
|---|---|---|---|
| Banner | Full-page editor | placement, audience, locale, copy, CTA, approved theme, image reference/alt text, priority, start/end, preview | Cannot define discount eligibility or price |
| Storefront layout | Full page module builder | approved module palette, reorder, references, per-module validation, responsive preview | Stores references/composition only |
| Category presentation | Full-page editor from content or category context | read-only Medusa category, display label, short text, icon allowlist, image/alt text | Category id, hierarchy and membership remain Medusa-owned |
| Product editorial | Full-page editor from product context | read-only product identity, subtitle, guidance, SEO, locale completeness | SKU, variants, offers, price and stock remain commerce-owned |
| Curated collection | Full detail page | key, copy, commerce-collection reference and missing-reference validation | Must not expose a second editable product-membership list |
| Help/article | Full-page editor | title, summary, body, audience, locale, preview and links | No transactional outcomes or policy invention without approval |

Raw JSON remains available only in a permissioned advanced/recovery view until the governed layout
module builder exists. It must not be the routine editing experience.

## 6. Editing and publication workflow

### Immediate lifecycle (uses existing Strapi publication model)

1. **Edit draft** — save without changing storefront delivery.
2. **Validate** — schema, required fields, HTTPS assets, allowlisted icons/themes, references, schedule,
   locale and channel.
3. **Preview** — request a non-public preview projection from the Experience API using the draft plus
   the same composition/fallback rules as live delivery.
4. **Review change summary** — compare draft against current published values at field and module
   level; identify additions, removals and schedule changes.
5. **Publish/unpublish** — server-authorized confirmation with impact text and optional reason.
6. **Verify delivery** — show webhook acceptance, projection refresh and the last delivered version.

Add optimistic concurrency using an expected `updatedAt` or revision token. A stale edit must stop and
offer reload/reconcile; it must never silently overwrite another operator's work.

### Later lifecycle (only after current flow is proven)

Introduce Author -> In review -> Approved -> Scheduled/Published only if real staffing requires a
two-person control. Do not simulate approval using a UI badge. Any added state must be stored,
permissioned, audited and enforced by the publication API.

## 7. Roles and permissions

Proposed least-privilege roles:

| Role | Read | Draft | Submit/review | Publish/unpublish | Configure schemas/access |
|---|---:|---:|---:|---:|---:|
| Content viewer/auditor | Yes | No | No | No | No |
| Content editor | Yes | Yes | Submit only when enabled | No | No |
| Content publisher | Yes | Yes | Yes | Yes | No |
| Content administrator | Yes | Yes | Yes | Yes | Bounded content administration |

Enforce permissions in Medusa middleware/facade and again at the private CMS boundary. Hiding a button
is not authorization. Read the actor from authenticated request context; never accept actor or owner
identity from the request body. Retain correlation id, actor, action, locale, document, payload hash,
result and timestamp in the audit record.

Before broader operator exposure, add Cloudflare Access (or the approved equivalent), explicit role
mapping, short session lifetime, revocation testing and break-glass access logging.

## 8. Delivery and resilience controls

- Continue serving only published CMS content publicly.
- Keep signed, replay-safe webhook invalidation and idempotent mutation handling.
- Keep last-valid projection and governed fallback behavior; expose which source is active to
  authorized operators.
- Show `source`, `stale`, projection version, fetched time and last successful refresh in diagnostics.
- An unpublish must revoke matching last-valid content; it must not unexpectedly resurrect seed data.
- Validate external assets server-side and avoid exposing the private CMS origin.
- A failed CMS edit/publish must not affect cart, checkout, orders or other commerce availability.
- Production must retain human authorization and rollback evidence; no admin action can self-authorize
  a production deployment.

## 9. Remaining-item disposition

| Current item | Recommended treatment | Phase |
|---|---|---:|
| Hero image not rendered | Render `image_uri` with accessible image treatment and governed fallback; add visual/golden tests | 2 |
| Home module order is local | Make published storefront layout the preferred composition source; retain approved fallback | 2 |
| Product editorial unused | Define Experience API projection and product-detail consumer before calling the CMS control complete | 2 |
| FAQ/help unused | Define app-shell/help projection and app consumer; preserve locale fallback | 2 |
| Curated collection product ids not enforced | Remove/hide the competing CMS membership control; reference the authoritative Medusa collection and validate missing ids | 2 |
| Banner segments/timezone ignored | Hide unsupported fields now or label them not delivered; implement only with an approved targeting/privacy model | 3 |
| Category-banner component path inconsistent | Remove the unused path or add it to the approved layout palette after contract tests | 1 |
| Draft preview unavailable | Add authenticated preview projection and side-by-side mobile/web preview | 2 |
| Media upload/DAM absent | Continue HTTPS references; separately approve DAM, file policy, moderation and lifecycle | 3 |
| RBAC and edge access incomplete | Required before broader operator access, independent of visual refinement | 1 |
| B2B pricing/credit/MOQ gaps | Separate commerce change contract; never solve through CMS | Separate |
| Payment and browser push gaps | Separate provider/experience workstreams | Separate |
| Production release | Human release decision after security, QA, restore and rollback evidence | 4 |

Unsupported controls should be hidden or clearly marked **not delivered to the app**. Do not let an
operator believe a saved field affects customers when no consumer exists.

## 10. Phased implementation

### Phase 0 — approve scope and baseline

- Human approves CHG-036 scope, role model and priority order.
- Human approves the property-level control-ownership map; duplicate editable controls are identified
  for removal or conversion to read-only context.
- Observe representative editor/publisher tasks and record current completion time and errors.
- Confirm native Mercur extension targets and add operator components to the implementation registry.
- Produce reviewed low-fidelity flows for overview, library, editor, preview and publication.

**Checkpoint:** approve information architecture and workflow before code.

### Phase 1 — safety and operational clarity

- DataTable search/filter/pagination and URL state.
- Remove overlapping controls and make contextual values link to their one authoritative editor.
- Routed editors, unsaved-change guard and concurrency token.
- Server-enforced content roles.
- Better validation/error summary and truthful unsupported-field labeling.
- Delivery-health panel and audit-history view.
- Accessibility baseline and automated checks.

**Checkpoint:** authenticated staging review with editor and publisher roles.

### Phase 2 — complete customer delivery

- Authenticated draft preview generated by the Experience API.
- Hero image delivery.
- Layout-driven home composition.
- Product editorial, FAQ/help and curated membership consumers.
- End-to-end contract, app and visual tests for every content control.

**Checkpoint:** demonstrate CMS draft -> preview -> publish -> app -> unpublish for each content type.

### Phase 3 — scale and editorial efficiency

- Governed visual module builder replacing routine raw JSON.
- Locale duplication/completeness, bulk operations and scheduling calendar.
- Approved DAM/media workflow.
- Targeting/segmentation only after privacy, consent and fallback decisions.
- Optional two-person approval workflow backed by server state.

**Checkpoint:** content governance, security and accessibility review.

### Phase 4 — production readiness

- Edge access and least-privilege evidence.
- Backup/restore and rollback rehearsal.
- Load, failure, webhook replay and stale-projection tests.
- Operator runbook and break-glass drill.
- Human release approval; `production_release_authorized` remains false until then.

## 11. Acceptance evidence

For each implemented phase, retain:

- screenshots or recordings of the reviewed operator journey;
- API contract and RBAC tests;
- accessibility report;
- CMS audit rows and correlation ids for reversible test content;
- preview/live payload comparison;
- customer-app visual and fallback tests;
- CMS outage, stale cache, publish and unpublish evidence;
- staging deployment, rollback and service-health evidence;
- explicit human approval record.
- a control-ownership test showing that each governed property resolves to one routine editor route.

## 12. Out of scope for this approach

- Changing canonical entity ownership.
- Implementing B2B pricing, credit, MOQ, payments, payout or settlement rules.
- Public Strapi access or browser-held CMS credentials.
- Production data migration or production release.
- Selecting a DAM, payment provider or customer-targeting platform without a separate decision.
