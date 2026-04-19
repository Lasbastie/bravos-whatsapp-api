'use strict';
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const config = require('./config');
const log = require('./logger');

// Garante que a pasta do banco existe
fs.mkdirSync(path.dirname(config.DB_PATH), { recursive: true });

const db = new Database(config.DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');

// ----------------------------------------------------------------
// Schema
// ----------------------------------------------------------------
db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id  TEXT UNIQUE,
    chat_id     TEXT NOT NULL,
    from_id     TEXT,
    to_id       TEXT,
    direction   TEXT NOT NULL CHECK(direction IN ('in','out')),
    body        TEXT,
    type        TEXT,
    has_media   INTEGER DEFAULT 0,
    media_path  TEXT,
    from_me     INTEGER DEFAULT 0,
    timestamp   TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_messages_chat_ts ON messages(chat_id, timestamp);
  CREATE INDEX IF NOT EXISTS idx_messages_direction ON messages(direction);

  CREATE TABLE IF NOT EXISTS contacts (
    chat_id     TEXT PRIMARY KEY,
    phone       TEXT,
    pushname    TEXT,
    is_group    INTEGER DEFAULT 0,
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS muted_contacts (
    chat_id     TEXT PRIMARY KEY,
    reason      TEXT,
    muted_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// ----------------------------------------------------------------
// Prepared statements
// ----------------------------------------------------------------
const stmtInsertMessage = db.prepare(`
  INSERT OR IGNORE INTO messages
    (message_id, chat_id, from_id, to_id, direction, body, type, has_media, media_path, from_me, timestamp)
  VALUES
    (@message_id, @chat_id, @from_id, @to_id, @direction, @body, @type, @has_media, @media_path, @from_me, @timestamp)
`);

const stmtUpsertContact = db.prepare(`
  INSERT INTO contacts (chat_id, phone, pushname, is_group, updated_at)
  VALUES (@chat_id, @phone, @pushname, @is_group, datetime('now'))
  ON CONFLICT(chat_id) DO UPDATE SET
    phone = COALESCE(excluded.phone, phone),
    pushname = COALESCE(excluded.pushname, pushname),
    is_group = excluded.is_group,
    updated_at = datetime('now')
`);

const stmtMuteInsert = db.prepare(`
  INSERT INTO muted_contacts (chat_id, reason, muted_at)
  VALUES (@chat_id, @reason, datetime('now'))
  ON CONFLICT(chat_id) DO UPDATE SET
    reason = excluded.reason,
    muted_at = datetime('now')
`);
const stmtMuteDelete = db.prepare(`DELETE FROM muted_contacts WHERE chat_id = ?`);
const stmtMuteCheck = db.prepare(`SELECT 1 FROM muted_contacts WHERE chat_id = ?`);
const stmtMuteList = db.prepare(`SELECT chat_id, reason, muted_at FROM muted_contacts ORDER BY muted_at DESC`);

const stmtHistory = db.prepare(`
  SELECT message_id, chat_id, from_id, to_id, direction, body, type, has_media, media_path, from_me, timestamp
  FROM messages
  WHERE chat_id = ?
  ORDER BY timestamp DESC
  LIMIT ?
`);

// ----------------------------------------------------------------
// API pública
// ----------------------------------------------------------------
function saveMessage(row) {
  try {
    const ts =
      row.timestamp && typeof row.timestamp === 'number' && row.timestamp < 1e12
        ? new Date(row.timestamp * 1000).toISOString()
        : row.timestamp
          ? new Date(row.timestamp).toISOString()
          : new Date().toISOString();
    stmtInsertMessage.run({
      message_id: row.message_id || null,
      chat_id: row.chat_id || '',
      from_id: row.from_id || null,
      to_id: row.to_id || null,
      direction: row.direction,
      body: row.body || '',
      type: row.type || 'chat',
      has_media: row.has_media ? 1 : 0,
      media_path: row.media_path || null,
      from_me: row.from_me ? 1 : 0,
      timestamp: ts,
    });
  } catch (err) {
    log.error('[db] saveMessage falhou:', err?.message || err);
  }
}

function upsertContact({ chat_id, phone, pushname, is_group }) {
  try {
    stmtUpsertContact.run({
      chat_id: chat_id || '',
      phone: phone || null,
      pushname: pushname || null,
      is_group: is_group ? 1 : 0,
    });
  } catch (err) {
    log.error('[db] upsertContact falhou:', err?.message || err);
  }
}

function muteContact(chat_id, reason) {
  stmtMuteInsert.run({ chat_id, reason: reason || null });
}

function unmuteContact(chat_id) {
  stmtMuteDelete.run(chat_id);
}

function isMuted(chat_id) {
  return !!stmtMuteCheck.get(chat_id);
}

function listMuted() {
  return stmtMuteList.all();
}

function getHistory(chat_id, limit = 50) {
  return stmtHistory.all(chat_id, Math.min(limit, 500));
}

module.exports = {
  db,
  saveMessage,
  upsertContact,
  muteContact,
  unmuteContact,
  isMuted,
  listMuted,
  getHistory,
};
