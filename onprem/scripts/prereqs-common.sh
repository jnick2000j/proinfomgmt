#!/usr/bin/env bash
# Shared helpers + base OS prerequisites for TaskMaster on-prem.
# Sourced by:
#   prereqs-single-host.sh    (everything on one VM)
#   prereqs-multi-host.sh     (per-role: web | db | storage)
#
# Supported OS: Ubuntu 22.04+, Debian 12+, RHEL/Rocky/Alma 9+
# Idempotent — safe to re-run. Requires root (or sudo).

set -euo pipefail

# ---------- pretty logging --------------------------------------------------
c_blue=$'\033[1;34m'; c_red=$'\033[1;31m'; c_yel=$'\033[1;33m'
c_grn=$'\033[1;32m'; c_off=$'\033[0m'

log()  { printf "%s[prereqs]%s %s\n" "$c_blue" "$c_off" "$*"; }
ok()   { printf "%s[ ok ]%s %s\n" "$c_grn"  "$c_off" "$*"; }
warn() { printf "%s[warn]%s %s\n" "$c_yel"  "$c_off" "$*"; }
fail() { printf "%s[fail]%s %s\n" "$c_red"  "$c_off" "$*" >&2; exit 1; }

# ---------- must-be-root ----------------------------------------------------
require_root() {
  if [ "$(id -u)" -ne 0 ]; then
    fail "Run as root (or via sudo). Try: sudo $0 $*"
  fi
}

# ---------- detect package manager ------------------------------------------
detect_os() {
  if [ -r /etc/os-release ]; then
    . /etc/os-release
    OS_ID="${ID:-unknown}"
    OS_LIKE="${ID_LIKE:-}"
  else
    fail "/etc/os-release missing — unsupported OS"
  fi
  case "$OS_ID $OS_LIKE" in
    *ubuntu*|*debian*) PKG="apt"  ;;
    *rhel*|*rocky*|*alma*|*centos*|*fedora*) PKG="dnf" ;;
    *) fail "Unsupported OS: $OS_ID — supported: Ubuntu/Debian/RHEL/Rocky/Alma" ;;
  esac
  ok "Detected $OS_ID (pkg manager: $PKG)"
}

pkg_install() {
  case "$PKG" in
    apt) DEBIAN_FRONTEND=noninteractive apt-get install -y -q "$@" ;;
    dnf) dnf install -y -q "$@" ;;
  esac
}

pkg_refresh() {
  case "$PKG" in
    apt) apt-get update -q ;;
    dnf) dnf makecache -q ;;
  esac
}

# ---------- base packages every role needs ----------------------------------
install_base_packages() {
  log "Installing base packages (curl, openssl, ca-certs, ufw/firewalld, jq)…"
  pkg_refresh
  case "$PKG" in
    apt) pkg_install curl ca-certificates gnupg lsb-release openssl jq ufw rsync cron ;;
    dnf) pkg_install curl ca-certificates openssl jq firewalld rsync cronie ;;
  esac
  ok "Base packages installed"
}

# ---------- docker engine + compose v2 --------------------------------------
install_docker() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    ok "Docker $(docker --version | awk '{print $3}' | tr -d ,) + Compose v2 already installed"
    return
  fi
  log "Installing Docker Engine + Compose v2…"
  case "$PKG" in
    apt)
      install -m 0755 -d /etc/apt/keyrings
      curl -fsSL https://download.docker.com/linux/${OS_ID}/gpg \
        | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
      chmod a+r /etc/apt/keyrings/docker.gpg
      echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/${OS_ID} $(. /etc/os-release && echo "${VERSION_CODENAME}") stable" \
        > /etc/apt/sources.list.d/docker.list
      apt-get update -q
      pkg_install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
      ;;
    dnf)
      dnf -y install dnf-plugins-core
      dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
      pkg_install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
      ;;
  esac
  systemctl enable --now docker
  ok "Docker installed and enabled"
}

# ---------- system tuning (kernel + limits) ---------------------------------
tune_kernel() {
  log "Applying kernel + ulimit tuning for Postgres / object storage…"
  cat > /etc/sysctl.d/99-taskmaster.conf <<'EOF'
# TaskMaster on-prem tuning
vm.swappiness = 10
vm.overcommit_memory = 1
net.core.somaxconn = 4096
net.ipv4.tcp_max_syn_backlog = 4096
fs.file-max = 2097152
EOF
  sysctl --system >/dev/null
  cat > /etc/security/limits.d/99-taskmaster.conf <<'EOF'
*       soft    nofile  65536
*       hard    nofile  131072
EOF
  ok "Kernel + ulimits tuned"
}

# ---------- create unix user for the stack ----------------------------------
create_app_user() {
  local user="${1:-taskmaster}"
  if id "$user" >/dev/null 2>&1; then
    ok "User '$user' already exists"
  else
    useradd -m -s /bin/bash "$user"
    ok "Created user '$user'"
  fi
  usermod -aG docker "$user"
  ok "Added '$user' to docker group (re-login required for that user)"
}

# ---------- firewall: open a port (idempotent) ------------------------------
# usage: open_port 443/tcp [comment]
open_port() {
  local port="$1" comment="${2:-taskmaster}"
  if command -v ufw >/dev/null 2>&1 && ufw status >/dev/null 2>&1; then
    ufw allow "$port" comment "$comment" >/dev/null
  elif command -v firewall-cmd >/dev/null 2>&1; then
    firewall-cmd --permanent --add-port="$port" >/dev/null
  else
    warn "No ufw/firewalld found — open $port manually"
    return
  fi
  ok "Opened $port ($comment)"
}

reload_firewall() {
  if command -v ufw >/dev/null 2>&1; then
    ufw --force enable >/dev/null || true
  elif command -v firewall-cmd >/dev/null 2>&1; then
    firewall-cmd --reload >/dev/null
  fi
}

# ---------- disk preflight --------------------------------------------------
# usage: require_disk /var/lib 50      (path, min GB)
require_disk() {
  local path="$1" min_gb="$2"
  mkdir -p "$path"
  local avail
  avail=$(df -BG --output=avail "$path" | tail -1 | tr -dc 0-9)
  if [ "$avail" -lt "$min_gb" ]; then
    fail "Need ≥${min_gb}GB free at $path (found ${avail}GB)"
  fi
  ok "Disk OK at $path: ${avail}GB free (min ${min_gb}GB)"
}

# ---------- ram preflight ---------------------------------------------------
require_ram() {
  local min_mb="$1"
  local ram
  ram=$(free -m | awk '/^Mem:/{print $2}')
  if [ "$ram" -lt "$min_mb" ]; then
    warn "Only ${ram}MB RAM (recommended ≥${min_mb}MB)"
  else
    ok "RAM OK: ${ram}MB (min ${min_mb}MB)"
  fi
}

# ---------- chrony / time sync (multi-host needs this) ----------------------
install_time_sync() {
  log "Installing chrony for time synchronization…"
  case "$PKG" in
    apt) pkg_install chrony ;;
    dnf) pkg_install chrony ;;
  esac
  systemctl enable --now chronyd 2>/dev/null || systemctl enable --now chrony
  ok "chrony enabled"
}
