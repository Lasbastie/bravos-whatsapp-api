'use strict';
const express = require('express');
const path = require('path');

const config = require('./config');
const log = require('./logger');
const waClient = require('./client');

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
