# Workspace database rename and backup fix — 2026-11-20

Status: **applied on staging** · production untouched.

## 1. Rename

`buildkart_workspace` → `bazarbee_workspace` (database only; the `workspace` service, image and
`WORKSPACE_*` variables keep their names).

Why: the workspace database is the only one still carrying the old product name, and it appears in
backup/restore tooling and launch documentation.

Method, without losing data:

1. Stopped `buildkart-hosted-pilot-workspace-1`.
2. Terminated residual backends on the old database.
3. `ALTER DATABASE buildkart_workspace RENAME TO bazarbee_workspace`.
4. Rewrote `WORKSPACE_DATABASE_URL` in `/etc/buildkart/secrets/workspace.env`; the previous file is
   kept as `workspace.env.pre-bazarbee-rename`.
5. Recreated the container (not just restarted) so `env_file` was re-read.

`docker start` was not enough: the container keeps the environment captured at creation time and
crash-looped on the missing old database.

## 2. Verification

Data preserved across the rename:

```text
workspaces=7
messages=95
drafts=7
```

Runtime:

```text
workspace container      Up (healthy)
workspace /health        {"status":"ok","service":"workspace"}
experience-api->workspace ok
api-staging /health      status ok · payment_mode provider · nats connected
```

No remaining live references to the old name in `/etc/buildkart` (except the deliberate
`workspace.env.pre-bazarbee-rename` backup) or in the active compose file.

## 3. Backup fix

`backup-postgres.sh` had two defects that mattered for launch:

- it omitted the workspace database entirely;
- with `set -eu` and a plain pipeline, a failed `pg_dump` still exited 0 through `age`, so a broken
  backup could look valid.

The script now:

- backs up `buildkart`, `buildkart_experience`, `bazarbee_workspace`, `buildkart_tryton`,
  `buildkart_cms` (overridable with `DATABASES`);
- runs under `bash` with `pipefail`;
- rejects an encrypted artifact under 200 bytes and removes it;
- logs per-database byte counts.

Applied to the timer's target (`/opt/buildkart-releases/current/services/hosted/scripts/`), with the
previous file kept as `.pre-bazarbee-rename`.

Proof run:

```text
backed up buildkart (3632738 bytes, encrypted)
backed up buildkart_experience (240254 bytes, encrypted)
backed up bazarbee_workspace (101489 bytes, encrypted)
backed up buildkart_tryton (1161637 bytes, encrypted)
backed up buildkart_cms (362556 bytes, encrypted)
Encrypted PostgreSQL backup completed: 20261120T120821Z
```

Restore proof on the new workspace dump:

```text
Restore proof passed for buildkart_restore_proof_20261120120834 with 14 public tables.
```

## 4. Repo changes

- `services/hosted/scripts/backup-postgres.sh` — new database list, pipefail, size guard.
- `services/hosted/postgres-init/00-create-databases.sql` — creates `bazarbee_workspace`.
- `services/hosted/scripts/seed-web-shared-list.sql` — header comment.
- `services/hosted/README.md` — backup set documented.
- `docs/implementation/bazarbee-pending-2026-11-20.md` — current database list.

`client-projects/client101` CHG-070/CHG-072 evidence still names `buildkart_workspace`. That is a
historical record of what was true at the time and is intentionally not rewritten; this note is the
pointer to the current name.

## 5. Not done

- No code deploy was required; the workspace service image is unchanged.
- Fresh-environment bootstrap still needs a real database-creation step: the init SQL only runs on an
  empty PostgreSQL volume, and `buildkart_workspace` was originally created by hand. Tracked with the
  production launch work.
- Uploads, evidence volume, CMS media, Redis and NATS are still outside the backup set.
