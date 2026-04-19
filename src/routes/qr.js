'use strict';
const express = require('express');
const qrcode = require('qrcode');
const { requireAuth } = require('../auth');
const waClient = require('../client');

const router = express.Router();

/**
 * GET /qr.png — retorna o QR atual como PNG (sem auth pra facilitar scan rápido)
 * GET /qr.txt — retorna o QR em texto puro (útil pra terminal)
 * GET /qr.json — status + QR em base64 (pra front-end consumir)
 *
 * Quando o cliente já está autenticado, retorna 204 (sem QR a mostrar).
 */

router.get('/qr.png', async (req, res) => {
  const qr = waClient.getQr();
  if (!qr) return res.status(204).end();
  try {
    const buf = await qrcode.toBuffer(qr, { width: 400, margin: 2 });
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'no-store');
    return res.send(buf);
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message });
  }
});

router.get('/qr.txt', (req, res) => {
  const qr = waClient.getQr();
  if (!qr) return res.status(204).end();
  res.set('Content-Type', 'text/plain; charset=utf-8');
  return res.send(qr);
});

router.get('/qr.json', async (req, res) => {
  const qr = waClient.getQr();
  const status = waClient.getStatus();
  if (!qr) return res.json({ ok: true, status, qr: null });
  try {
    const dataUrl = await qrcode.toDataURL(qr, { width: 400, margin: 2 });
    return res.json({ ok: true, status, qr: dataUrl });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message });
  }
});

module.exports = router;
