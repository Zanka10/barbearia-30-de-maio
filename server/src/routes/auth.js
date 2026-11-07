import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { one, run, tx } from '../db/index.js';
import {
  createSession,
  destroySession,
  destroyUserSessions,
  requireAuth,
  setSessionCookie,
  COOKIE_NAME,
} from '../middleware/auth.js';
import { DUMMY_HASH, hashPassword, verifyPassword } from '../utils/password.js';
import { conflict, unauthorized, AppError } from '../utils/errors.js';
import { normalizePhone, parse, zEmail, zName, zOptionalEmail, zPassword, zPhone } from '../utils/validation.js';
import { nowIso } from '../utils/time.js';
import { audit } from '../services/audit.js';

const router = Router();

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { message: 'Muitas tentativas de login. Aguarde alguns minutos.', code: 'RATE_LIMIT' } },
});

function publicUser(id) {
  const u = one(
    `SELECT u.id, u.name, u.email, u.phone, u.role, st.id AS staff_id, st.photo_path, c.id AS client_id
       FROM users u LEFT JOIN staff st ON st.user_id = u.id LEFT JOIN clients c ON c.user_id = u.id
      WHERE u.id = ?`,
    [id],
  );
  return u && { ...u, staffId: u.staff_id, clientId: u.client_id };
}

router.post('/login', loginLimiter, async (req, res) => {
  const { identifier, password, scope } = parse(
    z.object({
      identifier: z.string().trim().min(3, 'Informe e-mail ou celular.').max(160),
      password: z.string().min(1, 'Informe a senha.').max(128),
      // Área de onde vem o login: 'client' (site) ou 'staff' (painel). Cada uma só aceita o próprio tipo de conta.
      scope: z.enum(['client', 'staff']).optional(),
    }),
    req.body,
  );
  const isEmail = identifier.includes('@');
  const user = isEmail
    ? one('SELECT * FROM users WHERE email = ?', [identifier.toLowerCase()])
    : one('SELECT * FROM users WHERE phone = ?', [normalizePhone(identifier)]);

  if (user?.locked_until && new Date(user.locked_until) > new Date()) {
    throw new AppError(423, 'Conta temporariamente bloqueada por excesso de tentativas. Tente novamente em alguns minutos.', { code: 'LOCKED' });
  }
  const ok = await verifyPassword(password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !ok) {
    if (user) {
      const attempts = user.failed_logins + 1;
      const lock = attempts >= MAX_ATTEMPTS ? new Date(Date.now() + LOCK_MINUTES * 60000).toISOString() : null;
      run('UPDATE users SET failed_logins = ?, locked_until = ? WHERE id = ?', [lock ? 0 : attempts, lock, user.id]);
      audit({ ...req, user: { id: user.id } }, 'auth.login_failed', 'user', user.id);
    }
    throw unauthorized('Credenciais inválidas.');
  }
  if (!user.active) throw unauthorized('Usuário inativo. Procure o administrador.');

  // Senha correta, mas conta de outra área: não cria sessão e orienta para o login certo.
  const isStaff = user.role === 'admin' || user.role === 'barber';
  if (scope === 'client' && isStaff) {
    throw new AppError(403, 'Esta é a área do cliente. Funcionários devem entrar pelo painel de gestão.', { code: 'WRONG_AREA', details: { area: 'staff' } });
  }
  if (scope === 'staff' && !isStaff) {
    throw new AppError(403, 'Acesso restrito à equipe da barbearia. Clientes devem entrar pela área do cliente.', { code: 'WRONG_AREA', details: { area: 'client' } });
  }

  run('UPDATE users SET failed_logins = 0, locked_until = NULL, last_login_at = ? WHERE id = ?', [nowIso(), user.id]);
  const { token, expires } = createSession(user.id, req);
  setSessionCookie(res, token, expires);
  audit({ ...req, user: { id: user.id } }, 'auth.login', 'user', user.id);
  res.json({ user: publicUser(user.id) });
});

router.post('/logout', (req, res) => {
  if (req.user) audit(req, 'auth.logout', 'user', req.user.id);
  destroySession(req, res);
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  res.json({ user: req.user ? publicUser(req.user.id) : null });
});

