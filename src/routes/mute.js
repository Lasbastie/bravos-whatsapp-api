'use strict';
const express = require('express');
const { body } = require('express-validator');
const { requireAuth } = require('../auth');
const db = require('../db');

const router = express.Router();

/**
 * POST /mute
 * Marca um contato como silenciado (metadado em DB). Não bloqueia envio/recebimento
 * automaticamente — o sistema externo que decide como usar esse estado.
 *
 * Body:
 *   - chatId (string, obrigatório)
 *   - reason (string, opcional)
 */
router.post('/mute', requireAuth, [body('chatId').notEmpty()], (req, res) => {
  const chatId = String(req.body.chatId).trim();
  const reason = req.body.reason || null;
  try {
    db.muteContact(chatId, reason);
    return res.json({ ok: true, chatId, muted: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
});

router.post('/unmute', requireAuth, [body('chatId').notEmpty()], (req, res) => {
  const chatId = String(req.body.chatId).trim();
  try {
    db.unmuteContact(chatId);
    return res.json({ ok: true, chatId, muted: false });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
});

router.get('/mute', requireAuth, (req, res) => {
  const list = db.listMuted();
  return res.json({ ok: true, count: list.length, muted: list });
});

router.get('/mute/:chatId', requireAuth, (req, res) => {
  return res.json({ ok: true, chatId: req.params.chatId, muted: db.isMuted(req.params.chatId) });
});

module.exports = router;
