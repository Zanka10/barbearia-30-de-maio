import { config } from './config.js'; // deve ser o primeiro import (define TZ e carrega .env)
import { migrate } from './db/index.js';
import { ensureAdmin } from './db/bootstrap.js';
import { createApp } from './app.js';
import { purgeExpiredSessions } from './middleware/auth.js';
import { scheduleBackups } from './services/backup.js';
import { mailEnabled } from './services/mailer.js';

migrate();
await ensureAdmin();

const app = createApp();
const server = app.listen(config.port, () => {
  console.log(`[servidor] ${config.env} — http://localhost:${config.port} (fuso: ${config.timezone})`);
  console.log(`[e-mail] ${mailEnabled() ? 'SMTP configurado' : 'SMTP não configurado — e-mails serão registrados no log (Configurações > E-mails)'}`);
});

scheduleBackups();
purgeExpiredSessions();
setInterval(purgeExpiredSessions, 6 * 3600 * 1000).unref();

const shutdown = (sig) => {
  console.log(`[servidor] ${sig} recebido, encerrando...`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
