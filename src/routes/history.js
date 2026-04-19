'use strict';
const express = require('express');
const { requireAuth } = require('../auth');
const waClient = require('../client');
const db = require('../db');

const router = express.Router();

/**
 * GET /history?chatId=...&limit=50
 * Retorna as últimas mensagens salvas no banco pro chatId.
 */
router.get('/history', requireAuth, (req, res) => {
  const chatId = String(req.query.chatId || '').trim();
  const limit = Math.min(Number(req.query.limit) || 50, 500);
  if (!chatId) return res.status(400).json({ ok: false, error: 'chatId obrigatório' });
  try {
    const rows = db.getHistory(chatId, limit);
    return res.json({ ok: true, chatId, count: rows.length, messages: rows });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
});

/**
 * POST /fetch-history
 * Busca mensagens do WhatsApp (não só do banco) e salva no SQLite.
 * Útil pra hidratar histórico de um chat logo após conectar.
 *
 * Body:
 *   - chatId (string, obrigatório)
 *   - limit (number, opcional, default 50, max 500)
 */
router.post('/fetch-history', requireAuth, async (req, res) => {
  const chatId = String(req.body.chatId || '').trim();
  const limit = Math.min(Number(req.body.limit) || 50, 500);
  if (!chatId) return res.status(400).json({ ok: false, error: 'chatId obrigatório' });
  try {
    const result = await waClient.fetchHistory(chatId, limit);
    return res.json({ ok: true, chatId, ...result });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
});

module.exports = router;
