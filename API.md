# API Reference — Bravos WhatsApp API

Base URL: `http://<host>:<PORT>` (default `:8095`).

Autenticação: todas as rotas abaixo exigem header `Authorization: Bearer <API_TOKEN>` — exceto `/health`, `/qr.*` e `/` (frontend).

Respostas sempre em JSON, exceto `/qr.png` (PNG) e `/qr.txt` (plain text).

Convenção: toda resposta traz `ok: true|false`. Erros têm `error: <string>` humano.

---

## 1. Autenticação

```bash
# Header
curl -H "Authorization: Bearer $API_TOKEN" ...

# OU query string (útil pra testes rápidos no browser)
curl ...?token=$API_TOKEN
```

Erros de auth retornam `401`:
```json
{"ok":false,"error":"Token inválido ou ausente"}
```

---

## 2. Endpoints públicos (sem auth)

### `GET /health`
Status do worker. Retorna `200` se conectado, `503` se não.

```json
{
  "ok": true,
  "clientId": "bravos-worker",
  "isReady": true,
  "isAuthenticated": true,
  "hasQr": false,
  "queueSize": 0,
  "uptimeSec": 3421
}
```

### `GET /qr.png`
PNG do QR code (400×400px). `204 No Content` se já conectado.

### `GET /qr.txt`
Texto puro do QR (útil pra terminal).

### `GET /qr.json`
QR em base64 + status. Base da tela frontend.

```json
{
  "ok": true,
  "status": {"isReady": false, "isAuthenticated": false, "hasQr": true, "queueSize": 0},
  "qr": "data:image/png;base64,iVBORw0KG..."
}
```

### `GET /`
Frontend HTML com QR code auto-atualizado a cada 3s.

---

## 3. Envio de mensagens

### `POST /send-message`

Envia texto pra um usuário (não grupo).

**Body:**
| Campo | Tipo | Obrig | Descrição |
|---|---|---|---|
| `chatId` | string | sim | Número bruto (`5511999999999`), `@c.us` ou `@lid` |
| `message` | string | sim | Texto da mensagem |
| `typingMs` | number | não | Milisegundos de "digitando..." antes do envio |
| `linkPreview` | bool | não | Default `true` |

**Exemplo:**
```bash
curl -X POST http://localhost:8095/send-message \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "chatId": "5511999999999",
    "message": "Olá! Mensagem de teste.",
    "typingMs": 2500
  }'
```

**Resposta OK (200):**
```json
{"ok": true, "to": "5511999999999@c.us", "messageId": "true_5511999999999@c.us_3EB..."}
```

**Erros:**
- `400` se `chatId` é `@g.us` (use `/send-message-group`)
- `404` se o número não tem WhatsApp
- `422` se `chatId` ou `message` faltando
- `500` se worker travou ou WhatsApp desconectou

---

### `POST /send-message-group`

Envia mensagem pra grupo, com menções opcionais.

**Body:**
| Campo | Tipo | Obrig | Descrição |
|---|---|---|---|
| `groupId` | string | sim | JID terminado em `@g.us` |
| `message` | string | sim | Texto (use `@<número>` no body pra exibir menção) |
| `mentions` | array | não | Lista de chatIds dos mencionados |

**Exemplo:**
```bash
curl -X POST http://localhost:8095/send-message-group \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "groupId": "120363001234567890@g.us",
    "message": "Pessoal, @5511999999999 pode confirmar presença?",
    "mentions": ["5511999999999@c.us"]
  }'
```

---

### `POST /send-audio`

Envia áudio como voice note (`ptt`).

**Body:**
| Campo | Tipo | Obrig | Descrição |
|---|---|---|---|
| `chatId` | string | sim | Destinatário |
| `filePath` | string | sim | Caminho absoluto do arquivo no servidor |

**Formatos aceitos:** `.ogg` (opus), `.mp3`, `.m4a`, `.wav`.

**Exemplo:**
```bash
curl -X POST http://localhost:8095/send-audio \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "chatId": "5511999999999@c.us",
    "filePath": "/tmp/audio-saida.ogg"
  }'
```

---

### `POST /send-media`

Envia imagem, documento ou vídeo. O tipo é detectado pela extensão do arquivo.

**Body:**
| Campo | Tipo | Obrig | Descrição |
|---|---|---|---|
| `chatId` | string | sim | Destinatário |
| `filePath` | string | sim | Caminho absoluto |
| `caption` | string | não | Legenda (só para imagens/vídeos) |

**Exemplo:**
```bash
curl -X POST http://localhost:8095/send-media \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "chatId": "5511999999999@c.us",
    "filePath": "/tmp/comprovante.jpg",
    "caption": "Segue o comprovante"
  }'
```

---

### `POST /simulate-typing`

Mostra indicador "digitando..." sem enviar nada. Útil pra simular que o agente está pensando antes de você mandar uma mensagem de outro endpoint.

**Body:**
| Campo | Tipo | Obrig | Default |
|---|---|---|---|
| `chatId` | string | sim | - |
| `durationMs` | number | não | `3000` |

---

## 4. Grupos

### `GET /groups[?name=<substring>]`

Lista todos grupos em que o número está.

**Query opcional:** `name=<substring>` — filtra case-insensitive por substring no nome.

**Resposta:**
```json
{
  "ok": true,
  "count": 3,
  "groups": [
    {"id": "120363...@g.us", "name": "Time comercial", "participantsCount": 8, "unreadCount": 0}
  ]
}
```

### `GET /groups/:groupId/participants`

Lista participantes de um grupo específico.

