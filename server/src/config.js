// Carrega variáveis de ambiente e centraliza a configuração do servidor.
// IMPORTANTE: este módulo deve ser o primeiro import do index.js (define o fuso horário).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '../..');

const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

process.env.TZ = process.env.TZ || 'America/Sao_Paulo';

const env = process.env;
const resolveFromRoot = (p) => (path.isAbsolute(p) ? p : path.join(ROOT, p));

export const config = {
  env: env.NODE_ENV || 'development',
  isProd: env.NODE_ENV === 'production',
  port: Number(env.PORT || 3000),
  appUrl: env.APP_URL || `http://localhost:${env.PORT || 3000}`,
  timezone: env.TZ,

  dbPath: resolveFromRoot(env.DB_PATH || 'data/barbearia.db'),
  backupDir: resolveFromRoot(env.BACKUP_DIR || 'data/backups'),
  uploadDir: resolveFromRoot(env.UPLOAD_DIR || 'data/uploads'),
  backupKeep: Number(env.BACKUP_KEEP || 14),
  backupIntervalHours: Number(env.BACKUP_INTERVAL_HOURS || 24),

  sessionDays: Number(env.SESSION_DAYS || 7),
  cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE === 'true' : env.NODE_ENV === 'production',
  trustProxy: env.TRUST_PROXY === 'true',

  smtp: {
    host: env.SMTP_HOST || '',
    port: Number(env.SMTP_PORT || 587),
    secure: env.SMTP_SECURE === 'true',
    user: env.SMTP_USER || '',
    pass: env.SMTP_PASS || '',
    from: env.SMTP_FROM || 'Barbearia <no-reply@barbearia.local>',
  },

  seedAdmin: {
    name: env.ADMIN_NAME || 'Administrador',
    email: env.ADMIN_EMAIL || 'admin@barbearia.local',
    password: env.ADMIN_PASSWORD || '',
  },
};

for (const dir of [path.dirname(config.dbPath), config.backupDir, config.uploadDir]) {
  fs.mkdirSync(dir, { recursive: true });
}
