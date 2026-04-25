#!/usr/bin/env bash
# Install ALL prerequisites on a single VM that will run the entire
# TaskMaster on-prem stack (Postgres + edge + web + storage on local FS).
#
# Use for: Eval, Small, Medium, Large-A1 tiers.
# After this finishes:
#   1. cd /opt/taskmaster (or wherever you cloned the repo)
#   2. cp .env.example .env   # fill in DOMAIN, POSTGRES_PASSWORD, LICENSE_KEY, SMTP_*
#   3. ./scripts/install.sh
#
# Run as: sudo ./scripts/prereqs-single-host.sh
set -euo pipefail
cd "$(dirname "$0")"
. ./prereqs-common.sh

require_root
detect_os

log "=== TaskMaster prerequisites: SINGLE-HOST topology ==="

# Sizing preflight (Medium baseline; raise for Large)
require_ram 7500
require_disk /var/lib/docker 50

install_base_packages
install_time_sync
install_docker
tune_kernel
create_app_user taskmaster

# Open the public web ports + SSH (do NOT open Postgres — it stays internal)
log "Configuring firewall (80, 443, 22)…"
open_port 22/tcp   "ssh"
open_port 80/tcp   "http-redirect"
open_port 443/tcp  "https"
reload_firewall

# Make /var/lib/taskmaster for storage volume bind-mounts (optional but tidy)
mkdir -p /var/lib/taskmaster/{uploads,backups}
chown -R taskmaster:taskmaster /var/lib/taskmaster
ok "Created /var/lib/taskmaster/{uploads,backups}"

cat <<'EOF'

============================================================
  Single-host prerequisites complete.

  Next steps:
    1. Place the TaskMaster on-prem bundle in /opt/taskmaster
    2. cd /opt/taskmaster && cp .env.example .env
    3. Edit .env — set DOMAIN, POSTGRES_PASSWORD, LICENSE_KEY, SMTP_*
    4. Place TLS certs in ./tls/fullchain.pem and ./tls/privkey.pem
    5. sudo -u taskmaster ./scripts/install.sh

  See onprem/docs/install.md for the full walkthrough.
============================================================
EOF
