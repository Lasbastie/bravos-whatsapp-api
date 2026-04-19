'use strict';
const express = require('express');
const waClient = require('../client');
const config = require('../config');

const router = express.Router();

/**
 * GET /health
 * Sem auth — pra ser consumido por monitoramento externo.
 */
router.get('/health', (req, res) => {
  const status = waClient.getStatus();
  const ok = status.isReady;
  return res.status(ok ? 200 : 503).json({
    ok,
    clientId: config.CLIENT_ID,
    ...status,
    uptimeSec: Math.round(process.uptime()),
  });
});

module.exports = router;
