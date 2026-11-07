// Conexão com SQLite (módulo nativo node:sqlite) + helpers de consulta e transação.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { config } from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const db = new DatabaseSync(config.dbPath);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;
`);

const cache = new Map();
function stmt(sql) {
  let s = cache.get(sql);
  if (!s) {
    s = db.prepare(sql);
    cache.set(sql, s);
  }
  return s;
}

// node:sqlite não aceita `undefined` como parâmetro: converte para null.
function clean(params) {
  if (params == null) return [];
  if (Array.isArray(params)) return params.map((v) => (v === undefined ? null : typeof v === 'boolean' ? Number(v) : v));
  const out = {};
  for (const [k, v] of Object.entries(params)) out[k] = v === undefined ? null : typeof v === 'boolean' ? Number(v) : v;
  return [out];
}

export const one = (sql, params) => stmt(sql).get(...clean(params));
export const all = (sql, params) => stmt(sql).all(...clean(params));
export const run = (sql, params) => {
  const r = stmt(sql).run(...clean(params));
  return { changes: Number(r.changes), id: Number(r.lastInsertRowid) };
};

// Transação com suporte a aninhamento via SAVEPOINT.
let depth = 0;
export function tx(fn) {
  const sp = `sp_${depth}`;
  db.exec(depth === 0 ? 'BEGIN IMMEDIATE' : `SAVEPOINT ${sp}`);
  depth++;
  try {
    const result = fn();
    depth--;
    db.exec(depth === 0 ? 'COMMIT' : `RELEASE ${sp}`);
    return result;
  } catch (err) {
    depth--;
    db.exec(depth === 0 ? 'ROLLBACK' : `ROLLBACK TO ${sp}; RELEASE ${sp}`);
    throw err;
  }
}

export function migrate() {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  )`);
  const dir = path.join(__dirname, 'migrations');
  const applied = new Set(all('SELECT name FROM schema_migrations').map((r) => r.name));
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    tx(() => {
      db.exec(sql);
      run('INSERT INTO schema_migrations (name) VALUES (?)', [file]);
    });
    console.log(`[db] migration aplicada: ${file}`);
  }
}

export function getSetting(key, fallback = null) {
  const row = one('SELECT value FROM settings WHERE key = ?', [key]);
  return row?.value ?? fallback;
}

export function getSettings() {
  return Object.fromEntries(all('SELECT key, value FROM settings').map((r) => [r.key, r.value]));
}

export function setSetting(key, value) {
  run(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, value == null ? null : String(value)],
  );
}
