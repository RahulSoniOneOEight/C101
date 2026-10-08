# BuildKart Hosted-Pilot RBAC Decision Pack

**Change Contract:** `CHG-019`
**Revision:** 1
**Status:** Approved for bounded hosted-staging RBAC
**Scope:** Server-owned RBAC for 20 synthetic hosted-staging identities only

## Decision requested

Approve or amend the role boundaries below. Approval permits RBAC implementation and tests in the
bounded hosted-staging environment. It does not authorize production access or release.

| Decision | Baseline | Required roles |
|---|---|---|
| `D-019-01` Role assignments | Roles, business-account ids and seller ids are loaded from server-owned configuration/state; client claims are ignored | Product, Architecture, Security |
| `D-019-02` Customer/B2B isolation | Customers see only their own resources; B2B users are confined to their business account; buyer/admin/approver duties remain separate | Product, Architecture, Security |
| `D-019-03` Seller isolation | Every seller role is confined to an assigned seller; admin, catalogue and order duties are separately authorized | Architecture, Security, Marketplace |
| `D-019-04` Operations roles | Support, marketplace, ERP and finance roles receive only enumerated domain actions and cannot cross canonical ownership boundaries | Security, Finance, Operations, Integration Owners |
| `D-019-05` Super Admin | Cross-system administration is audited; consequential actions require independent second approval; production remains prohibited | Security, Operations, Release Authority |
| `D-019-06` Route exposure | Privileged routes require application RBAC and Cloudflare Access; databases, Redis, NATS and Tryton remain private | Architecture, Security, Operations |

## Pilot identity mapping

| Identities | Server role | Scope |
|---|---|---|
| `customer.b2c01` through `customer.b2c06` | Customer | Own user resources |
| `buyer.b2b01` | B2B Buyer | Arjun Traders |
| `buyer.b2b02` | B2B Buyer | Shakti Hardware |
| `admin.b2b01` | B2B Account Admin | Arjun Traders |
| `approver.b2b01` | B2B Approver | Arjun Traders |
| `owner.seller01` | Seller Admin | Bharat Electricals |
| `catalog.seller01` | Seller Catalog Manager | Bharat Electricals |
| `orders.seller01` | Seller Order Manager | Bharat Electricals |
| `owner.seller02` | Seller Admin | Reliable Hardware |
| `orders.seller02` | Seller Order Manager | Reliable Hardware |
| `support.ops01` | Support Operator | Cross-account redacted support view |
| `marketplace.ops01` | Marketplace Operator | Marketplace eligibility/allocation only |
| `erp.ops01` | ERP Operator | ATP/reservation/stock only |
| `finance.ops01` | Finance Operator | Payment/refund/reconciliation evidence only |
| `superadmin01` | Super Admin | Audited staging administration |

The full email addresses remain in secure pilot configuration outside Git. This document records
only synthetic aliases and intended scope.

## Deny-by-default requirements

- Unrecognized roles and permissions fail startup or configuration validation.
- A valid session with no assignment receives customer-safe access only when explicitly configured
  as Customer; otherwise it receives no application access.
- No request header or body can supply role, seller or business-account authority.
- Cross-tenant and cross-seller requests return a non-enumerating denial.
- Cloudflare identity does not become application business authority.
- Every privileged mutation records actor, role, scope, correlation id, action and outcome.

## External exposure

Public customer ingress may expose only authenticated customer APIs and required public catalogue
reads. Operator, admin, metrics, Medusa dashboard, Mercur seller dashboard and Tryton surfaces stay
private or behind Cloudflare Access in addition to application authorization.

## Explicitly prohibited

- Production permissions, customer data, providers or release.
- Role escalation from the client.
- Seller-to-seller or business-account-to-business-account access.
- Support access to unredacted secrets or unrestricted customer data.
- Super-admin bypass of canonical owner services or second-approval requirements.
