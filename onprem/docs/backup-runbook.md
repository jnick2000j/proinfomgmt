# Backup & Restore Runbook (A1 / A2)

Operator runbook with the **exact commands** for backup and restore in
the two Large topologies. For the higher-level overview see
[backup-restore.md](./backup-restore.md).

> **Where dumps go.** Default location is `/opt/taskmaster/backups/`
> on whichever VM hosts Postgres (A1: the single VM; A2: the DB VM).
> They are **always** copied off-host afterwards (`rsync` / `aws s3 cp`
> / `mc cp`) — the local copy exists only to make `rollback.sh` fast.

---

## A1 — single-VM backup

Postgres and the app are on the same VM. `scripts/backup.sh` already
does this end-to-end; the commands below are what it runs, broken out
so you can run them by hand when needed.

### Manual full backup

```bash
cd /opt/taskmaster
TS=$(date +%Y%m%d-%H%M%S)
mkdir -p backups

# 1. DB dump (custom format = parallel restore + selective recovery)
docker compose exec -T db pg_dump -U postgres -Fc -d postgres \
  | gzip -9 > backups/db-${TS}.dump.gz

# 2. Uploads (only when STORAGE_DRIVER=file)
docker run --rm \
  -v taskmaster_storage-data:/data:ro \
  -v $PWD/backups:/out \
  alpine tar -czf /out/uploads-${TS}.tar.gz -C /data .

# 3. Off-host copy (REQUIRED — the local backup is not DR)
rsync -az backups/db-${TS}.dump.gz       backup-host:/backups/taskmaster/
rsync -az backups/uploads-${TS}.tar.gz   backup-host:/backups/taskmaster/

# 4. Record this as the rollback target
ln -sf db-${TS}.dump.gz backups/.last-backup
```

### Manual restore (A1)

```bash
cd /opt/taskmaster
DUMP=backups/db-20260101-023000.dump.gz
UPLOADS=backups/uploads-20260101-023000.tar.gz

# 1. Stop app services (keep `db` running)
docker compose stop web kong edge auth realtime storage

# 2. Drop and recreate the database
docker compose exec -T db psql -U postgres -c "DROP DATABASE postgres WITH (FORCE);"
docker compose exec -T db psql -U postgres -c "CREATE DATABASE postgres;"

# 3. Restore the dump (parallel jobs = -j N where N = vCPU)
gunzip -c $DUMP | docker compose exec -T db pg_restore -U postgres -d postgres -j 4

# 4. Restore uploads (skip if STORAGE_DRIVER=s3)
docker run --rm \
  -v taskmaster_storage-data:/data \
  -v $PWD/backups:/in:ro \
  alpine sh -c "rm -rf /data/* && tar -xzf /in/$(basename $UPLOADS) -C /data"

# 5. Restart and verify
docker compose start web kong edge auth realtime storage
./scripts/healthcheck.sh
```

---

## A2 — split-VM backup

Postgres runs on the **DB VM**. All `pg_dump` / `pg_restore` commands
run **there**. Uploads are in S3 (recommended at A2) and don't need a
filesystem dump — just enable bucket versioning + lifecycle rules.

### Manual full backup (run on the DB VM)

```bash
cd /opt/taskmaster
TS=$(date +%Y%m%d-%H%M%S)
mkdir -p backups

# 1. DB dump from the standalone db container
docker compose -f docker-compose.db.yml exec -T db \
  pg_dump -U postgres -Fc -d postgres \
  | gzip -9 > backups/db-${TS}.dump.gz

# 2. Off-host copy (REQUIRED)
rsync -az backups/db-${TS}.dump.gz backup-host:/backups/taskmaster/
# or: aws s3 cp backups/db-${TS}.dump.gz s3://taskmaster-dr/db/

# 3. Record this as the rollback target
ln -sf db-${TS}.dump.gz backups/.last-backup
```

### Uploads backup (A2 with S3)

If `STORAGE_DRIVER=s3`, you do **not** dump uploads to a tarball.
Instead, configure the bucket once:

```bash
# Enable versioning (recovers from accidental delete / overwrite)
aws s3api put-bucket-versioning \
  --bucket taskmaster-uploads \
  --versioning-configuration Status=Enabled

# Lifecycle: keep current + 90 days of non-current versions
aws s3api put-bucket-lifecycle-configuration \
  --bucket taskmaster-uploads \
  --lifecycle-configuration file://onprem/seed/s3-lifecycle.json

# Optional: cross-region replication for true DR
aws s3api put-bucket-replication --bucket taskmaster-uploads \
  --replication-configuration file://onprem/seed/s3-replication.json
```