/** Cadastro de cliente para acessar a área do cliente (histórico e agendamentos). */
router.post('/register', loginLimiter, async (req, res) => {
  const data = parse(
    z.object({
      name: zName,
      phone: zPhone,
      email: zOptionalEmail,
      password: zPassword,
      consent: z.literal(true, { error: 'É necessário aceitar a Política de Privacidade.' }),
    }),
    req.body,
  );
  if (one('SELECT 1 AS x FROM users WHERE phone = ?', [data.phone])) {
    throw conflict('Já existe uma conta com este celular. Faça login.', 'DUPLICATE_PHONE');
  }
  if (data.email && one('SELECT 1 AS x FROM users WHERE email = ?', [data.email])) {
    throw conflict('Já existe uma conta com este e-mail. Faça login.', 'DUPLICATE_EMAIL');
  }
  const existingClient = one('SELECT * FROM clients WHERE phone = ?', [data.phone]);
  if (existingClient?.user_id) throw conflict('Este celular já possui uma conta. Faça login.', 'DUPLICATE_PHONE');
  // Proteção contra apropriação de histórico alheio: se o cadastro já possui e-mail, ele deve conferir.
  if (existingClient?.email && existingClient.email.toLowerCase() !== (data.email || '').toLowerCase()) {
    throw conflict(
      'Encontramos um cadastro com este celular, mas o e-mail informado não confere. Informe o e-mail usado nos agendamentos ou procure a barbearia.',
      'IDENTITY_MISMATCH',
    );
  }

  const passwordHash = await hashPassword(data.password);
  const userId = tx(() => {
    const { id } = run('INSERT INTO users (name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?)', [
      data.name,
      data.email,
      data.phone,
      passwordHash,
      'client',
    ]);
    if (existingClient) {
      run('UPDATE clients SET user_id = ?, email = COALESCE(email, ?), consent_at = COALESCE(consent_at, ?), consent_version = COALESCE(consent_version, ?), updated_at = ? WHERE id = ?', [
        id,
        data.email,
        nowIso(),
        '1.0',
        nowIso(),
        existingClient.id,
      ]);
    } else {
      run('INSERT INTO clients (user_id, name, phone, email, consent_at, consent_version) VALUES (?, ?, ?, ?, ?, ?)', [
        id,
        data.name,
        data.phone,
        data.email,
        nowIso(),
        '1.0',
      ]);
    }
    return id;
  });
  const { token, expires } = createSession(userId, req);
  setSessionCookie(res, token, expires);
  audit({ ...req, user: { id: userId } }, 'auth.register', 'user', userId, { linkedExistingClient: !!existingClient });
  res.status(201).json({ user: publicUser(userId) });
});

router.post('/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = parse(
    z.object({ currentPassword: z.string().min(1, 'Informe a senha atual.'), newPassword: zPassword }),
    req.body,
  );
  const user = one('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
  if (!(await verifyPassword(currentPassword, user.password_hash))) throw unauthorized('Senha atual incorreta.');
  run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', [await hashPassword(newPassword), nowIso(), req.user.id]);
  destroyUserSessions(req.user.id, req.cookies[COOKIE_NAME]);
  audit(req, 'auth.password_changed', 'user', req.user.id);
  res.json({ ok: true });
});

router.put('/profile', requireAuth, (req, res) => {
  const data = parse(z.object({ name: zName, email: z.union([zEmail, z.literal('')]).optional() }), req.body);
  const email = data.email || null;
  if (!email && !req.user.phone) throw conflict('Informe um e-mail (necessário para login).');
  tx(() => {
    run('UPDATE users SET name = ?, email = ?, updated_at = ? WHERE id = ?', [data.name, email, nowIso(), req.user.id]);
    if (req.user.clientId) run('UPDATE clients SET name = ?, email = ?, updated_at = ? WHERE id = ?', [data.name, email, nowIso(), req.user.clientId]);
  });
  audit(req, 'user.profile_updated', 'user', req.user.id);
  res.json({ user: publicUser(req.user.id) });
});

export default router;
