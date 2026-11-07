import { config } from '../config.js';
import { one, run } from './index.js';
import { hashPassword, randomPassword } from '../utils/password.js';

/** Cria o primeiro administrador caso ainda não exista nenhum. */
export async function ensureAdmin() {
  if (one("SELECT 1 AS x FROM users WHERE role = 'admin' LIMIT 1")) return null;
  const password = config.seedAdmin.password || randomPassword(12);
  run('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)', [
    config.seedAdmin.name,
    config.seedAdmin.email.toLowerCase(),
    await hashPassword(password),
    'admin',
  ]);
  const line = '='.repeat(64);
  console.log(`\n${line}\n  ADMINISTRADOR INICIAL CRIADO\n  E-mail: ${config.seedAdmin.email}`);
  console.log(config.seedAdmin.password ? '  Senha:  (definida em ADMIN_PASSWORD no .env)' : `  Senha:  ${password}`);
  console.log(`  Altere a senha após o primeiro acesso (menu "Meu perfil").\n${line}\n`);
  return { email: config.seedAdmin.email, password };
}
