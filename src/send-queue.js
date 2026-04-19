'use strict';
// Fila global de envios — serializa todas as mensagens que saem do worker
// e aplica delay aleatório entre elas (anti-ban).
//
// Uso:
//   const q = require('./send-queue');
//   await q.enqueue(() => client.sendMessage(chatId, text, { sendSeen: false }), 2);
//
// Prioridades: menor número = mais rápido. Default 2.

const log = require('./logger');

const queue = [];
let processing = false;

const MIN_DELAY = 7000;            // 7s
const MAX_DELAY = 15000;           // 15s
const BURST_THRESHOLD = 5;          // 5+ na fila = rajada
const BURST_EXTRA = 5000;           // +até 5s extra em rajada

// Dedupe por fingerprint (chatId + body + media + type)
const recentFingerprints = new Map();
const FINGERPRINT_TTL = 15000;

function fingerprint(chatId, body, hasMedia = false, type = '') {
  return [
    String(chatId || '').trim(),
    String(body || '').trim(),
    hasMedia ? '1' : '0',
    String(type || '').trim(),
  ].join('||');
}

function rememberFingerprint(key) {
  recentFingerprints.set(key, Date.now());
  setTimeout(() => recentFingerprints.delete(key), FINGERPRINT_TTL);
}

function wasRecentlySent(key) {
  return recentFingerprints.has(key);
}

function randomDelay() {
  let base = MIN_DELAY + Math.random() * (MAX_DELAY - MIN_DELAY);
  if (queue.length >= BURST_THRESHOLD) {
    base += BURST_EXTRA * Math.random() + BURST_EXTRA * 0.4;
    log.debug(`[queue] Anti-rajada ativo (${queue.length} na fila), delay extra aplicado`);
  }
  return base;
}

async function process() {
  if (processing) return;
  processing = true;

  while (queue.length > 0) {
    const item = queue.shift();
    try {
      const result = await item.fn();
      item.resolve(result);
    } catch (err) {
      log.error('[queue] envio falhou:', err?.message || err);
      item.reject(err);
    }
    if (queue.length > 0) {
      const delay = randomDelay();
      log.debug(`[queue] aguardando ${Math.round(delay / 1000)}s | pendentes: ${queue.length}`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  processing = false;
}

function enqueue(fn, priority = 2) {
  return new Promise((resolve, reject) => {
    queue.push({ fn, priority, resolve, reject, ts: Date.now() });
    queue.sort((a, b) => a.priority - b.priority || a.ts - b.ts);
    process();
  });
}

function size() {
  return queue.length;
}

module.exports = {
  enqueue,
  size,
  fingerprint,
  rememberFingerprint,
  wasRecentlySent,
};
