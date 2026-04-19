'use strict';
const express = require('express');
const { requireAuth } = require('../auth');
const waClient = require('../client');
const log = require('../logger');

const router = express.Router();

/**
 * GET /groups
 * Lista todos os grupos em que o número tá conectado.
 * Query opcional: ?name=substring pra filtrar por nome.
 */
router.get('/groups', requireAuth, async (req, res) => {
  try {
    const filter = (req.query.name || '').toString().toLowerCase().trim();
    const groups = await waClient.listGroups();
    const out = filter
      ? groups.filter((g) => g.name.toLowerCase().includes(filter))
      : groups;
    return res.json({ ok: true, count: out.length, groups: out });
  } catch (err) {
    log.error('[groups] erro:', err?.message || err);
    return res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
});

/**
 * GET /groups/:groupId/participants
 * Lista participantes de um grupo.
 */
router.get('/groups/:groupId/participants', requireAuth, async (req, res) => {
  try {
    const participants = await waClient.getGroupParticipants(req.params.groupId);
    return res.json({ ok: true, count: participants.length, participants });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
});

module.exports = router;
