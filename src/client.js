'use strict';
// WhatsApp client wrapper — whatsapp-web.js + watchdog + handlers que
// salvam TODAS as mensagens (in e out) no banco.
//
// Eventos expostos via EventEmitter:
//   'qr' (string)       — QR code texto pra render
//   'ready' ()          — cliente autenticado e pronto
//   'disconnected' (reason)
//   'message_in' (msgRow)  — mensagem recebida (já salva no banco)
//   'message_out' (msgRow) — mensagem enviada (já salva no banco)

const { EventEmitter } = require('events');
const path = require('path');
const fs = require('fs');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');

const config = require('./config');
const log = require('./logger');
const db = require('./db');
const queue = require('./send-queue');

const emitter = new EventEmitter();

let client = null;
let currentQr = null;        // última string de QR, ou null se já autenticado
let isReady = false;
let isAuthenticated = false;
let isInitializing = false;
let isRecreating = false;
let shuttingDown = false;

let watchdogTimer = null;
let watchdogStart = Date.now();

// Anti-duplicidade de eco de message_create
const recentlySavedMessageIds = new Set();
function rememberMessageId(id, ttlMs = 5 * 60 * 1000) {
  if (!id) return;
  recentlySavedMessageIds.add(id);
  setTimeout(() => recentlySavedMessageIds.delete(id), ttlMs);
}

// ----------------------------------------------------------------
// Lifecycle
// ----------------------------------------------------------------
async function init() {
  if (isInitializing) return;
  isInitializing = true;

  log.info(`[client] inicializando (CLIENT_ID=${config.CLIENT_ID})`);

  client = new Client({
    authStrategy: new LocalAuth({
      clientId: config.CLIENT_ID,
      dataPath: path.join(config.ROOT, '.wwebjs_auth'),
    }),
    puppeteer: {
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
      ],
    },
    webVersionCache: { type: 'local' },
  });

  bindHandlers();

  try {
    await client.initialize();
  } catch (err) {
    log.error('[client] erro na initialize:', err?.message || err);
    scheduleRecreate();
  } finally {
    isInitializing = false;
  }
}

function bindHandlers() {
  client.on('qr', (qr) => {
    currentQr = qr;
    log.info('[client] QR code disponível, escaneie em /');
    emitter.emit('qr', qr);
  });

  client.on('authenticated', () => {
    isAuthenticated = true;
    watchdogStart = Date.now();
    log.info('[client] autenticado');
  });

  client.on('auth_failure', (msg) => {
    isAuthenticated = false;
    log.error('[client] auth_failure:', msg);
  });

  client.on('ready', () => {
    isReady = true;
    currentQr = null;
    log.info('[client] pronto');
    emitter.emit('ready');
  });

  client.on('disconnected', (reason) => {
    log.warn('[client] disconnected:', reason);
    isReady = false;
    isAuthenticated = false;
    emitter.emit('disconnected', reason);
    scheduleRecreate();
  });

  // Mensagem recebida (de outra pessoa)
  client.on('message', async (msg) => {
    await handleIncomingMessage(msg);
  });

  // message_create captura TUDO: recebidas + enviadas pelo próprio número
  // (via API OU via app nativo do WhatsApp no celular). É o que garante
  // persistência completa do histórico.
  client.on('message_create', async (msg) => {
    if (recentlySavedMessageIds.has(msg.id?._serialized)) return;
    if (msg.fromMe) {
      await handleOutgoingMessage(msg);
    } else {
      // Já foi tratado em 'message', mas se por algum motivo não foi, salva
      if (!recentlySavedMessageIds.has(msg.id?._serialized)) {
        await handleIncomingMessage(msg);
      }
    }
  });
}

async function handleIncomingMessage(msg) {
  try {
    const messageId = msg.id?._serialized;
    if (!messageId || recentlySavedMessageIds.has(messageId)) return;

    const row = {
      message_id: messageId,
      chat_id: msg.from,
      from_id: msg.author || msg.from,
      to_id: msg.to,
      direction: 'in',
      body: msg.body || '',
      type: msg.type || 'chat',
      has_media: msg.hasMedia ? 1 : 0,
      media_path: null,
      from_me: 0,
      timestamp: msg.timestamp,
    };

    db.saveMessage(row);
    rememberMessageId(messageId);

    // Atualiza contato
    const isGroup = String(msg.from || '').endsWith('@g.us');
    db.upsertContact({
      chat_id: msg.from,
      phone: extractPhone(msg.from),
      pushname: msg._data?.notifyName || msg.notifyName || null,
      is_group: isGroup ? 1 : 0,
    });

    emitter.emit('message_in', row);
  } catch (err) {
    log.error('[client] handleIncomingMessage erro:', err?.message || err);
  }
}

async function handleOutgoingMessage(msg) {
  try {
    const messageId = msg.id?._serialized;
    if (!messageId || recentlySavedMessageIds.has(messageId)) return;

    const row = {
      message_id: messageId,
      chat_id: msg.to,
      from_id: msg.from,
      to_id: msg.to,
      direction: 'out',
      body: msg.body || '',
      type: msg.type || 'chat',
      has_media: msg.hasMedia ? 1 : 0,
      media_path: null,
      from_me: 1,
      timestamp: msg.timestamp,
    };

    db.saveMessage(row);
    rememberMessageId(messageId);

    emitter.emit('message_out', row);
  } catch (err) {
    log.error('[client] handleOutgoingMessage erro:', err?.message || err);
  }
}

function extractPhone(jid) {
  if (!jid) return null;
  const match = String(jid).match(/^(\d+)@/);
  return match ? match[1] : null;
}

