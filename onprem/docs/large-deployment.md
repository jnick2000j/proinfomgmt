# Large Tier Deployment — A1 vs A2

Step-by-step configuration checklist for the two single-host topology
variants. Both are **Topology A** (single app host, no HA) but differ in
where the Postgres container runs.

- **A1** — everything on one VM (500–1,200 users)
- **A2** — Postgres container on its own VM (1,200–2,000 users)

See [prerequisites.md](./prerequisites.md) for sizing and
[scaling-ha.md](./scaling-ha.md) for the next step (Topology B+).

---

## A1 — fully co-located (single VM)

One 16 vCPU / 32 GB / 500 GB VM. Postgres co-located with the rest of
the stack. Runs the **default** `docker-compose.yml`.

### 1. Provision the VM

```bash
sudo apt-get update && sudo apt-get install -y docker.io docker-compose-plugin
sudo mkdir -p /opt/taskmaster && sudo chown $USER /opt/taskmaster
cd /opt/taskmaster
tar -xzf taskmaster-onprem-vX.Y.Z.tar.gz
```

### 2. `.env` (A1 — single VM)

```env
# --- Public URL ---
DOMAIN=taskmaster.example.com
PROTOCOL=https
PUBLIC_URL=${PROTOCOL}://${DOMAIN}

# --- Postgres (co-located, defaults to the bundled `db` container) ---
DB_EMBEDDED=true
POSTGRES_DB=postgres
POSTGRES_USER=postgres
POSTGRES_PASSWORD=<openssl rand -hex 24>

# --- Auth ---
JWT_SECRET=<openssl rand -hex 64>
JWT_EXPIRY=3600

# --- License ---
LICENSE_KEY=<from your account team>

# --- AI provider ---
AI_PROVIDER=ollama                # or openai / anthropic / azure
AI_BASE_URL=http://ollama:11434
AI_DEFAULT_MODEL=llama3.1:8b

# --- SMTP ---
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=notifications@example.com
SMTP_PASSWORD=<smtp password>
SMTP_FROM="TaskMaster <notifications@example.com>"
SMTP_TLS=true

# --- Storage (local FS is fine at A1) ---
STORAGE_DRIVER=file
STORAGE_PATH=/var/lib/taskmaster/storage

# --- Bootstrap admin ---
FIRST_ADMIN_EMAIL=admin@example.com
```

### 3. Bring up the stack

```bash
# Optional: enable the bundled Ollama (skip if using an external provider)
docker compose --profile ollama up -d

# Otherwise:
docker compose up -d
```

### 4. Verify

```bash
./scripts/healthcheck.sh                         # all green
docker compose ps                                # 7 services Up (8 with ollama)
curl -fsS https://$DOMAIN/healthz                # 200 OK
```

### A1 checklist

- [ ] VM provisioned (16 vCPU / 32 GB / 500 GB SSD)
- [ ] Docker 24+ and Compose v2 installed
- [ ] `.env` populated (above)
- [ ] TLS certs at `tls/fullchain.pem` and `tls/privkey.pem`
- [ ] `docker compose up -d` completed without errors
- [ ] `healthcheck.sh` passes
- [ ] Bootstrap admin can log in via password reset
- [ ] Cron entry for `scripts/backup.sh` (see [backup-restore.md](./backup-restore.md))

---

## A2 — Postgres on its own VM (two VMs)

Two VMs:

| Role  | Sizing                                   | What runs there                                   |
|-------|------------------------------------------|---------------------------------------------------|
| App VM| 12 vCPU / 24 GB / 100 GB                 | `web`, `kong`, `auth`, `edge`, `realtime`, `storage` (and optionally `ollama`) |
| DB VM | 8 vCPU / 32 GB / 500 GB NVMe             | `db` container only (or a managed Postgres 15)    |

The two VMs must be on the **same private network** with port 5432
reachable App → DB only (firewall it off from the public internet).

### 1. Provision both VMs

Same OS / Docker setup as A1 on each. On both VMs:

```bash
sudo mkdir -p /opt/taskmaster && sudo chown $USER /opt/taskmaster
cd /opt/taskmaster
tar -xzf taskmaster-onprem-vX.Y.Z.tar.gz
```

### 2. DB VM — `.env.db`

```env
POSTGRES_DB=postgres
POSTGRES_USER=postgres
POSTGRES_PASSWORD=<openssl rand -hex 24>     # MUST match the App VM .env
JWT_SECRET=<same JWT_SECRET as App VM>
POSTGRES_PORT=5432
```

### 3. DB VM — start Postgres only

