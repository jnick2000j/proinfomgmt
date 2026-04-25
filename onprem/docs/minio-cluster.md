# Distributed MinIO Cluster (4-node HA)

For Large A2 deployments and any setup where object storage cannot be a
single point of failure. This is the supported HA topology — start here
if you can't tolerate losing uploads on a single VM failure.

## Topology

```
                         ┌────────────────┐
                         │  app tier      │
                         │ (2+ nodes,     │
                         │  HAProxy/keepalived) │
                         └────────┬───────┘
                                  │ S3 API (presigned URLs)
                          ┌───────┴────────┐
                          │  L4 load bal.  │
                          │ (HAProxy/F5)   │
                          └───────┬────────┘
                                  │
        ┌─────────────┬───────────┼───────────┬─────────────┐
        ▼             ▼           ▼           ▼             ▼
   ┌────────┐   ┌────────┐   ┌────────┐   ┌────────┐
   │minio-1 │   │minio-2 │   │minio-3 │   │minio-4 │
   │ /data1 │   │ /data1 │   │ /data1 │   │ /data1 │
   │ /data2 │   │ /data2 │   │ /data2 │   │ /data2 │
   └────────┘   └────────┘   └────────┘   └────────┘
       │            │            │            │
       └────────────┴────────────┴────────────┘
              Erasure-coded (EC:4) — survives loss of
              up to 2 nodes OR 4 disks with no data loss
```

**Why 4 nodes × 2 disks (= 8 drives)?** MinIO's default erasure-coding
parity is `EC:4` for 8-drive setups: 4 data + 4 parity shards per object.
You can lose **any 4 drives** (or any 2 whole nodes) and still serve every
object. Reads continue uninterrupted; writes pause only if quorum (5/8)
is lost.

## Sizing

| Setting | Recommendation |
|---|---|
| Nodes | 4 (minimum for distributed mode) |
| Drives per node | 2 (matched size, dedicated — not OS disk) |
| Drive type | NVMe SSD for hot, SATA SSD for warm, HDD only for archive |
| Network | 10 GbE between MinIO nodes; 1 GbE acceptable for ≤ 1k users |
| RAM per node | 8 GB minimum, 16 GB for > 50 req/s |
| Usable capacity | **50%** of raw (EC:4 = 1:1 data:parity) |

Example: 4 × 2 × 1 TB = 8 TB raw → **4 TB usable**.

## Prerequisites

1. **Four VMs** with identical drive layout. Hostnames must resolve to all
   four nodes from each node — add to `/etc/hosts` or DNS:
   ```
   10.0.0.11  minio-1
   10.0.0.12  minio-2
   10.0.0.13  minio-3
   10.0.0.14  minio-4
   ```
2. **Time sync** (chrony / ntpd). Clock drift > 5 s breaks signed requests.
3. **Open ports** between nodes: `9000` (S3 API), `9001` (console).
4. **Mounted drives** at `/data1` and `/data2` on every node, formatted
   `xfs` (recommended) with `noatime`.

## Install (per node)

Same `docker-compose.minio-cluster.yml` deploys to all 4 nodes — only the
hostname env var changes.

`/opt/taskmaster/docker-compose.minio-cluster.yml`:
```yaml
services:
  minio:
    image: quay.io/minio/minio:RELEASE.2024-10-13T13-34-11Z
    container_name: taskmaster-minio
    restart: unless-stopped
    network_mode: host          # required for inter-node gossip
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD}
      MINIO_SERVER_URL: https://minio.taskmaster.example.com
      MINIO_BROWSER_REDIRECT_URL: https://minio-console.taskmaster.example.com
    volumes:
      - /data1:/data1
      - /data2:/data2
    command:
      - server
      - --console-address=:9001
      - http://minio-{1...4}/data{1...2}
    healthcheck:
      test: ["CMD", "curl", "-fsS", "http://127.0.0.1:9000/minio/health/cluster"]
      interval: 30s
      timeout: 10s
      retries: 3
```

`/opt/taskmaster/.env` (identical on all 4 nodes):
```bash
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=<openssl rand -hex 32>
```

Bring up all four **simultaneously** (each node waits for quorum):
```bash
# on each of minio-1..4
cd /opt/taskmaster
docker compose -f docker-compose.minio-cluster.yml up -d
```

Verify cluster formed:
```bash
docker exec taskmaster-minio mc admin info local
# Look for: "4 drives online, 0 drives offline" and "Status: 4 nodes online"
```

## Bootstrap bucket + IAM (run once, from any node)

