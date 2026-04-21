# Backup & Restore

## Routine backups

Add to crontab on the host:

```cron
# Nightly DB + uploads backup at 02:30
30 2 * * * cd /opt/taskmaster && ./scripts/backup.sh >> /var/log/taskmaster-backup.log 2>&1
```

`backup.sh` writes to `./backups/` and keeps the most recent 14 of each type.
Adjust retention by editing the `tail -n +15` lines in the script.

## Off-host copies

Sync `./backups/` to your enterprise backup target:

```bash
# Example: rsync to a backup host
rsync -az ./backups/ backup-host:/backups/taskmaster/
```

Or pipe `pg_dump` directly to your S3-compatible target — the upgrade flow
only relies on `./backups/.last-backup` for automatic rollback, not for DR.

## Restore

```bash
./scripts/restore.sh ./backups/db-20260101-023000.sql.gz \
                     ./backups/uploads-20260101-023000.tar.gz
```

The script stops application services (DB stays up), wipes uploads,
re-imports the DB dump, restores files, and restarts the stack.

## DR drill (recommended quarterly)

1. Provision a clone host with the same OS and Docker version.
2. Copy `.env`, `tls/`, `bundles/`, and the latest backup pair.
3. Run `./scripts/install.sh` (it will skip migrations the dump already has).
4. Run `./scripts/restore.sh <db> <uploads>`.
5. Confirm `./scripts/healthcheck.sh` passes.
6. Document RTO/RPO observed.

## What's NOT in backups

- `bundles/` (re-downloadable from your release server)
- `tls/` (re-issuable)
- `.env` (must be backed up separately to a secrets vault)
- Ollama model weights (re-downloadable; ~5–20 GB depending on model)