A separate compose file (`docker-compose.db.yml`) ships in the bundle
and runs **only** the `db` service, exposing port 5432 on the private
network:

```bash
cd /opt/taskmaster
docker compose --env-file .env.db -f docker-compose.db.yml up -d
docker compose -f docker-compose.db.yml ps         # db should be Up + healthy
```

Verify from the App VM:

```bash
psql "postgres://postgres:<password>@db.internal:5432/postgres" -c "select 1;"
```

### 4. App VM — `.env`

```env
# --- Public URL ---
DOMAIN=taskmaster.example.com
PROTOCOL=https
PUBLIC_URL=${PROTOCOL}://${DOMAIN}

# --- Postgres (EXTERNAL — running on the DB VM) ---
DB_EMBEDDED=false                       # disables the bundled `db` service
POSTGRES_HOST=db.internal               # private DNS / IP of the DB VM
POSTGRES_PORT=5432
POSTGRES_DB=postgres
POSTGRES_USER=postgres
POSTGRES_PASSWORD=<same as DB VM>

# --- Auth ---
JWT_SECRET=<same as DB VM>
JWT_EXPIRY=3600

# --- License ---
LICENSE_KEY=<from your account team>

# --- AI provider (Ollama on the App VM if it has a GPU; otherwise external) ---
AI_PROVIDER=ollama
AI_BASE_URL=http://ollama:11434
AI_DEFAULT_MODEL=llama3.1:8b

# --- SMTP ---
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=notifications@example.com
SMTP_PASSWORD=<smtp password>
SMTP_FROM="TaskMaster <notifications@example.com>"
SMTP_TLS=true

# --- Storage (S3 RECOMMENDED at A2 for simpler backups; FS still works) ---
STORAGE_DRIVER=s3
STORAGE_S3_ENDPOINT=https://minio.internal:9000   # omit for AWS S3
STORAGE_S3_BUCKET=taskmaster-uploads
STORAGE_S3_REGION=us-east-1
STORAGE_S3_ACCESS_KEY=<key>
STORAGE_S3_SECRET_KEY=<secret>

# --- Bootstrap admin ---
FIRST_ADMIN_EMAIL=admin@example.com
```

### 5. App VM — start app services only

The bundled `docker-compose.yml` reads `DB_EMBEDDED=false` and skips
the `db` service. Bring up everything else:

```bash
cd /opt/taskmaster
docker compose up -d                              # starts all services except `db`
# Or, if you prefer to be explicit:
docker compose up -d web kong auth edge realtime storage
docker compose --profile ollama up -d ollama     # if using bundled Ollama
```

### 6. Verify

On the App VM:

```bash
./scripts/healthcheck.sh                         # all green
curl -fsS https://$DOMAIN/healthz                # 200 OK
docker compose exec edge sh -c \
  "psql \$POSTGRES_HOST -U \$POSTGRES_USER -c 'select count(*) from auth.users;'"
```

### A2 checklist

- [ ] Two VMs provisioned with private networking between them
- [ ] DB VM firewalled to allow port 5432 **only** from the App VM
- [ ] `POSTGRES_PASSWORD` and `JWT_SECRET` identical on both VMs
- [ ] DB VM: `docker compose -f docker-compose.db.yml up -d` healthy
- [ ] App VM: `psql` from app to DB succeeds
- [ ] App VM: `DB_EMBEDDED=false` and `POSTGRES_HOST=db.internal` set
- [ ] App VM: `docker compose up -d` completed without errors
- [ ] S3 / MinIO bucket created and reachable from the App VM
- [ ] `healthcheck.sh` passes on the App VM
- [ ] Cron entry for `scripts/backup.sh` on the **DB VM** (not the App VM)

---

## Migrating A1 → A2 (in place)

You can split Postgres off later without losing data. Plan a 15-minute
window:

```bash
# On the App VM (current A1 host):
docker compose down
docker compose run --rm db pg_dumpall -U postgres > /tmp/all.sql
scp /tmp/all.sql db.internal:/tmp/all.sql

# On the new DB VM:
docker compose --env-file .env.db -f docker-compose.db.yml up -d
docker compose -f docker-compose.db.yml exec -T db \
  psql -U postgres < /tmp/all.sql

# Back on the App VM, edit .env:
#   DB_EMBEDDED=false
#   POSTGRES_HOST=db.internal
docker compose up -d                             # `db` stays down because DB_EMBEDDED=false
./scripts/healthcheck.sh
```

If the migration succeeds, delete the old `db-data` volume on the App
VM after a few days of clean running:

```bash
docker volume rm taskmaster_db-data
```
