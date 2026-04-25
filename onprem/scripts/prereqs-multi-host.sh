#!/usr/bin/env bash
# Install prerequisites on ONE node of a multi-host TaskMaster on-prem
# deployment. Run this script ONCE per VM, passing the role that VM will play.
#
# Roles:
#   web      — runs the app stack (edge runtime, kong, web, auth, realtime)
#              connects out to a remote Postgres + remote S3/MinIO
#   db       — runs Postgres only (the `db` service from docker-compose.db.yml)
#   storage  — runs MinIO (single-node or one node of a 4-node cluster)
#   all-in-one — same as prereqs-single-host.sh (kept here for symmetry)
#
# Examples:
#   sudo ./scripts/prereqs-multi-host.sh --role web      --peers db.internal,minio.internal
#   sudo ./scripts/prereqs-multi-host.sh --role db       --peers app1.internal,app2.internal
#   sudo ./scripts/prereqs-multi-host.sh --role storage  --peers app1.internal,app2.internal
#
# --peers is a comma-separated list of hostnames/IPs that should be allowed
# through this VM's firewall on the role's service port. Use it to whitelist
# only the app/db nodes that need to talk to this VM.
#
# After all VMs are provisioned, follow onprem/docs/large-deployment.md to
# wire them together with the right .env values + docker-compose files.

set -euo pipefail
cd "$(dirname "$0")"
. ./prereqs-common.sh

ROLE=""
PEERS=""

while [ $# -gt 0 ]; do
  case "$1" in
    --role)  ROLE="$2"; shift 2 ;;
    --peers) PEERS="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,30p' "$0"; exit 0 ;;
    *) fail "Unknown arg: $1 (try --help)" ;;
  esac
done

[ -n "$ROLE" ] || fail "Missing --role (web | db | storage | all-in-one)"

require_root
detect_os

log "=== TaskMaster prerequisites: role=$ROLE ==="

# ---------- common to every node -------------------------------------------
install_base_packages
install_time_sync           # critical for multi-host (TLS, JWT exp, replication)
install_docker
tune_kernel

# ---------- helper: allow a port from each peer only -----------------------
# usage: allow_from_peers 5432/tcp
allow_from_peers() {
  local port="$1"
  if [ -z "$PEERS" ]; then
    warn "No --peers given — opening $port to ALL sources (NOT recommended)"
    open_port "$port" "taskmaster-$ROLE"
    return
  fi
  IFS=',' read -ra peer_arr <<< "$PEERS"
  for p in "${peer_arr[@]}"; do
    if command -v ufw >/dev/null 2>&1; then
      ufw allow from "$p" to any port "${port%/*}" proto "${port#*/}" \
        comment "taskmaster-$ROLE from $p" >/dev/null
    elif command -v firewall-cmd >/dev/null 2>&1; then
      firewall-cmd --permanent --add-rich-rule="rule family=ipv4 \
source address=$p port port=${port%/*} protocol=${port#*/} accept" >/dev/null
    fi
    ok "Allowed $port from $p"
  done
}

case "$ROLE" in

  # =========================================================================
  web)
    require_ram 15000
    require_disk /var/lib/docker 50
    create_app_user taskmaster
    mkdir -p /var/lib/taskmaster/{logs,backups}
    chown -R taskmaster:taskmaster /var/lib/taskmaster

    log "Configuring firewall: SSH + 80/443 public, nothing else"
    open_port 22/tcp  "ssh"
    open_port 80/tcp  "http-redirect"
    open_port 443/tcp "https"
    reload_firewall

    cat <<EOF

  Web/app node ready.

  On this VM, populate .env with:
    DB_EMBEDDED=false
    POSTGRES_HOST=<db-vm-hostname>
    POSTGRES_PORT=5432
    STORAGE_DRIVER=s3
    S3_ENDPOINT=https://<minio-vm-hostname>:9000
    S3_BUCKET=taskmaster
    S3_ACCESS_KEY=...
    S3_SECRET_KEY=...

  Then run docker-compose WITHOUT the db & storage services:
    docker compose -f docker-compose.yml \\
        --profile=app-only up -d

  See onprem/docs/large-deployment.md §"Topology B / A2".
EOF
    ;;

  # =========================================================================
  db)
    require_ram 7500
    require_disk /var/lib/postgresql 200
    create_app_user postgres-host

    log "Configuring firewall: SSH + 5432/tcp from peers only"
    open_port 22/tcp "ssh"
    allow_from_peers 5432/tcp
    reload_firewall

    # Dedicated dataset directory — easier to snap/backup at the host level
    mkdir -p /var/lib/taskmaster/pgdata /var/lib/taskmaster/pg-backups
    chown -R 999:999 /var/lib/taskmaster/pgdata           # postgres uid in image
    chown -R postgres-host:postgres-host /var/lib/taskmaster/pg-backups
    ok "Prepared /var/lib/taskmaster/pgdata + pg-backups"

    cat <<EOF

  DB node ready.

  Run only the database stack on this VM:
    docker compose -f docker-compose.db.yml up -d

  Populate .env with:
    POSTGRES_PASSWORD=<strong>
    POSTGRES_DATA_DIR=/var/lib/taskmaster/pgdata
    BACKUP_DIR=/var/lib/taskmaster/pg-backups

  Schedule backups via onprem/scripts/backup.sh (cron — see backup-runbook.md).
EOF
    ;;

  # =========================================================================
  storage)
    require_ram 7500
    require_disk /var/lib/minio 500
    create_app_user minio-host

    log "Configuring firewall: SSH + 9000 (S3 API) + 9001 (console) from peers"
    open_port 22/tcp "ssh"
    allow_from_peers 9000/tcp
    # Console port — open from peers only; do NOT expose publicly
    allow_from_peers 9001/tcp
    reload_firewall

    mkdir -p /var/lib/minio/data
    chown -R minio-host:minio-host /var/lib/minio
    ok "Prepared /var/lib/minio/data"

    cat <<EOF

  Storage (MinIO) node ready.

  Single-node MinIO:
    docker compose -f docker-compose.minio.yml up -d
  Multi-node cluster: follow onprem/docs/minio-cluster.md

  Populate .env on the WEB nodes with:
    STORAGE_DRIVER=s3
    S3_ENDPOINT=https://$(hostname -f):9000
    S3_BUCKET=taskmaster
    S3_ACCESS_KEY=...
    S3_SECRET_KEY=...
EOF
    ;;

  # =========================================================================
  all-in-one)
    log "Delegating to prereqs-single-host.sh…"
    exec "$(dirname "$0")/prereqs-single-host.sh"
    ;;

  *)
    fail "Unknown role: $ROLE (use: web | db | storage | all-in-one)"
    ;;
esac

ok "Prerequisites for role '$ROLE' complete on $(hostname -f)"
