// Configurações gerais, backups e auditoria (somente administrador).
import { Router } from 'express';
import { z } from 'zod';
import { all, getSettings, one, setSetting, tx } from '../db/index.js';
import { requireRole } from '../middleware/auth.js';
import { audit } from '../services/audit.js';
import { backupFilePath, createBackup, listBackups } from '../services/backup.js';
import { mailEnabled, queueMail, renderEmail } from '../services/mailer.js';
import { badRequest, notFound } from '../utils/errors.js';
import { parse } from '../utils/validation.js';

const router = Router();
router.use(requireRole('admin'));

const str = (max) => z.string().trim().max(max).default('');
const settingsSchema = z.object({
  shop_name: z.string().trim().min(2, 'Informe o nome da barbearia.').max(80),
  shop_tagline: str(160),
  shop_phone: str(30),
  shop_whatsapp: str(30),
  shop_email: z.union([z.string().trim().email('E-mail inválido.'), z.literal('')]).default(''),
  shop_address: str(200),
  shop_instagram: str(80),
  slot_interval_min: z.coerce.number().int().refine((v) => [5, 10, 15, 20, 30, 60].includes(v), 'Intervalo inválido.'),
  booking_window_days: z.coerce.number().int().min(1).max(365),
  min_advance_min: z.coerce.number().int().min(0).max(7 * 24 * 60),
  client_cancel_min_hours: z.coerce.number().int().min(0).max(168),
  auto_confirm: z.boolean(),
  notify_admin_email: z.boolean(),
  notify_client_email: z.boolean(),
  privacy_contact: str(160),
});

router.get('/settings', (_req, res) => {
  const s = getSettings();
  res.json({ settings: s, mailEnabled: mailEnabled() });
});

router.put('/settings', (req, res) => {
  const d = parse(settingsSchema, req.body);
  tx(() => {
    for (const [k, v] of Object.entries(d)) setSetting(k, typeof v === 'boolean' ? (v ? '1' : '0') : v);
  });
  audit(req, 'settings.update', 'settings', null);
  res.json({ settings: getSettings() });
});

router.post('/settings/test-email', (req, res) => {
  const to = req.user.email;
  if (!to) throw badRequest('Seu usuário não possui e-mail cadastrado.');
  const { html, text } = renderEmail({ title: 'E-mail de teste', intro: 'Se você recebeu esta mensagem, o envio de e-mails está funcionando.' });
  queueMail({ to, subject: 'Teste de e-mail — Barbearia', html, text });
  res.json({ ok: true, mailEnabled: mailEnabled(), to });
});

router.get('/backups', (_req, res) => res.json({ items: listBackups() }));

router.post('/backups', (req, res) => {
  const b = createBackup('manual');
  audit(req, 'backup.create', 'backup', null, { name: b.name });
  res.status(201).json({ backup: b });
});

router.get('/backups/:name', (req, res) => {
  const file = backupFilePath(req.params.name);
  if (!file) throw notFound('Backup não encontrado.');
  audit(req, 'backup.download', 'backup', null, { name: req.params.name });
  res.download(file);
});

router.get('/audit', (req, res) => {
  const q = parse(
    z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(10).max(200).default(50), action: z.string().max(60).optional() }),
    req.query,
  );
  const filter = q.action ? 'WHERE l.action LIKE ?' : '';
  const params = q.action ? [`${q.action}%`] : [];
  const items = all(
    `SELECT l.*, u.name AS user_name, u.role AS user_role FROM audit_log l LEFT JOIN users u ON u.id = l.user_id ${filter}
      ORDER BY l.id DESC LIMIT ? OFFSET ?`,
    [...params, q.pageSize, (q.page - 1) * q.pageSize],
  );
  const total = one(`SELECT COUNT(*) AS n FROM audit_log l ${filter}`, params).n;
  res.json({ items, total, page: q.page, pageSize: q.pageSize });
});

router.get('/email-log', (_req, res) => {
  res.json({ items: all('SELECT id, to_address, subject, status, error, created_at FROM email_log ORDER BY id DESC LIMIT 100'), mailEnabled: mailEnabled() });
});

export default router;
