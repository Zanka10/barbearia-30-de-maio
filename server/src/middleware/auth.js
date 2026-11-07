import crypto from 'node:crypto';
import { one, run } from '../db/index.js';
import { config } from '../config.js';
import { forbidden, unauthorized } from '../utils/errors.js';

export const COOKIE_NAME = 'bb_sid';
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

export function createSession(userId, req) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + config.sessionDays * 86400000);
  run('INSERT INTO sessions (id, user_id, expires_at, ip, user_agent) VALUES (?, ?, ?, ?, ?)', [
    sha256(token),
    userId,
    expires.toISOString(),
    req.ip,
    String(req.get('user-agent') || '').slice(0, 250),
  ]);
  return { token, expires };
}

export function setSessionCookie(res, token, expires) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'lax',
    expires,
    path: '/',
  });
}

export function destroySession(req, res) {
  const token = req.cookies?.[COOKIE_NAME];
  if (token) run('DELETE FROM sessions WHERE id = ?', [sha256(token)]);
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

export function destroyUserSessions(userId, exceptToken) {
  if (exceptToken) run('DELETE FROM sessions WHERE user_id = ? AND id <> ?', [userId, sha256(exceptToken)]);
  else run('DELETE FROM sessions WHERE user_id = ?', [userId]);
}

/** Carrega o usuário da sessão (se houver) em req.user. Não bloqueia a requisição. */
export function loadUser(req, _res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return next();
  const row = one(
    `SELECT u.id, u.name, u.email, u.phone, u.role, u.active, s.expires_at,
            st.id AS staff_id, c.id AS client_id
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN staff st ON st.user_id = u.id
       LEFT JOIN clients c ON c.user_id = u.id
      WHERE s.id = ?`,
    [sha256(token)],
  );
  if (row && row.active && new Date(row.expires_at) > new Date()) {
    req.user = {
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      role: row.role,
      staffId: row.staff_id ?? null,
      clientId: row.client_id ?? null,
    };
  }
  next();
}

export function requireAuth(req, _res, next) {
  if (!req.user) return next(unauthorized());
  next();
}

export const requireRole =
  (...roles) =>
  (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) return next(forbidden());
    next();
  };

export const isAdmin = (user) => user?.role === 'admin';
export const isStaff = (user) => user?.role === 'admin' || user?.role === 'barber';

/**
 * Proteção CSRF: requisições que alteram dados precisam do cabeçalho X-Requested-With.
 * Navegadores não enviam cabeçalhos customizados entre origens sem CORS (que não habilitamos).
 */
export function csrfGuard(req, _res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('x-requested-with') !== 'fetch') return next(forbidden('Requisição bloqueada (CSRF).'));
  next();
}

export function purgeExpiredSessions() {
  run('DELETE FROM sessions WHERE expires_at < ?', [new Date().toISOString()]);
}
