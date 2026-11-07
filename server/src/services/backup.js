// Backups consistentes do SQLite via VACUUM INTO (seguro com o banco em uso).
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { db } from '../db/index.js';

const PREFIX = 'barbearia-';

export function listBackups() {
  if (!fs.existsSync(config.backupDir)) return [];
  return fs
    .readdirSync(config.backupDir)
    .filter((f) => f.startsWith(PREFIX) && f.endsWith('.db'))
    .map((name) => {
      const st = fs.statSync(path.join(config.backupDir, name));
      return { name, size: st.size, created_at: st.mtime.toISOString(), auto: name.includes('-auto') };
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function createBackup(kind = 'manual') {
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').replace(/\..+$/, '');
  const name = `${PREFIX}${stamp}-${kind === 'auto' ? 'auto' : 'manual'}.db`;
  const target = path.join(config.backupDir, name);
  db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
  prune();
  return { name, size: fs.statSync(target).size };
}

function prune() {
  const autos = listBackups().filter((b) => b.auto);
  for (const b of autos.slice(config.backupKeep)) fs.rmSync(path.join(config.backupDir, b.name), { force: true });
}

export function backupFilePath(name) {
  const safe = path.basename(name);
  if (!safe.startsWith(PREFIX) || !safe.endsWith('.db')) return null;
  const p = path.join(config.backupDir, safe);
  return fs.existsSync(p) ? p : null;
}

/** Agenda backups automáticos periódicos (verificação a cada hora). */
export function scheduleBackups() {
  const check = () => {
    try {
      const lastAuto = listBackups().find((b) => b.auto);
      const age = lastAuto ? Date.now() - new Date(lastAuto.created_at).getTime() : Infinity;
      if (age >= config.backupIntervalHours * 3600 * 1000) {
        const b = createBackup('auto');
        console.log(`[backup] backup automático criado: ${b.name}`);
      }
    } catch (err) {
      console.error('[backup] falha no backup automático:', err.message);
    }
  };
  setTimeout(check, 10_000).unref();
  setInterval(check, 3600 * 1000).unref();
}
