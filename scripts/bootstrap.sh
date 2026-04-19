#!/usr/bin/env bash
#
# Bravos WhatsApp API — bootstrap interativo do worker
#
# Cria .env, instala deps, inicia via PM2, mostra URL de acesso ao frontend.
# Idempotente (pode rodar de novo pra reconfigurar).
#
# Uso:
#   bash scripts/bootstrap.sh
#
set -euo pipefail

log() { echo -e "\033[1;32m[bootstrap]\033[0m $*"; }
warn() { echo -e "\033[1;33m[bootstrap]\033[0m $*"; }
err() { echo -e "\033[1;31m[bootstrap]\033[0m $*" >&2; }

cd "$(dirname "$0")/.." || exit 1
PROJECT_DIR="$(pwd)"
log "projeto: $PROJECT_DIR"

# -------------------------------------------------------------------
# Pré-requisitos
# -------------------------------------------------------------------
command -v node >/dev/null 2>&1 || { err "Node não encontrado. Rode scripts/setup-server.sh primeiro."; exit 1; }
command -v pm2 >/dev/null 2>&1 || { err "PM2 não encontrado. Rode scripts/setup-server.sh primeiro."; exit 1; }

NODE_MAJOR=$(node -v | sed 's/^v\([0-9]*\).*/\1/')
if [ "$NODE_MAJOR" -lt 20 ]; then
  err "Node 20+ necessário (atual: $(node -v))"
  exit 1
fi

# -------------------------------------------------------------------
# .env
# -------------------------------------------------------------------
if [ -f .env ]; then
  warn ".env já existe"
  read -rp "Sobrescrever? [y/N] " reply
  if [[ ! "$reply" =~ ^[Yy]$ ]]; then
    log "mantendo .env existente"
  else
    rm .env
  fi
fi

if [ ! -f .env ]; then
  log "criando .env"

  # API_TOKEN (random forte)
  API_TOKEN=$(openssl rand -hex 32)

  # CLIENT_ID
  DEFAULT_CLIENT_ID="bravos-worker"
  read -rp "CLIENT_ID [$DEFAULT_CLIENT_ID]: " CLIENT_ID
  CLIENT_ID="${CLIENT_ID:-$DEFAULT_CLIENT_ID}"

  # PORT
  DEFAULT_PORT=8095
  read -rp "PORT [$DEFAULT_PORT]: " PORT
  PORT="${PORT:-$DEFAULT_PORT}"

  cat > .env <<EOF
# Gerado por bootstrap.sh em $(date -Iseconds)
API_TOKEN=$API_TOKEN
PORT=$PORT
CLIENT_ID=$CLIENT_ID
DB_PATH=./data/whatsapp.db
LOG_LEVEL=info
EOF
  chmod 600 .env
  log ".env criado (chmod 600)"
  log "API_TOKEN guardado em .env — GUARDE UMA CÓPIA SEGURA:"
  echo
  echo "    API_TOKEN=$API_TOKEN"
  echo
fi

# Lê config atual
set -a
# shellcheck disable=SC1091
source .env
set +a

# -------------------------------------------------------------------
# npm install
# -------------------------------------------------------------------
if [ ! -d node_modules ]; then
  log "instalando deps do npm (pode demorar ~1min)..."
  npm install --no-audit --no-fund
else
  log "node_modules já existe — pulando npm install (rode 'npm install' manualmente se precisar atualizar)"
fi

# -------------------------------------------------------------------
# Pasta data/ e logs/
# -------------------------------------------------------------------
mkdir -p data logs
log "pastas data/ e logs/ garantidas"

# -------------------------------------------------------------------
# PM2
# -------------------------------------------------------------------
APP_NAME="${CLIENT_ID}"

if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  log "app '$APP_NAME' já existe no PM2, fazendo restart..."
  pm2 restart "$APP_NAME" --update-env
else
  log "iniciando app '$APP_NAME' no PM2..."
  pm2 start ecosystem.config.js --only "$APP_NAME" 2>/dev/null || \
    PM2_NAME="$APP_NAME" pm2 start src/server.js --name "$APP_NAME" \
      --kill-timeout 15000 --max-restarts 10 --min-uptime 30000 \
      --output ./logs/out.log --error ./logs/err.log
fi

pm2 save >/dev/null 2>&1 || warn "pm2 save falhou (normal se PM2 startup não tá configurado)"

# -------------------------------------------------------------------
# Sucesso
# -------------------------------------------------------------------
echo
log "✅ Worker subiu como '$APP_NAME' na porta $PORT"
echo
log "Próximos passos:"
log "  1. Abra http://<IP-do-servidor>:$PORT/ no navegador"
log "  2. Escaneie o QR code com o WhatsApp do número que vai conectar"
log "  3. Monitore: pm2 logs $APP_NAME"
log "  4. Health check: curl http://localhost:$PORT/health"
echo
log "Teste de envio (use o token abaixo no seu sistema):"
echo "  API_TOKEN=$API_TOKEN"
echo
log 'Exemplo:'
echo "  curl -X POST http://localhost:$PORT/send-message \\"
echo "    -H \"Authorization: Bearer \$API_TOKEN\" \\"
echo "    -H \"Content-Type: application/json\" \\"
echo "    -d '{\"chatId\":\"55119XXXXXXXX\",\"message\":\"oi\"}'"