For MinIO, the equivalent is `mc version enable` + `mc ilm add`.

### Manual restore (A2)

Run **DB steps on the DB VM**, **app restart on the App VM**.

```bash
# --- On the DB VM ---
cd /opt/taskmaster
DUMP=backups/db-20260101-023000.dump.gz

# 1. Drop & recreate (no app to stop on this VM — only the db container)
docker compose -f docker-compose.db.yml exec -T db \
  psql -U postgres -c "DROP DATABASE postgres WITH (FORCE);"
docker compose -f docker-compose.db.yml exec -T db \
  psql -U postgres -c "CREATE DATABASE postgres;"

# 2. Restore
gunzip -c $DUMP \
  | docker compose -f docker-compose.db.yml exec -T db \
      pg_restore -U postgres -d postgres -j 4

# --- On the App VM ---
cd /opt/taskmaster
docker compose restart edge auth realtime storage web kong
./scripts/healthcheck.sh
```

### S3 uploads point-in-time restore

Restore a single object to a previous version:

```bash
aws s3api list-object-versions --bucket taskmaster-uploads --prefix path/to/file
aws s3api copy-object \
  --bucket taskmaster-uploads \
  --copy-source "taskmaster-uploads/path/to/file?versionId=<old-version-id>" \
  --key path/to/file
```

For a full bucket-level rollback to a timestamp, use
`aws s3api list-object-versions` + a script, or restore from your
cross-region replica.

---

## Cron — automated nightly

### A1 (run on the single VM)

```cron
# /etc/cron.d/taskmaster-backup
30 2 * * * root cd /opt/taskmaster && ./scripts/backup.sh >> /var/log/taskmaster-backup.log 2>&1
```

### A2 (run on the DB VM only — not the App VM)

```cron
# /etc/cron.d/taskmaster-backup
30 2 * * * root cd /opt/taskmaster && ./scripts/backup.sh --mode=db-only >> /var/log/taskmaster-backup.log 2>&1
```

`backup.sh --mode=db-only` skips the uploads tarball (S3 bucket
versioning handles that).

---

## Restore drill (REQUIRED — quarterly)

A backup you have not restored is not a backup. Run this every quarter
on a throwaway VM and record RTO/RPO.

### Drill checklist

- [ ] Provision a clone VM with the same OS/Docker version
- [ ] Copy `.env`, `tls/`, `bundles/current/`, and **last night's dump**
- [ ] Run `./scripts/install.sh --skip-migrate` (the dump has the schema)
- [ ] Run the **A1 manual restore** sequence above
- [ ] `./scripts/healthcheck.sh` passes
- [ ] Log in as `FIRST_ADMIN_EMAIL` via password reset
- [ ] Open 3 representative records (a project, a ticket, a KB article) and confirm they render
- [ ] If `STORAGE_DRIVER=file`: open a record with an attachment and confirm it downloads
- [ ] If `STORAGE_DRIVER=s3`: confirm the same against the S3 bucket
- [ ] Record observed **RPO** (age of the dump) and **RTO** (wall-clock from start of restore to healthcheck green)
- [ ] Tear down the clone VM
- [ ] File the drill report in your runbook log

### Target SLOs

| Tier | RPO target  | RTO target  | How to achieve                                     |
|------|-------------|-------------|----------------------------------------------------|
| A1   | 24 h        | 60 min      | Nightly `pg_dump` + off-host rsync                 |
| A2   | 24 h        | 30 min      | Same, plus S3 versioning for uploads               |
| B    | 1 h         | 15 min      | + WAL archiving every 5 min to off-host storage    |
| C    | < 1 min     | < 1 min     | Patroni sync replica + WAL streaming + auto-failover |

---

## What's NOT in backups (you must back these up separately)

- `.env` — store in a secrets vault (Vault / 1Password / AWS Secrets Manager)
- `tls/fullchain.pem` + `tls/privkey.pem` — re-issuable but back them up to avoid an outage during re-issue
- `bundles/current/` — re-downloadable from your release server
- Ollama model weights — re-pullable (~5–20 GB depending on model)
- License JWT (`LICENSE_KEY`) — re-issuable from your account team