Same as the single-node bootstrap, but pointed at the cluster VIP:

```bash
docker run --rm --network host \
  -e MC_HOST_local="https://${MINIO_ROOT_USER}:${MINIO_ROOT_PASSWORD}@minio.taskmaster.example.com" \
  quay.io/minio/mc:RELEASE.2024-10-08T09-37-26Z sh -c '
    set -e
    BUCKET=taskmaster-uploads
    APP_KEY=<S3_ACCESS_KEY from app .env>
    APP_SECRET=<S3_SECRET_KEY from app .env>

    mc mb --ignore-existing local/$BUCKET
    mc anonymous set none   local/$BUCKET
    mc version enable       local/$BUCKET

    cat >/tmp/lc.json <<JSON
    {"Rules":[
      {"ID":"expire-noncurrent-30d","Status":"Enabled","Filter":{"Prefix":""},
       "NoncurrentVersionExpiration":{"NoncurrentDays":30}},
      {"ID":"abort-mpu-7d","Status":"Enabled","Filter":{"Prefix":""},
       "AbortIncompleteMultipartUpload":{"DaysAfterInitiation":7}}
    ]}
    JSON
    mc ilm import local/$BUCKET </tmp/lc.json

    cat >/tmp/policy.json <<JSON
    {"Version":"2012-10-17","Statement":[
      {"Effect":"Allow","Action":["s3:ListBucket","s3:GetBucketLocation"],
       "Resource":"arn:aws:s3:::'"$BUCKET"'"},
      {"Effect":"Allow","Action":["s3:PutObject","s3:GetObject","s3:DeleteObject",
                                  "s3:AbortMultipartUpload","s3:ListMultipartUploadParts"],
       "Resource":"arn:aws:s3:::'"$BUCKET"'/*"}
    ]}
    JSON
    mc admin policy create local taskmaster-app /tmp/policy.json
    mc admin user add      local "$APP_KEY" "$APP_SECRET"
    mc admin policy attach local taskmaster-app --user "$APP_KEY"
'
```

## Load balancer in front of the cluster

Any L4 LB works. HAProxy example:

```haproxy
frontend minio_s3
    bind *:443 ssl crt /etc/haproxy/certs/minio.pem
    default_backend minio_s3_back

backend minio_s3_back
    balance leastconn
    option httpchk GET /minio/health/live
    http-check expect status 200
    server minio-1 10.0.0.11:9000 check inter 5s fall 2 rise 2
    server minio-2 10.0.0.12:9000 check inter 5s fall 2 rise 2
    server minio-3 10.0.0.13:9000 check inter 5s fall 2 rise 2
    server minio-4 10.0.0.14:9000 check inter 5s fall 2 rise 2
```

Point app `.env` at the LB:
```bash
S3_ENDPOINT=https://minio.taskmaster.example.com
```

## Failure tolerance

| Scenario | Reads | Writes | Action |
|---|---|---|---|
| 1 disk down | ✅ | ✅ | Heal automatic; replace at convenience |
| 1 node down | ✅ | ✅ | `mc admin heal -r local` after recovery |
| 2 nodes down | ✅ | ⏸ paused | Restore one node ASAP; quorum needs 3/4 |
| 3+ nodes down | ❌ | ❌ | Restore from backup |
| 4 disks down (across nodes) | ✅ | ✅ | EC:4 limit; replace before more fail |
| 5+ disks down | partial | ❌ | Some objects unreadable; restore affected prefixes |

## Rolling upgrade

MinIO supports zero-downtime upgrades within a release cycle:

```bash
# on each node, one at a time, waiting for cluster to report healthy between
docker compose -f docker-compose.minio-cluster.yml pull
docker compose -f docker-compose.minio-cluster.yml up -d minio
docker exec taskmaster-minio mc admin info local   # wait for "online"
# only proceed to next node when all drives report online
```

## Backup

The MinIO cluster is *not* a backup of itself — erasure coding protects
against drive/node failure, not against accidental deletion or
ransomware. Use `mc mirror` to sync to a separate target (a second MinIO,
S3, or even local disk) on a schedule. See [backup-runbook.md](./backup-runbook.md).

## When to skip distributed MinIO

- Cluster is < 1 TB total → single-node MinIO + nightly `mc mirror` to
  off-host disk is simpler.
- You can reach AWS/R2/Wasabi → use them; their durability beats anything
  you'll build with 4 VMs.
- Your enterprise already runs Ceph/StorageGRID/ECS → reuse it; one less
  thing to operate.
