import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { config } from '../config.js';
import { all, one, run, tx } from '../db/index.js';
import { destroyUserSessions, requireRole } from '../middleware/auth.js';
import { audit } from '../services/audit.js';
import { badRequest, conflict, forbidden, notFound } from '../utils/errors.js';
import { hashPassword } from '../utils/password.js';
import { nowIso, todayStr } from '../utils/time.js';
import { parse, zEmail, zName, zPassword, zPhone, zText } from '../utils/validation.js';

const router = Router();
router.use(requireRole('admin', 'barber'));

const photoDir = path.join(config.uploadDir, 'staff');
fs.mkdirSync(photoDir, { recursive: true });
const MIME_EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const upload = multer({
  storage: multer.diskStorage({
    destination: photoDir,
    filename: (_req, file, cb) => cb(null, crypto.randomBytes(12).toString('hex') + MIME_EXT[file.mimetype]),
  }),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (MIME_EXT[file.mimetype]) cb(null, true);
    else cb(badRequest('Formato de imagem inválido. Use JPG, PNG ou WEBP.'));
  },
});

function removePhotoFile(photoPath) {
  if (!photoPath) return;
  const file = path.join(photoDir, path.basename(photoPath));
  fs.rm(file, { force: true }, () => {});
}

function loadStaff(id) {
  const s = one(
    `SELECT st.*, u.name, u.email, u.phone, u.role, u.active AS user_active, u.last_login_at
       FROM staff st JOIN users u ON u.id = st.user_id WHERE st.id = ?`,
    [id],
  );
  if (!s) return null;
  s.service_ids = all('SELECT service_id FROM staff_services WHERE staff_id = ?', [id]).map((r) => r.service_id);
  s.days_off = all('SELECT weekday FROM staff_days_off WHERE staff_id = ? ORDER BY weekday', [id]).map((r) => r.weekday);
  return s;
}

router.get('/', (req, res) => {
  const items = all(
    `SELECT st.id, st.user_id, st.photo_path, st.specialties, st.color, st.active, u.name, u.email, u.phone, u.role,
            u.active AS user_active, u.last_login_at,
            (SELECT GROUP_CONCAT(service_id) FROM staff_services WHERE staff_id = st.id) AS service_ids,
            (SELECT GROUP_CONCAT(weekday) FROM staff_days_off WHERE staff_id = st.id) AS days_off,
            (SELECT COUNT(*) FROM service_history h WHERE h.staff_id = st.id) AS services_done,
            (SELECT COUNT(*) FROM appointments a WHERE a.staff_id = st.id AND a.date >= ? AND a.status IN ('pending','confirmed')) AS upcoming
       FROM staff st JOIN users u ON u.id = st.user_id
      ORDER BY st.active DESC, u.name`,
    [todayStr()],
  ).map((s) => ({
    ...s,
    service_ids: s.service_ids ? s.service_ids.split(',').map(Number) : [],
    days_off: s.days_off ? s.days_off.split(',').map(Number) : [],
    // Barbeiros não precisam ver contatos dos colegas
    ...(req.user.role === 'barber' && s.id !== req.user.staffId ? { email: null, phone: null, last_login_at: null } : {}),
  }));
  res.json({ items });
});

router.get('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (req.user.role === 'barber' && id !== req.user.staffId) throw forbidden();
  const s = loadStaff(id);
  if (!s) throw notFound('Funcionário não encontrado.');
  res.json({ staff: s });
});

const baseSchema = {
  name: zName,
  email: zEmail,
  phone: zPhone,
  specialties: zText(300),
  bio: zText(1000),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Cor inválida.').default('#c9a24a'),
  role: z.enum(['barber', 'admin']).default('barber'),
  serviceIds: z.array(z.coerce.number().int().positive()).default([]),
  daysOff: z.array(z.coerce.number().int().min(0).max(6)).default([]),
  active: z.boolean().default(true),
};

