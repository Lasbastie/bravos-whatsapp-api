'use strict';
const express = require('express');
const { body, validationResult } = require('express-validator');
const { requireAuth } = require('../auth');
const waClient = require('../client');
const log = require('../logger');

const router = express.Router();

function validateOr422(req, res) {
  const errors = validationResult(req).formatWith(({ msg }) => msg);
  if (!errors.isEmpty()) {
    res.status(422).json({ ok: false, errors: errors.mapped() });
    return false;
  }
  return true;
}

/**
 * POST /send-message
 * Envia mensagem de texto. Aceita número cru OU chatId completo (@c.us, @lid).
 * Bloqueia envio pra grupo (use /send-message-group).
 *
 * Body:
 *   - chatId (string, obrigatório): número ou JID
 *   - message (string, obrigatório): texto
 *   - typingMs (number, opcional): simula digitação antes de enviar
 *   - linkPreview (bool, opcional, default true)
 */
router.post('/send-message',
  requireAuth,
  [body('chatId').notEmpty(), body('message').notEmpty()],
  async (req, res) => {
    if (!validateOr422(req, res)) return;

    const raw = String(req.body.chatId).trim();
    const message = String(req.body.message);
    const typingMs = Number(req.body.typingMs) || 0;
    const linkPreview = String(req.body.linkPreview).toLowerCase() !== 'false';

    if (raw.endsWith('@g.us')) {
      return res.status(400).json({ ok: false, error: 'Use /send-message-group para grupos' });
    }

    try {
      let to = raw;
      if (!raw.includes('@')) {
        to = await waClient.resolveChatId(raw);
        if (!to) return res.status(404).json({ ok: false, error: 'Número não encontrado no WhatsApp' });
      } else if (raw.endsWith('@c.us')) {
        const digits = raw.replace(/\D/g, '');
        const resolved = await waClient.resolveChatId(digits);
        if (!resolved) return res.status(404).json({ ok: false, error: 'Número não encontrado no WhatsApp' });
        to = resolved;
      }

      if (typingMs > 0) {
        await waClient.startTyping(to, typingMs + 1000);
        await new Promise((r) => setTimeout(r, typingMs));
      }

      const response = await waClient.sendMessage(to, message, { linkPreview });
      return res.json({ ok: true, to, messageId: response?.id?._serialized || null });
    } catch (err) {
      log.error('[send-message] erro:', err?.message || err);
      return res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
  },
);

/**
 * POST /send-message-group
 * Envia mensagem de texto pra grupo.
 *
 * Body:
 *   - groupId (string, obrigatório): JID terminado em @g.us
 *   - message (string, obrigatório)
 *   - mentions (array de chatIds, opcional): menciona participantes
 */
router.post('/send-message-group',
  requireAuth,
  [body('groupId').notEmpty(), body('message').notEmpty()],
  async (req, res) => {
    if (!validateOr422(req, res)) return;

    const groupId = String(req.body.groupId).trim();
    const message = String(req.body.message);
    const mentions = Array.isArray(req.body.mentions) ? req.body.mentions : [];

    if (!groupId.endsWith('@g.us')) {
      return res.status(400).json({ ok: false, error: 'groupId deve terminar em @g.us' });
    }

    try {
      const options = { _priority: 3 };
      if (mentions.length > 0) options.mentions = mentions;
      const response = await waClient.sendMessage(groupId, message, options);
      return res.json({ ok: true, messageId: response?.id?._serialized || null });
    } catch (err) {
      log.error('[send-message-group] erro:', err?.message || err);
      return res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
  },
);

/**
 * POST /send-audio
 * Envia áudio como voice note (ptt).
 *
 * Body:
 *   - chatId (string, obrigatório)
 *   - filePath (string, obrigatório): caminho absoluto no servidor
 */
router.post('/send-audio',
  requireAuth,
  [body('chatId').notEmpty(), body('filePath').notEmpty()],
  async (req, res) => {
    if (!validateOr422(req, res)) return;
    const chatId = String(req.body.chatId).trim();
    const filePath = String(req.body.filePath);
    try {
      const response = await waClient.sendVoiceFromPath(chatId, filePath);
      return res.json({ ok: true, messageId: response?.id?._serialized || null });
    } catch (err) {
      log.error('[send-audio] erro:', err?.message || err);
      return res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
  },
);

/**
 * POST /send-media
 * Envia imagem, documento ou vídeo de um arquivo local.
 *
 * Body:
 *   - chatId (string, obrigatório)
 *   - filePath (string, obrigatório): caminho absoluto
 *   - caption (string, opcional)
 */
router.post('/send-media',
  requireAuth,
  [body('chatId').notEmpty(), body('filePath').notEmpty()],
  async (req, res) => {
    if (!validateOr422(req, res)) return;
    const chatId = String(req.body.chatId).trim();
    const filePath = String(req.body.filePath);
    const caption = req.body.caption || undefined;
    try {
      const response = await waClient.sendMediaFromPath(chatId, filePath, { caption });
      return res.json({ ok: true, messageId: response?.id?._serialized || null });
    } catch (err) {
      log.error('[send-media] erro:', err?.message || err);
      return res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
  },
);

/**
 * POST /simulate-typing
 * Mostra indicador "digitando..." pelo tempo informado.
 *
 * Body:
 *   - chatId (string, obrigatório)
 *   - durationMs (number, opcional, default 3000)
 */
router.post('/simulate-typing',
  requireAuth,
  [body('chatId').notEmpty()],
  async (req, res) => {
    if (!validateOr422(req, res)) return;
    const chatId = String(req.body.chatId).trim();
    const durationMs = Number(req.body.durationMs) || 3000;
    try {
      await waClient.startTyping(chatId, durationMs);
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
  },
);

module.exports = router;
