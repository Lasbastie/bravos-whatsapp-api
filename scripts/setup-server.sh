#!/usr/bin/env bash
#
# Bravos WhatsApp API — setup do servidor (Ubuntu 22.04+/Debian 12+)
#
# Instala: Node 20 (via NodeSource), PM2 global, git, tmux, dependências do
# Chromium headless que o whatsapp-web.js usa em background.
#
# Rodar como root ou com sudo. Idempotente (pode rodar várias vezes sem quebrar).
#
# Uso:
#   sudo bash scripts/setup-server.sh
#
set -euo pipefail

log() { echo -e "\033[1;32m[setup]\033[0m $*"; }
warn() { echo -e "\033[1;33m[setup]\033[0m $*"; }
err() { echo -e "\033[1;31m[setup]\033[0m $*" >&2; }

if [ "$EUID" -ne 0 ]; then
  err "Rode como root ou com sudo."
  exit 1
fi

# -------------------------------------------------------------------
# Detecta distro
# -------------------------------------------------------------------
if ! command -v apt >/dev/null 2>&1; then
  err "Este script assume Ubuntu/Debian com apt. Adapte pra sua distro."
  exit 1
fi

log "atualizando índices do apt..."
apt update -y >/dev/null

# -------------------------------------------------------------------
# Node 20 via NodeSource
# -------------------------------------------------------------------
if command -v node >/dev/null 2>&1 && node -v | grep -qE '^v20\.'; then
  log "Node 20 já instalado ($(node -v))"
else
  log "instalando Node 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt install -y nodejs
  log "Node $(node -v) instalado"
fi

# -------------------------------------------------------------------
# Git, tmux, curl
# -------------------------------------------------------------------
log "instalando git, tmux, curl, build-essential..."
apt install -y git tmux curl build-essential python3 >/dev/null

# -------------------------------------------------------------------
# Dependências do Chromium headless (usadas pelo whatsapp-web.js)
# -------------------------------------------------------------------
log "instalando dependências do Chromium headless..."
apt install -y \
  libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 \
  libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2 \
  libpango-1.0-0 libcairo2 libpangocairo-1.0-0 libgtk-3-0 libgdk-pixbuf2.0-0 \
  libu2f-udev libvulkan1 fonts-liberation >/dev/null 2>&1 || \
warn "algumas libs do Chromium podem não estar disponíveis — o whatsapp-web.js tentará mesmo assim"

# -------------------------------------------------------------------
# PM2 global
# -------------------------------------------------------------------
if command -v pm2 >/dev/null 2>&1; then
  log "PM2 já instalado ($(pm2 -v))"
else
  log "instalando PM2 globalmente..."
  npm install -g pm2 >/dev/null 2>&1
  log "PM2 $(pm2 -v) instalado"
fi

# -------------------------------------------------------------------
# PM2 startup (auto-start no boot)
# -------------------------------------------------------------------
read -rp "Configurar PM2 pra auto-iniciar no boot? [y/N] " reply
if [[ "$reply" =~ ^[Yy]$ ]]; then
  # Pega o usuário que vai rodar (quem chamou via sudo)
  TARGET_USER="${SUDO_USER:-root}"
  TARGET_HOME=$(getent passwd "$TARGET_USER" | cut -d: -f6)
  pm2 startup systemd -u "$TARGET_USER" --hp "$TARGET_HOME" || warn "pm2 startup falhou — rode manualmente depois"
  log "PM2 startup configurado pra usuário $TARGET_USER"
fi

log "setup concluído ✅"
log ""
log "Próximo passo:"
log "  1. cd /caminho/do/projeto"
log "  2. bash scripts/bootstrap.sh"