function saveRelations(staffId, serviceIds, daysOff) {
  run('DELETE FROM staff_services WHERE staff_id = ?', [staffId]);
  for (const sid of new Set(serviceIds)) {
    if (!one('SELECT 1 AS x FROM services WHERE id = ?', [sid])) throw badRequest(`Serviço #${sid} não existe.`);
    run('INSERT INTO staff_services (staff_id, service_id) VALUES (?, ?)', [staffId, sid]);
  }
  run('DELETE FROM staff_days_off WHERE staff_id = ?', [staffId]);
  for (const wd of new Set(daysOff)) run('INSERT INTO staff_days_off (staff_id, weekday) VALUES (?, ?)', [staffId, wd]);
}

router.post('/', requireRole('admin'), async (req, res) => {
  const data = parse(z.object({ ...baseSchema, password: zPassword }), req.body);
  if (one('SELECT 1 AS x FROM users WHERE email = ?', [data.email])) throw conflict('Já existe um usuário com este e-mail.', 'DUPLICATE_EMAIL');
  if (one('SELECT 1 AS x FROM users WHERE phone = ?', [data.phone])) throw conflict('Já existe um usuário com este celular.', 'DUPLICATE_PHONE');
  const hash = await hashPassword(data.password);
  const staffId = tx(() => {
    const { id: userId } = run('INSERT INTO users (name, email, phone, password_hash, role, active) VALUES (?, ?, ?, ?, ?, ?)', [
      data.name,
      data.email,
      data.phone,
      hash,
      data.role,
      data.active ? 1 : 0,
    ]);
    const { id } = run('INSERT INTO staff (user_id, specialties, bio, color, active) VALUES (?, ?, ?, ?, ?)', [
      userId,
      data.specialties,
      data.bio,
      data.color,
      data.active ? 1 : 0,
    ]);
    saveRelations(id, data.serviceIds, data.daysOff);
    return id;
  });
  audit(req, 'staff.create', 'staff', staffId, { name: data.name, role: data.role });
  res.status(201).json({ staff: loadStaff(staffId) });
});

router.put('/:id', requireRole('admin'), (req, res) => {
  const id = Number(req.params.id);
  const current = loadStaff(id);
  if (!current) throw notFound('Funcionário não encontrado.');
  const data = parse(z.object(baseSchema), req.body);
  if (one('SELECT 1 AS x FROM users WHERE email = ? AND id <> ?', [data.email, current.user_id])) throw conflict('E-mail já utilizado por outro usuário.', 'DUPLICATE_EMAIL');
  if (one('SELECT 1 AS x FROM users WHERE phone = ? AND id <> ?', [data.phone, current.user_id])) throw conflict('Celular já utilizado por outro usuário.', 'DUPLICATE_PHONE');
  if (current.user_id === req.user.id && (data.role !== 'admin' || !data.active)) {
    throw badRequest('Você não pode remover seu próprio acesso de administrador ou se desativar.');
  }
  tx(() => {
    run('UPDATE users SET name = ?, email = ?, phone = ?, role = ?, active = ?, updated_at = ? WHERE id = ?', [
      data.name,
      data.email,
      data.phone,
      data.role,
      data.active ? 1 : 0,
      nowIso(),
      current.user_id,
    ]);
    run('UPDATE staff SET specialties = ?, bio = ?, color = ?, active = ?, updated_at = ? WHERE id = ?', [
      data.specialties,
      data.bio,
      data.color,
      data.active ? 1 : 0,
      nowIso(),
      id,
    ]);
    saveRelations(id, data.serviceIds, data.daysOff);
  });
  if (!data.active) destroyUserSessions(current.user_id);
  audit(req, 'staff.update', 'staff', id);
  res.json({ staff: loadStaff(id) });
});

