'use strict';
const config = require('./config');

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const current = LEVELS[config.LOG_LEVEL] ?? LEVELS.info;

function ts() {
  return new Date().toISOString();
}

function log(level, ...args) {
  if ((LEVELS[level] ?? 1) < current) return;
  const line = `[${ts()}] [${level.toUpperCase()}]`;
  if (level === 'error') console.error(line, ...args);
  else if (level === 'warn') console.warn(line, ...args);
  else console.log(line, ...args);
}

module.exports = {
  debug: (...a) => log('debug', ...a),
  info: (...a) => log('info', ...a),
  warn: (...a) => log('warn', ...a),
  error: (...a) => log('error', ...a),
};
