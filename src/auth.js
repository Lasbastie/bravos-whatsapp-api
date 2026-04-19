'use strict';
const config = require('./config');

/**
 * Middleware Bearer token. Aceita:
 *  - Authorization: Bearer <token>
 *  - ?token=<token> na query string
 */
function requireAuth(req, res, next) {
  const recebido =
    req.headers['authorization']?.replace(/^Bearer\s+/i, '') ||
    req.query.token;
  if (!recebido || recebido !== config.API_TOKEN) {
    return res.status(401).json({ ok: false, error: 'Token inválido ou ausente' });
  }
  next();
}

module.exports = { requireAuth };
