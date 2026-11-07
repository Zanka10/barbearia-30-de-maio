// Área do cliente autenticado: agendamentos, histórico, cancelamento e direitos LGPD.
import { Router } from 'express';
import { z } from 'zod';
import { all, getSetting, one } from '../db/index.js';
import { requireRole } from '../middleware/auth.js';
import { APPOINTMENT_SELECT, changeStatus, serializeAppointment } from '../services/appointments.js';
import { anonymizeClient, clientStats, exportClientData } from '../services/clients.js';
import { audit } from '../services/audit.js';
import { badRequest, notFound, unauthorized } from '../utils/errors.js';
import { verifyPassword } from '../utils/password.js';
import { nowMinutes, todayStr, diffDays } from '../utils/time.js';
import { parse, zText } from '../utils/validation.js';

const router = Router();
router.use(requireRole('client'));

router.use((req, _res, next) => {
  if (!req.user.clientId) return next(notFound('Cadastro de cliente não encontrado.'));
  next();
});

router.get('/summary', (req, res) => {
  const client = one('SELECT id, name, phone, email, created_at, consent_at FROM clients WHERE id = ?', [req.user.clientId]);
  res.json({ client, stats: clientStats(req.user.clientId), cancelMinHours: Number(getSetting('client_cancel_min_hours', 2)) });
});

const staffPhotos = () => new Map(all('SELECT id, photo_path FROM staff').map((s) => [s.id, s.photo_path]));

router.get('/appointments', (req, res) => {
  const photos = staffPhotos();
  const items = all(`${APPOINTMENT_SELECT} WHERE a.client_id = ? ORDER BY a.date DESC, a.start_min DESC LIMIT 200`, [req.user.clientId]).map(
    (a) => {
      const s = serializeAppointment(a);
      // O cliente não precisa ver dados internos
      delete s.created_by;
      delete s.staff_color;
      s.staff_photo = photos.get(a.staff_id) ?? null;
      return s;
    },
  );
  res.json({ items });
});

router.get('/history', (req, res) => {
  const items = all(
    `SELECT h.id, h.service_name, h.category_name, h.staff_id, h.staff_name, st.photo_path AS staff_photo,
            h.price_cents, h.date, h.start_min, s.duration_min, f.payment_method, f.paid
       FROM service_history h
       LEFT JOIN financial_records f ON f.appointment_id = h.appointment_id
       LEFT JOIN staff st ON st.id = h.staff_id
       LEFT JOIN services s ON s.id = h.service_id
      WHERE h.client_id = ? ORDER BY h.date DESC, h.start_min DESC`,
    [req.user.clientId],
  );
  res.json({ items });
});

router.post('/appointments/:id/cancel', (req, res) => {
  const id = Number(req.params.id);
  const { reason } = parse(z.object({ reason: zText(200) }), req.body ?? {});
  const appt = one('SELECT * FROM appointments WHERE id = ? AND client_id = ?', [id, req.user.clientId]);
  if (!appt) throw notFound('Agendamento não encontrado.');
  if (!['pending', 'confirmed'].includes(appt.status)) throw badRequest('Este agendamento não pode mais ser cancelado.');
  const minHours = Number(getSetting('client_cancel_min_hours', 2));
  const minutesUntil = diffDays(todayStr(), appt.date) * 1440 + appt.start_min - nowMinutes();
  if (minutesUntil < minHours * 60) {
    throw badRequest(`Cancelamentos online precisam de ${minHours}h de antecedência. Entre em contato com a barbearia.`);
  }
  const updated = changeStatus(id, { status: 'cancelled', reason: reason || 'Cancelado pelo cliente' }, req.user);
  audit(req, 'appointment.cancelled_by_client', 'appointment', id);
  res.json({ appointment: updated });
});

router.get('/export', (req, res) => {
  audit(req, 'lgpd.export', 'client', req.user.clientId);
  res.setHeader('Content-Disposition', 'attachment; filename="meus-dados.json"');
  res.json(exportClientData(req.user.clientId));
});

router.post('/delete-account', async (req, res) => {
  const { password } = parse(z.object({ password: z.string().min(1, 'Confirme sua senha.') }), req.body);
  const user = one('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
  if (!(await verifyPassword(password, user.password_hash))) throw unauthorized('Senha incorreta.');
  audit(req, 'lgpd.delete_account', 'client', req.user.clientId);
  await anonymizeClient(req.user.clientId, req.user);
  res.clearCookie('bb_sid', { path: '/' });
  res.json({ ok: true });
});

export default router;
