// Rotas públicas: vitrine da barbearia e agendamento online (sem login).
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { all, getSettings, one } from '../db/index.js';
import { availableDates, computeSlots } from '../services/availability.js';
import { createAppointment, findOrCreateClient } from '../services/appointments.js';
import { audit } from '../services/audit.js';
import { badRequest } from '../utils/errors.js';
import { parse, zDate, zId, zName, zOptionalEmail, zPhone, zText, zTime } from '../utils/validation.js';
import { todayStr } from '../utils/time.js';

const router = Router();

const PUBLIC_SETTINGS = [
  'shop_name',
  'shop_tagline',
  'shop_phone',
  'shop_whatsapp',
  'shop_email',
  'shop_address',
  'shop_instagram',
  'booking_window_days',
  'min_advance_min',
  'client_cancel_min_hours',
  'privacy_contact',
];

router.get('/info', (_req, res) => {
  const s = getSettings();
  res.json({
    settings: Object.fromEntries(PUBLIC_SETTINGS.map((k) => [k, s[k] ?? ''])),
    hours: all('SELECT * FROM business_hours ORDER BY weekday'),
    holidays: all('SELECT date, name FROM holidays WHERE date >= ? ORDER BY date LIMIT 20', [todayStr()]),
  });
});

/** Categorias e serviços ativos que possuem ao menos um barbeiro ativo apto a realizá-los. */
router.get('/catalog', (_req, res) => {
  const categories = all('SELECT id, name, description FROM categories WHERE active = 1 ORDER BY sort_order, name');
  const services = all(
    `SELECT s.id, s.category_id, s.name, s.description, s.price_cents, s.duration_min,
            (SELECT GROUP_CONCAT(ss.staff_id) FROM staff_services ss
               JOIN staff st ON st.id = ss.staff_id JOIN users u ON u.id = st.user_id
              WHERE ss.service_id = s.id AND st.active = 1 AND u.active = 1) AS staff_ids
       FROM services s JOIN categories c ON c.id = s.category_id
      WHERE s.active = 1 AND c.active = 1
      ORDER BY s.sort_order, s.name`,
  )
    .filter((s) => s.staff_ids)
    .map((s) => ({ ...s, staff_ids: s.staff_ids.split(',').map(Number) }));
  res.json({
    categories: categories
      .map((c) => ({ ...c, services: services.filter((s) => s.category_id === c.id) }))
      .filter((c) => c.services.length),
  });
});

router.get('/staff', (_req, res) => {
  const staff = all(
    `SELECT st.id, u.name, st.photo_path, st.specialties, st.bio,
            (SELECT GROUP_CONCAT(service_id) FROM staff_services WHERE staff_id = st.id) AS service_ids
       FROM staff st JOIN users u ON u.id = st.user_id
      WHERE st.active = 1 AND u.active = 1 ORDER BY u.name`,
  ).map((s) => ({ ...s, service_ids: s.service_ids ? s.service_ids.split(',').map(Number) : [] }));
  res.json({ staff });
});

router.get('/availability', (req, res) => {
  const q = parse(z.object({ serviceId: zId, staffId: zId.optional(), date: zDate }), req.query);
  const r = computeSlots({ serviceId: q.serviceId, staffId: q.staffId ?? null, date: q.date, context: 'public' });
  res.json({ date: r.date, closed: r.closed, slots: r.slots.map(({ time, start }) => ({ time, start })) });
});

router.get('/available-dates', (req, res) => {
  const q = parse(
    z.object({ serviceId: zId, staffId: zId.optional(), month: z.string().regex(/^\d{4}-\d{2}$/, 'Mês inválido.') }),
    req.query,
  );
  res.json({ dates: availableDates({ serviceId: q.serviceId, staffId: q.staffId ?? null, month: q.month }) });
});

const bookingLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 15,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { message: 'Muitas solicitações de agendamento. Tente novamente mais tarde.', code: 'RATE_LIMIT' } },
});

router.post('/appointments', bookingLimiter, (req, res) => {
  const data = parse(
    z.object({
      serviceId: zId,
      staffId: zId.nullable().optional(),
      date: zDate,
      time: zTime,
      name: zName,
      phone: zPhone,
      email: zOptionalEmail,
      notes: zText(300),
      consent: z.literal(true, { error: 'É necessário aceitar a Política de Privacidade para agendar.' }),
      website: z.string().optional(), // honeypot anti-spam (deve vir vazio)
    }),
    req.body,
  );
  if (data.website) throw badRequest('Requisição inválida.');

  let clientId;
  if (req.user?.role === 'client' && req.user.clientId) {
    clientId = req.user.clientId;
  } else {
    // Identificação pelo celular: reaproveita o cadastro existente (sem duplicar e sem expor dados).
    const { client } = findOrCreateClient({ name: data.name, phone: data.phone, email: data.email, consent: true });
    clientId = client.id;
  }

  const appt = createAppointment({
    clientId,
    staffId: data.staffId ?? null,
    serviceId: data.serviceId,
    date: data.date,
    startMin: data.time,
    notes: data.notes,
    source: 'online',
    actor: req.user ?? null,
    context: 'public',
  });
  audit(req, 'appointment.created_online', 'appointment', appt.id);
  const svc = one('SELECT duration_min FROM services WHERE id = ?', [appt.service_id]);
  res.status(201).json({
    appointment: {
      id: appt.id,
      date: appt.date,
      start_time: appt.start_time,
      end_time: appt.end_time,
      service_name: appt.service_name,
      staff_name: appt.staff_name,
      price_cents: appt.price_cents,
      duration_min: svc.duration_min,
      status: appt.status,
      status_label: appt.status_label,
    },
  });
});

export default router;
