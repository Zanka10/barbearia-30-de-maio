import { Router } from 'express';
import { z } from 'zod';
import { all, one } from '../db/index.js';
import { requireRole } from '../middleware/auth.js';
import {
  APPOINTMENT_SELECT,
  assertCanAccess,
  changeStatus,
  createAppointment,
  findOrCreateClient,
  getAppointment,
  serializeAppointment,
  updateAppointment,
} from '../services/appointments.js';
import { computeSlots } from '../services/availability.js';
import { audit } from '../services/audit.js';
import { badRequest, notFound } from '../utils/errors.js';
import { minToHHMM } from '../utils/time.js';
import {
  normalizePhone,
  parse,
  PAYMENT_METHODS,
  STATUSES,
  zCents,
  zDate,
  zId,
  zName,
  zOptionalEmail,
  zPhone,
  zText,
  zTime,
} from '../utils/validation.js';

const router = Router();
router.use(requireRole('admin', 'barber'));

/** Monta WHERE de listagem respeitando o perfil (barbeiro vê somente a própria agenda). */
function buildFilters(user, q) {
  const where = [];
  const params = {};
  if (q.from) {
    where.push('a.date >= :from');
    params.from = q.from;
  }
  if (q.to) {
    where.push('a.date <= :to');
    params.to = q.to;
  }
  if (user.role === 'barber') {
    where.push('a.staff_id = :staffId');
    params.staffId = user.staffId ?? -1;
  } else if (q.staffId) {
    where.push('a.staff_id = :staffId');
    params.staffId = q.staffId;
  }
  if (q.status?.length) {
    where.push(`a.status IN (${q.status.map((_, i) => `:st${i}`).join(',')})`);
    q.status.forEach((s, i) => (params[`st${i}`] = s));
  }
  if (q.serviceId) {
    where.push('a.service_id = :serviceId');
    params.serviceId = q.serviceId;
  }
  if (q.clientId) {
    where.push('a.client_id = :clientId');
    params.clientId = q.clientId;
  }
  if (q.search) {
    const digits = normalizePhone(q.search);
    where.push(`(c.name LIKE :term OR s.name LIKE :term ${digits.length >= 3 ? 'OR c.phone LIKE :digits' : ''})`);
    params.term = `%${q.search}%`;
    if (digits.length >= 3) params.digits = `%${digits}%`;
  }
  return { whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

const zStatusList = z
  .string()
  .optional()
  .transform((v) => (v ? v.split(',').filter(Boolean) : []))
  .refine((arr) => arr.every((s) => STATUSES.includes(s)), 'Status inválido.');

router.get('/', (req, res) => {
  const q = parse(
    z.object({
      from: zDate.optional(),
      to: zDate.optional(),
      staffId: zId.optional(),
      serviceId: zId.optional(),
      clientId: zId.optional(),
      status: zStatusList,
      search: z.string().trim().max(80).optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(5).max(200).default(25),
      order: z.enum(['asc', 'desc']).default('desc'),
    }),
    req.query,
  );
  const { whereSql, params } = buildFilters(req.user, q);
  const base = `FROM appointments a JOIN clients c ON c.id = a.client_id JOIN services s ON s.id = a.service_id ${whereSql}`;
  const summary = one(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(CASE WHEN a.status = 'completed' THEN COALESCE(f.amount_cents, a.price_cents) END), 0) AS completed_value_cents,
            COALESCE(SUM(CASE WHEN f.paid = 1 THEN f.amount_cents END), 0) AS paid_value_cents
       FROM appointments a JOIN clients c ON c.id = a.client_id JOIN services s ON s.id = a.service_id
       LEFT JOIN financial_records f ON f.appointment_id = a.id ${whereSql}`,
    params,
  );
  const dir = q.order === 'asc' ? 'ASC' : 'DESC';
  const ids = all(`SELECT a.id ${base} ORDER BY a.date ${dir}, a.start_min ${dir} LIMIT :limit OFFSET :offset`, {
    ...params,
    limit: q.pageSize,
    offset: (q.page - 1) * q.pageSize,
  }).map((r) => r.id);
  const items = ids.length
    ? all(`${APPOINTMENT_SELECT} WHERE a.id IN (${ids.map(() => '?').join(',')}) ORDER BY a.date ${dir}, a.start_min ${dir}`, ids).map(
        serializeAppointment,
      )
    : [];
  res.json({ items, total: summary.total, summary, page: q.page, pageSize: q.pageSize });
});

/** Eventos para o calendário (agendamentos + bloqueios + feriados). */
router.get('/calendar', (req, res) => {
  const q = parse(
    z.object({ from: zDate, to: zDate, staffId: zId.optional(), includeCancelled: z.enum(['0', '1']).default('0') }),
    req.query,
  );
  if (q.from > q.to) throw badRequest('Período inválido.');
  const { whereSql, params } = buildFilters(req.user, { from: q.from, to: q.to, staffId: q.staffId });
  const statusFilter = q.includeCancelled === '1' ? '' : `${whereSql ? 'AND' : 'WHERE'} a.status NOT IN ('cancelled','no_show')`;
  const appointments = all(`${APPOINTMENT_SELECT} ${whereSql} ${statusFilter} ORDER BY a.date, a.start_min`, params).map(serializeAppointment);

  const staffScope = req.user.role === 'barber' ? req.user.staffId : q.staffId;
  const blocks = all(
    `SELECT b.*, u.name AS staff_name FROM schedule_blocks b
       LEFT JOIN staff st ON st.id = b.staff_id LEFT JOIN users u ON u.id = st.user_id
      WHERE b.date BETWEEN ? AND ? ${staffScope ? 'AND (b.staff_id IS NULL OR b.staff_id = ?)' : ''}
      ORDER BY b.date, b.start_min`,
    staffScope ? [q.from, q.to, staffScope] : [q.from, q.to],
  ).map((b) => ({ ...b, start_time: minToHHMM(b.start_min), end_time: minToHHMM(b.end_min) }));
  const holidays = all('SELECT * FROM holidays WHERE date BETWEEN ? AND ?', [q.from, q.to]);
  res.json({ appointments, blocks, holidays, hours: all('SELECT * FROM business_hours ORDER BY weekday') });
});

/** Horários livres (contexto do painel: sem janela máxima, sem antecedência mínima). */
router.get('/availability', (req, res) => {
  const q = parse(z.object({ serviceId: zId, staffId: zId.optional(), date: zDate, excludeId: zId.optional() }), req.query);
  const staffId = req.user.role === 'barber' ? req.user.staffId : q.staffId;
  const r = computeSlots({ serviceId: q.serviceId, staffId: staffId ?? null, date: q.date, excludeApptId: q.excludeId ?? null, context: 'panel' });
  res.json(r);
});

router.get('/:id', (req, res) => {
  const appt = getAppointment(Number(req.params.id));
  assertCanAccess(req.user, appt);
  res.json({ appointment: appt });
});

router.post('/', (req, res) => {
  const data = parse(
    z.object({
      clientId: zId.optional(),
      client: z.object({ name: zName, phone: zPhone, email: zOptionalEmail }).optional(),
      staffId: zId.optional().nullable(),
      serviceId: zId,
      date: zDate,
      time: zTime,
      notes: zText(500),
    }),
    req.body,
  );
  let clientId = data.clientId;
  if (!clientId) {
    if (!data.client) throw badRequest('Selecione ou cadastre o cliente.');
    clientId = findOrCreateClient(data.client).client.id;
  } else if (!one('SELECT 1 AS x FROM clients WHERE id = ? AND anonymized_at IS NULL', [clientId])) {
    throw notFound('Cliente não encontrado.');
  }
  const staffId = req.user.role === 'barber' ? req.user.staffId : data.staffId ?? null;
  const appt = createAppointment({
    clientId,
    staffId,
    serviceId: data.serviceId,
    date: data.date,
    startMin: data.time,
    notes: data.notes,
    source: 'panel',
    actor: req.user,
    context: 'panel',
  });
  audit(req, 'appointment.create', 'appointment', appt.id);
  res.status(201).json({ appointment: appt });
});

router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const data = parse(
    z.object({
      staffId: zId.optional(),
      serviceId: zId.optional(),
      date: zDate.optional(),
      time: zTime.optional(),
      notes: zText(500),
    }),
    req.body,
  );
  const appt = updateAppointment(
    id,
    { staffId: data.staffId, serviceId: data.serviceId, date: data.date, startMin: data.time, notes: 'notes' in req.body ? data.notes : undefined },
    req.user,
  );
  audit(req, 'appointment.update', 'appointment', id, { date: data.date, time: req.body.time, staffId: data.staffId });
  res.json({ appointment: appt });
});

router.post('/:id/status', (req, res) => {
  const id = Number(req.params.id);
  const data = parse(
    z.object({
      status: z.enum(STATUSES),
      paymentMethod: z.enum(PAYMENT_METHODS).nullable().optional(),
      paid: z.boolean().default(false),
      amountCents: zCents.nullable().optional(),
      reason: zText(300),
    }),
    req.body,
  );
  const appt = changeStatus(id, data, req.user);
  audit(req, `appointment.status.${data.status}`, 'appointment', id);
  res.json({ appointment: appt });
});

export default router;
