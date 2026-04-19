'use strict';
require('dotenv').config();

const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const config = {
  PORT: Number(process.env.PORT || 8095),
  CLIENT_ID: process.env.CLIENT_ID || 'bravos-worker',
  API_TOKEN: process.env.API_TOKEN || '',
  DB_PATH: process.env.DB_PATH
    ? path.resolve(process.env.DB_PATH)
    : path.join(ROOT, 'data', 'whatsapp.db'),
  LOG_LEVEL: (process.env.LOG_LEVEL || 'info').toLowerCase(),
  ROOT,
};

if (!config.API_TOKEN || config.API_TOKEN.length < 16) {
  console.error('[config] API_TOKEN ausente ou fraco. Gere com: openssl rand -hex 32');
  process.exit(1);
}

module.exports = config;
