'use strict';
const express = require('express');
const path = require('path');

const config = require('./config');
const log = require('./logger');
const waClient = require('./client');

// Webhook forwarder - envia mensagens recebidas/enviadas para WEBHOOK_URL
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || '';
if (WEBHOOK_URL) {
  log.info(`[webhook] configurado para: ${WEBHOOK_URL}`);
  const postWebhook = async (type, data) => {
    try {
      const res = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Source': 'imperador',
          'X-Webhook-Secret': WEBHOOK_SECRET
        },
        body: JSON.stringify({ type, data, clientId: config.CLIENT_ID, timestamp: Date.now() })
      });
      if (!res.ok) log.warn(`[webhook] ${type} falhou: ${res.status}`);
    } catch (e) {
      log.warn(`[webhook] ${type} erro: ${e.message}`);
    }
  };
  waClient.on('message_in', (msg) => postWebhook('message_in', msg));
  waClient.on('message_out', (msg) => postWebhook('message_out', msg));
  waClient.on('ready', () => postWebhook('ready', { ok: true }));
  waClient.on('disconnected', (reason) => postWebhook('disconnected', { reason }));
} else {
  log.info('[webhook] WEBHOOK_URL nao configurada - webhook desativado');
}

// Routes
const qrRoutes = require('./routes/qr');
const sendRoutes = require('./routes/send');
const groupsRoutes = require('./routes/groups');
const historyRoutes = require('./routes/history');
const muteRoutes = require('./routes/mute');
const healthRoutes = require('./routes/health');

const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static frontend (QR page)
app.use(express.static(path.join(config.ROOT, 'public'), { maxAge: '1h' }));

// Rotas públicas (sem auth)
app.use('/', qrRoutes);          // /qr.png, /qr.txt, /qr.json
app.use('/', healthRoutes);      // /health

// Rotas autenticadas
app.use('/', sendRoutes);        // /send-message, /send-message-group, /send-audio, /send-media, /simulate-typing
app.use('/', groupsRoutes);      // /groups, /groups/:id/participants
app.use('/', historyRoutes);     // /history, /fetch-history
app.use('/', muteRoutes);        // /mute, /unmute

// 404
app.use((req, res) => {
  res.status(404).json({ ok: false, error: 'endpoint não encontrado', path: req.path });
});

const server = app.listen(config.PORT, () => {
  log.info(`[server] HTTP ouvindo em :${config.PORT}`);
});

// ----------------------------------------------------------------
// Boot do WhatsApp client
// ----------------------------------------------------------------
waClient.init().then(() => {
  waClient.startWatchdog();
}).catch((err) => {
  log.error('[boot] falha ao inicializar cliente:', err?.message);
});

waClient.on('qr', () => log.info('[boot] QR disponível'));
waClient.on('ready', () => log.info('[boot] WhatsApp pronto'));
waClient.on('disconnected', (r) => log.warn('[boot] WhatsApp desconectou:', r));

// ----------------------------------------------------------------
// Graceful shutdown
// ----------------------------------------------------------------
async function shutdown(signal) {
  log.info(`[shutdown] recebido ${signal}, encerrando...`);
  server.close();
  try {
    await waClient.shutdown();
  } catch (err) {
    log.error('[shutdown] erro:', err?.message);
  }
  setTimeout(() => process.exit(0), 2000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('uncaughtException', (err) => {
  log.error('[uncaughtException]', err?.stack || err);
});
process.on('unhandledRejection', (err) => {
  log.error('[unhandledRejection]', err?.stack || err);
});
