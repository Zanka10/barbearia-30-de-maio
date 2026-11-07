// Uso: npm run backup  — gera um backup manual do banco em data/backups
import '../config.js';
import { migrate } from './index.js';
import { createBackup } from '../services/backup.js';

migrate();
const b = createBackup('manual');
console.log(`Backup criado: ${b.name} (${(b.size / 1024).toFixed(1)} KB)`);