// ----------------------------------------------------------------
// Watchdog — detecta travamento em AUTHENTICATED sem READY
// ----------------------------------------------------------------
function startWatchdog() {
  if (watchdogTimer) clearInterval(watchdogTimer);
  watchdogTimer = setInterval(() => {
    if (shuttingDown || !client) return;
    if (isAuthenticated && !isReady) {
      const elapsed = Date.now() - watchdogStart;
      if (elapsed > 5 * 60 * 1000) {
        log.warn(`[watchdog] autenticado sem ready há ${Math.round(elapsed / 1000)}s — recriando`);
        scheduleRecreate();
      }
    } else {
      watchdogStart = Date.now();
    }
  }, 30000);
}

async function scheduleRecreate() {
  if (isRecreating || shuttingDown) return;
  isRecreating = true;

  setTimeout(async () => {
    try {
      if (client) {
        try { await client.destroy(); } catch {}
      }
    } catch (err) {
      log.error('[client] erro ao destruir cliente antigo:', err?.message);
    }
    client = null;
    isReady = false;
    isAuthenticated = false;
    isRecreating = false;
    await init();
  }, 10000);
}

// ----------------------------------------------------------------
// API de envio
// ----------------------------------------------------------------
function getClientOrThrow() {
  if (!client) throw new Error('Client ainda não inicializado');
  if (!isReady) throw new Error('Client ainda não está pronto (ready=false)');
  return client;
}

async function resolveChatId(rawNumber, timeoutMs = 15000) {
  const c = getClientOrThrow();
  const digits = String(rawNumber).replace(/\D/g, '');
  if (!digits) return null;

  const wid = await Promise.race([
    c.getNumberId(digits),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`getNumberId timeout (${timeoutMs}ms) para ${digits}`)), timeoutMs),
    ),
  ]);
  if (!wid) return null;
  return wid._serialized || wid;
}

async function sendMessage(chatId, content, options = {}) {
  const c = getClientOrThrow();
  const priority = options._priority ?? 2;
  delete options._priority;

  // Memoriza fingerprint antes de enviar pra evitar dedupe de eco
  const fp = queue.fingerprint(
    chatId,
    typeof content === 'string' ? content : '[media]',
    options.caption ? true : typeof content !== 'string',
    'chat',
  );
  queue.rememberFingerprint(fp);

  return queue.enqueue(
    () => c.sendMessage(chatId, content, { sendSeen: false, ...options }),
    priority,
  );
}

async function sendMediaFromPath(chatId, filePath, options = {}) {
  if (!fs.existsSync(filePath)) throw new Error(`Arquivo não existe: ${filePath}`);
  const media = MessageMedia.fromFilePath(filePath);
  return sendMessage(chatId, media, options);
}

async function sendVoiceFromPath(chatId, filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`Arquivo de áudio não existe: ${filePath}`);
  const media = MessageMedia.fromFilePath(filePath);
  return sendMessage(chatId, media, { sendAudioAsVoice: true });
}

async function startTyping(chatId, durationMs = 3000) {
  const c = getClientOrThrow();
  const chat = await c.getChatById(chatId);
  await chat.sendStateTyping();
  setTimeout(() => { chat.clearState().catch(() => {}); }, durationMs);
}

async function listGroups() {
  const c = getClientOrThrow();
  const chats = await c.getChats();
  return chats.filter((chat) => chat.isGroup).map((chat) => ({
    id: chat.id._serialized,
    name: chat.name,
    participantsCount: chat.participants?.length || 0,
    unreadCount: chat.unreadCount || 0,
  }));
}

async function getGroupParticipants(groupId) {
  const c = getClientOrThrow();
  const chat = await c.getChatById(groupId);
  if (!chat.isGroup) throw new Error('Chat não é grupo');
  return chat.participants.map((p) => ({
    id: p.id._serialized,
    phone: p.id.user,
    isAdmin: p.isAdmin,
    isSuperAdmin: p.isSuperAdmin,
  }));
}

async function fetchHistory(chatId, limit = 50) {
  const c = getClientOrThrow();
  const chat = await c.getChatById(chatId);
  const messages = await chat.fetchMessages({ limit });
  let saved = 0;
  for (const msg of messages) {
    const row = {
      message_id: msg.id?._serialized,
      chat_id: chatId,
      from_id: msg.from,
      to_id: msg.to,
      direction: msg.fromMe ? 'out' : 'in',
      body: msg.body || '',
      type: msg.type || 'chat',
      has_media: msg.hasMedia ? 1 : 0,
      media_path: null,
      from_me: msg.fromMe ? 1 : 0,
      timestamp: msg.timestamp,
    };
    db.saveMessage(row);
    saved++;
  }
  return { fetched: messages.length, saved };
}

// ----------------------------------------------------------------
// Status
// ----------------------------------------------------------------
function getStatus() {
  return {
    isReady,
    isAuthenticated,
    hasQr: !!currentQr,
    queueSize: queue.size(),
  };
}

function getQr() {
  return currentQr;
}

// ----------------------------------------------------------------
// Graceful shutdown
// ----------------------------------------------------------------
async function shutdown() {
  shuttingDown = true;
  if (watchdogTimer) clearInterval(watchdogTimer);
  if (client) {
    try {
      log.info('[client] encerrando conexão WhatsApp');
      await client.destroy();
    } catch (err) {
      log.error('[client] erro no shutdown:', err?.message);
    }
  }
}

module.exports = {
  init,
  startWatchdog,
  getStatus,
  getQr,
  getClientOrThrow,
  resolveChatId,
  sendMessage,
  sendMediaFromPath,
  sendVoiceFromPath,
  startTyping,
  listGroups,
  getGroupParticipants,
  fetchHistory,
  shutdown,
  on: (event, fn) => emitter.on(event, fn),
};