**Exemplo:**
```bash
curl -H "Authorization: Bearer $API_TOKEN" \
  http://localhost:8095/groups/120363001234567890@g.us/participants
```

**Resposta:**
```json
{
  "ok": true,
  "count": 8,
  "participants": [
    {"id": "5511999999999@c.us", "phone": "5511999999999", "isAdmin": true, "isSuperAdmin": false}
  ]
}
```

---

## 5. Histórico

### `GET /history?chatId=<id>&limit=<n>`

Lê as últimas N mensagens salvas no SQLite. Não consulta o WhatsApp — usa só o banco local.

**Query:**
| Campo | Tipo | Obrig | Default | Max |
|---|---|---|---|---|
| `chatId` | string | sim | - | - |
| `limit` | number | não | `50` | `500` |

**Resposta:**
```json
{
  "ok": true,
  "chatId": "5511999999999@c.us",
  "count": 2,
  "messages": [
    {
      "message_id": "true_...",
      "chat_id": "5511999999999@c.us",
      "direction": "in",
      "body": "Oi, tudo bem?",
      "type": "chat",
      "has_media": 0,
      "from_me": 0,
      "timestamp": "2026-04-19T15:30:22.000Z"
    }
  ]
}
```

### `POST /fetch-history`

Busca mensagens direto do WhatsApp Web e salva no SQLite. Útil pra hidratar histórico logo após conectar.

**Body:**
| Campo | Tipo | Obrig | Default | Max |
|---|---|---|---|---|
| `chatId` | string | sim | - | - |
| `limit` | number | não | `50` | `500` |

**Resposta:**
```json
{"ok": true, "chatId": "...", "fetched": 42, "saved": 42}
```

---

## 6. Mute (estado gerenciado)

Marca contatos como silenciados. O worker **não** bloqueia envios automaticamente com base nisso — é só metadado pra o sistema externo consultar e decidir.

### `POST /mute`
```bash
curl -X POST http://localhost:8095/mute \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"chatId":"5511999999999@c.us","reason":"pediu pra não receber promoções"}'
```

### `POST /unmute`
```bash
curl -X POST http://localhost:8095/unmute \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"chatId":"5511999999999@c.us"}'
```

### `GET /mute`
Lista todos mutados.

### `GET /mute/:chatId`
Checa um específico.

---

## 7. Schema SQLite (pra leitura direta)

O sistema externo pode consultar o banco diretamente — é só abrir `./data/whatsapp.db` em modo READONLY.

### Tabela `messages`
```sql
CREATE TABLE messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id  TEXT UNIQUE,
  chat_id     TEXT NOT NULL,
  from_id     TEXT,
  to_id       TEXT,
  direction   TEXT NOT NULL CHECK(direction IN ('in','out')),
  body        TEXT,
  type        TEXT,
  has_media   INTEGER DEFAULT 0,
  media_path  TEXT,
  from_me     INTEGER DEFAULT 0,
  timestamp   TEXT NOT NULL,    -- ISO 8601
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
```

Todas as mensagens (incoming + outgoing via API + outgoing via app nativo do celular) são salvas aqui.

### Tabela `contacts`
```sql
CREATE TABLE contacts (
  chat_id     TEXT PRIMARY KEY,
  phone       TEXT,
  pushname    TEXT,
  is_group    INTEGER DEFAULT 0,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
```

Atualizado automaticamente quando chega mensagem.

### Tabela `muted_contacts`
```sql
CREATE TABLE muted_contacts (
  chat_id   TEXT PRIMARY KEY,
  reason    TEXT,
  muted_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
```

---

## 8. Códigos de resposta

| Código | Quando |
|---|---|
| `200` | Sucesso |
| `204` | Sucesso sem body (ex: `/qr.png` quando já conectado) |
| `400` | Payload inválido (ex: `@g.us` em `/send-message`) |
| `401` | Token ausente ou inválido |
| `404` | Número sem WhatsApp ou endpoint inexistente |
| `422` | Validação de campos falhou |
| `500` | Erro interno (worker travado, erro do whatsapp-web.js) |
| `503` | `/health` quando cliente não está `ready` |

---

## 9. Fluxo recomendado de uso

1. `GET /health` → se `isReady: false && hasQr: true`, ir pra passo 2
2. `GET /qr.png` → mostrar QR pro usuário escanear (ou abrir `GET /` que já renderiza)
3. Polling `/health` até `isReady: true`
4. `POST /fetch-history` com o chatId desejado pra hidratar histórico
5. A partir daí, consumir mensagens via `GET /history` (polling) OU ler direto do SQLite
6. Enviar via `/send-message`, `/send-media`, etc

---

## 10. Rate limiting / Anti-ban

O worker serializa todos os envios numa fila global com delay aleatório de 7-15 segundos entre mensagens. Quando a fila tem 5+ pendentes, adiciona 2-5s extra pra simular menos robotização.

Isso significa que mandar 10 mensagens em loop demora ~1-2 minutos, e isso é intencional. Não tente burlar — vira ban.

Pra enviar em volume maior (newsletter, aviso em massa), considere:
- Várias instâncias em paralelo (cada uma com número próprio)
- Adicionar seu próprio queue/schedule no sistema externo pra espaçar mais
- Evitar bursts em horários não-comerciais

---

## 11. WebSocket / Eventos em tempo real

Não implementado nesta versão. O sistema externo faz polling em:
- `GET /health` pra status
- `GET /history` pra mensagens novas
- OU lê direto do SQLite

(Se quiser push em tempo real, adicione um handler na aplicação consumindo o banco via `watch` do SQLite ou implemente um endpoint `GET /events` com SSE — fora do escopo atual.)
