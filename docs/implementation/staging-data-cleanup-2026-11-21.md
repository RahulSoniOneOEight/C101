# Staging transactional data cleanup — 2026-11-21

Status: **applied on staging** · catalogue, sellers, CMS, COD configuration and pilot access
preserved · production untouched.

## 1. Scope

Removed test transactional data ahead of production preparation:

- orders, order groups, carts, payments, sessions, returns, fulfilments, reservations
- customers
- experience correlations, COD collections/events, dues, guest requests, notifications, events
- workspace channels, messages, workspaces, drafts, proposals, approvals

Kept:

- 348 products, 6 sellers, price lists, delivery rates
- 6 COD seller policies and commission rules
- CMS content and 112 banners
- 21 pilot access assignments and admin users
- all schemas and configuration

## 2. Before / after

| Data | Before | After |
|---|---:|---:|
| Orders | 142 | 0 |
| Carts | 544 | 0 |
| Customers | 132 | 0 |
| Products | 348 | 348 |
| Sellers | 6 | 6 |
| Shipping options | 15 | 15 |
| Service zones | 5 | 5 |
| Fulfillment sets | 6 | 6 |
| Geo zones | 5 | 5 |
| Experience correlations | 395 | 0 |
| COD collections | 7 | 0 |
| COD policies | 6 | 6 |
| Pilot access assignments | 21 | 21 |
| Workspaces / messages / drafts | 7 / 95 / 7 | 0 / 0 / 0 |
| CMS banners | 112 | 112 |

## 3. Incident during cleanup

The first Medusa cleanup used a broad `TRUNCATE ... CASCADE`. Postgres followed foreign keys into
delivery configuration and removed:

```text
shipping_option, service_zone, geo_zone, fulfillment_set
```

The full encrypted backup taken immediately before the cleanup was used to restore the `buildkart`
database. Configuration and orders were verified back:

```text
shipping_option=15
service_zone=5
geo_zone=5
fulfillment_set=6
orders=142
```

The cleanup was then repeated with only transactional tables in the truncate list. Configuration was
preserved and all transactional counts returned to zero.

## 4. Verification

- Storefront checkout smoke after cleanup: product, cart, delivery fee ₹99, total ₹479, Razorpay and
  Cash on delivery options all render; zero page errors.
- The smoke cart was cleared afterwards; orders and carts are zero.
- `/health` 200, web 200, admin login 200 after the proxy restart.
- Proxy had to be restarted after the services were stopped/started so nginx re-resolved upstreams.

## 5. Production note

This cleanup only cleans staging. Production must still be bootstrapped from an approved master-data
export:

```text
catalogue + sellers + price lists + delivery rates + CMS + COD policies
```

Never restore the staging database wholesale into production.

## 6. Backup

Encrypted backup used for the restore:

```text
buildkart-20261120T192624Z.dump.age
buildkart_experience-20261120T192624Z.dump.age
bazarbee_workspace-20261120T192624Z.dump.age
buildkart_tryton-20261120T192624Z.dump.age
buildkart_cms-20261120T192624Z.dump.age
```