router.patch('/:id/status', requireRole('admin'), (req, res) => {
  const id = Number(req.params.id);
  const { active } = parse(z.object({ active: z.boolean() }), req.body);
  const s = loadStaff(id);
  if (!s) throw notFound('Funcionário não encontrado.');
  if (s.user_id === req.user.id && !active) throw badRequest('Você não pode desativar a si mesmo.');
  tx(() => {
    run('UPDATE staff SET active = ?, updated_at = ? WHERE id = ?', [active ? 1 : 0, nowIso(), id]);
    run('UPDATE users SET active = ?, updated_at = ? WHERE id = ?', [active ? 1 : 0, nowIso(), s.user_id]);
  });
  if (!active) destroyUserSessions(s.user_id);
  const upcoming = one(
    "SELECT COUNT(*) AS n FROM appointments WHERE staff_id = ? AND date >= ? AND status IN ('pending','confirmed')",
    [id, todayStr()],
  ).n;
  audit(req, active ? 'staff.activate' : 'staff.deactivate', 'staff', id);
  res.json({ staff: loadStaff(id), upcomingAppointments: upcoming });
});

router.post('/:id/reset-password', requireRole('admin'), async (req, res) => {
  const id = Number(req.params.id);
  const { password } = parse(z.object({ password: zPassword }), req.body);
  const s = loadStaff(id);
  if (!s) throw notFound('Funcionário não encontrado.');
  run('UPDATE users SET password_hash = ?, failed_logins = 0, locked_until = NULL, updated_at = ? WHERE id = ?', [
    await hashPassword(password),
    nowIso(),
    s.user_id,
  ]);
  destroyUserSessions(s.user_id);
  audit(req, 'staff.reset_password', 'staff', id);
  res.json({ ok: true });
});

router.post('/:id/photo', (req, res, next) => {
  const id = Number(req.params.id);
  if (req.user.role !== 'admin' && id !== req.user.staffId) return next(forbidden());
  upload.single('photo')(req, res, (err) => {
    if (err) return next(err);
    if (!req.file) return next(badRequest('Envie uma imagem.'));
    const s = one('SELECT photo_path FROM staff WHERE id = ?', [id]);
    if (!s) {
      removePhotoFile(req.file.filename);
      return next(notFound('Funcionário não encontrado.'));
    }
    removePhotoFile(s.photo_path);
    const photoPath = `/uploads/staff/${req.file.filename}`;
    run('UPDATE staff SET photo_path = ?, updated_at = ? WHERE id = ?', [photoPath, nowIso(), id]);
    audit(req, 'staff.photo', 'staff', id);
    res.json({ photo_path: photoPath });
  });
});

router.delete('/:id/photo', (req, res) => {
  const id = Number(req.params.id);
  if (req.user.role !== 'admin' && id !== req.user.staffId) throw forbidden();
  const s = one('SELECT photo_path FROM staff WHERE id = ?', [id]);
  if (!s) throw notFound('Funcionário não encontrado.');
  removePhotoFile(s.photo_path);
  run('UPDATE staff SET photo_path = NULL, updated_at = ? WHERE id = ?', [nowIso(), id]);
  res.json({ ok: true });
});

router.delete('/:id', requireRole('admin'), (req, res) => {
  const id = Number(req.params.id);
  const s = loadStaff(id);
  if (!s) throw notFound('Funcionário não encontrado.');
  if (s.user_id === req.user.id) throw badRequest('Você não pode excluir a si mesmo.');
  if (one('SELECT 1 AS x FROM appointments WHERE staff_id = ? LIMIT 1', [id])) {
    throw conflict('Funcionário possui agendamentos/histórico. Desative-o em vez de excluir.', 'IN_USE');
  }
  tx(() => {
    run('DELETE FROM staff WHERE id = ?', [id]);
    run('DELETE FROM sessions WHERE user_id = ?', [s.user_id]);
    run('DELETE FROM notifications WHERE user_id = ?', [s.user_id]);
    run('UPDATE schedule_blocks SET created_by = NULL WHERE created_by = ?', [s.user_id]);
    run('DELETE FROM users WHERE id = ?', [s.user_id]);
  });
  removePhotoFile(s.photo_path);
  audit(req, 'staff.delete', 'staff', id, { name: s.name });
  res.json({ ok: true });
});

export default router;
