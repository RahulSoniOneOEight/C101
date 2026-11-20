# Cloudflare Access provisioning — 2026-11-21

Status: **partially provisioned** · Access enabled, zone pending nameserver change · apps not yet
created.

## 1. Completed

- Connected with the account-scoped API token.
- Enabled Zero Trust / Access for the account.
- Team domain: `bazarbee.cloudflareaccess.com`.
- Added the `gobazarbee.com` zone; status `pending`.
- Seeded the live DNS records:
  - `A @` → `89.116.20.164`, proxied
  - `A www` → `89.116.20.164`, proxied
  - Google site-verification TXT, DNS only
- Set zone SSL mode to `strict`.
- Cloudflare nameservers assigned:
  - `jillian.ns.cloudflare.com`
  - `odin.ns.cloudflare.com`
- Created three Access groups:

```text
BazarBee Staff    8402ec6c-94db-4b02-ae31-4af4e2886f97
BazarBee Sellers  526ab49c-3701-49e8-aa43-7c5d4bd1bbb0
BazarBee ERP      5ce76749-9f8e-46b2-bb52-2ff6804c79d8
```

Group membership currently uses staging test identities:

- Staff: `gobazarbee@gmail.com`, email domain `gobazarbee.com`
- Sellers: `owner.seller01`, `orders.seller01`, `catalog.seller01`, `owner.seller02`,
  `orders.seller02` at `buildkart.test`
- ERP: `erp.ops01`, `finance.ops01`, `superadmin01` at `buildkart.test`

## 2. Blocked

Access application creation returned:

```text
access.api.error.invalid_request: domain does not belong to zone
```

The `gobazarbee.com` zone is still **pending** because its nameservers at Hostinger have not been
changed. Access will not attach an app to a hostname in a pending zone.

The current ops host `ops-staging.pinakaplay.cloud` is on `pinakaplay.cloud`, which is not in this
Cloudflare account at all.

## 3. Next actions

1. At Hostinger, change `gobazarbee.com` nameservers to the Cloudflare pair above.
2. Wait for the zone status to become `active`.
3. Create the apps:

```text
ops.gobazarbee.com/dashboard  → BazarBee Staff   8h
ops.gobazarbee.com/seller      → BazarBee Sellers 12h
ops.gobazarbee.com/erp         → BazarBee ERP    8h
```

4. Point `ops.gobazarbee.com` at the proxy through Cloudflare.
5. Add Google Workspace or Entra as the IdP and map the groups.
6. Restrict the origin firewall to Cloudflare ranges.

## 4. Security note

The API token from the Desktop file was used only for account/zone/Access setup. It was not printed
or committed. R2 access keys in the same file were not used.

Until the zone is active, admin/seller/ERP remain protected only by nginx and application passwords.
