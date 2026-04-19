# Bravos WhatsApp API

Worker WhatsApp auto-hospedado. Um número por instância. Todas as mensagens (in + out, incluindo as enviadas pelo app nativo) vão pro SQLite. Endpoints REST pra enviar, listar grupos, consultar histórico, mutar contatos.

Sem relay, sem brain embutido — é puro *motor de WhatsApp*. O sistema externo pluga via API + leitura do SQLite.

## Quick start

```bash
# 1. clone
git clone <repo-url> bravos-whatsapp-api
cd bravos-whatsapp-api

# 2. deps
npm install

# 3. config
cp .env.example .env
# Edite .env e defina API_TOKEN (openssl rand -hex 32)

# 4. roda
npm start
# OU em PM2:
pm2 start ecosystem.config.js

# 5. abre http://localhost:8095/ no browser e escaneia o QR code
```

## Variáveis (.env)

| Var | Default | Obrigatória | Descrição |
|---|---|---|---|
| `API_TOKEN` | - | sim | Token Bearer pra proteger as rotas (mínimo 16 chars) |
| `PORT` | `8095` | não | Porta HTTP |
| `CLIENT_ID` | `bravos-worker` | não | Nome da sessão (único por instância) |
| `DB_PATH` | `./data/whatsapp.db` | não | Caminho do SQLite |
| `LOG_LEVEL` | `info` | não | `debug` / `info` / `warn` / `error` |

## Endpoints

Todas as rotas abaixo exigem `Authorization: Bearer <API_TOKEN>` (ou `?token=`), exceto `/health` e `/qr.*`.

### Envio
- `POST /send-message` — `{chatId, message, typingMs?, linkPreview?}`
- `POST /send-message-group` — `{groupId, message, mentions?}`
- `POST /send-audio` — `{chatId, filePath}` (envia como voice note)
- `POST /send-media` — `{chatId, filePath, caption?}` (imagem/vídeo/doc)
- `POST /simulate-typing` — `{chatId, durationMs?}` (só indicador "digitando")

### Grupos
- `GET /groups?name=<substring>` — lista grupos
- `GET /groups/:groupId/participants` — participantes de um grupo

### Histórico
- `GET /history?chatId=...&limit=50` — lê do banco local
- `POST /fetch-history` — `{chatId, limit}` (pulls do WhatsApp e salva no banco)

### Mute (estado gerenciado, não bloqueia envio)
- `POST /mute` — `{chatId, reason?}`
- `POST /unmute` — `{chatId}`
- `GET /mute` — lista todos mutados
- `GET /mute/:chatId` — checa se específico está mutado

### Sem auth
- `GET /health` — status do cliente + uptime
- `GET /qr.png` — QR code como PNG (204 se já conectado)
- `GET /qr.json` — status + QR base64
- `GET /` — frontend com QR code

## Arquitetura em 1 parágrafo

Sessão única `whatsapp-web.js` → handlers `message` + `message_create` salvam TODA mensagem em SQLite (dedupe por messageId UNIQUE). Envio passa por fila global anti-ban (7-15s entre envios, priorização). Watchdog reinicia cliente se travar em `AUTHENTICATED sem READY`. Graceful shutdown (SIGTERM) destrói Chrome limpo pra evitar zumbi.

## Estrutura

```
src/
├── server.js         Entry point, Express, shutdown handlers
├── client.js         whatsapp-web.js + watchdog + save-all handler
├── db.js             Schema SQLite + statements
├── send-queue.js     Fila global anti-ban
├── auth.js           Middleware Bearer token
├── config.js         Parsing do .env
├── logger.js         Log simples com níveis
└── routes/
    ├── send.js       /send-message, /send-audio, /send-media, /simulate-typing
    ├── groups.js     /groups, /groups/:id/participants
    ├── history.js    /history, /fetch-history
    ├── mute.js       /mute, /unmute
    ├── health.js     /health
    └── qr.js         /qr.png, /qr.txt, /qr.json
public/
└── index.html        Frontend mínimo (QR code + status)
data/                 SQLite (gerado)
.wwebjs_auth/         Sessão WhatsApp (gerado)
logs/                 PM2 logs
```

## Multi-instance no mesmo servidor

Pra rodar MAIS DE UM número na mesma VPS, duplique a pasta e mude `CLIENT_ID` + `PORT` + `DB_PATH` no .env. Cada worker é 100% isolado.

## Operação

- `pm2 restart <CLIENT_ID>` — reinicia com graceful shutdown
- `pm2 logs <CLIENT_ID>` — logs
- `curl http://localhost:8095/health` — status
- Backup periódico do `.wwebjs_auth/<CLIENT_ID>/` — perder = re-escanear QR

## Segurança

- `API_TOKEN` forte (openssl rand -hex 32)
- Nunca expor `:PORT` direto pra internet sem proxy com HTTPS e rate limiting
- `Authorization: Bearer` em TODAS as chamadas write/read

## Licença

Privado. Redistribuição restrita.
