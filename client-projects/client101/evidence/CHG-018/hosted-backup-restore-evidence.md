# Hosted Staging Backup / Restore Evidence

**Date:** 08 October 2026
**Scope:** Bounded hosted-staging pilot on the Hostinger VPS (`srv2040286`, `89.116.20.164`)
**Change Contract:** CHG-018 (hosted pilot), supporting CHG-020 gate `backup-recovery`
**Status:** Backup and restore proven on the hosted topology

## Method

- Tooling: `services/hosted/scripts/backup-postgres.sh` and `services/hosted/scripts/restore-proof.sh`.
- Encryption: `age`; keypair stored root-only at `/etc/buildkart/backup-age-identity` (private) and
  `/etc/buildkart/backup-age-recipient` (public). Keys are never committed.
- Databases: `buildkart` (Medusa/Mercur), `buildkart_experience` (Experience API), `buildkart_tryton` (ERP).

## Result

```
Encrypted PostgreSQL backup completed: 20261008T192842Z
/var/backups/buildkart/buildkart-20261008T192842Z.dump.age             658 KB
/var/backups/buildkart/buildkart_experience-20261008T192842Z.dump.age   22 KB
/var/backups/buildkart/buildkart_tryton-20261008T192842Z.dump.age     1.1 MB
Restore proof passed for buildkart_restore_proof_20261008192844 with 8 public tables.
```

The restore proof decrypts the encrypted dump, creates a throwaway database, restores with
`--no-owner --no-privileges`, asserts the public table count is non-zero, then drops the throwaway
database. This satisfies "a backup is not accepted until a restore has succeeded".

## Scheduling

- `buildkart-backup.timer` (systemd) runs `buildkart-backup.service` daily at 02:30 UTC with a
  randomized delay; `Persistent=true` catches up after downtime.
- Retention: the backup script deletes `*.dump.age` older than 14 days.

## Boundaries

- Staging synthetic data only. No production data is involved.
- Encryption keys and encrypted dumps stay on the host and are not committed.
- Numeric production RPO/RTO for a production transition remain unapproved (CHG-020).

## Residual

- Off-host/offsite replication of encrypted dumps is not yet configured; dumps currently live on the
  same VPS. Recommended before any production transition.
