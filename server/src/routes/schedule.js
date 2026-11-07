// Horário de funcionamento, feriados e bloqueios de agenda.
import { Router } from 'express';
import { z } from 'zod';
import { all, one, run, tx } from '../db/index.js';
import { requireRole } from '../middleware/auth.js';
import { audit } from '../services/audit.js';
import { OCCUPYING } from '../services/availability.js';
import { badRequest, forbidden, notFound } from '../utils/errors.js';
import { addDays, diffDays, formatDateBR, minToHHMM, todayStr } from '../utils/time.js';
import { parse, zDate, zId, zText, zTime } from '../utils/validation.js';

const router = Router();
router.use(requireRole('admin', 'barber'));
const adminOnly = requireRole('admin');

// ---------------- Horário de funcionamento ----------------
router.get('/hours', (_req, res) => {
  res.json({ items: all('SELECT * FROM business_hours ORDER BY weekday') });
});

const dayHoursSchema = z
  .object({
    weekday: z.number().int().min(0).max(6),
    is_open: z.boolean(),
    open: zTime,
    close: zTime,
    break_start: zTime.nullable().optional(),
    break_end: zTime.nullable().optional(),
  })
  .superRefine((d, ctx) => {
    if (d.close <= d.open) ctx.addIssue({ code: 'custom', message: 'O fechamento deve ser após a abertura.', path: ['close'] });
    const hasBreak = d.break_start != null || d.break_end != null;
    if (hasBreak) {
      if (d.break_start == null || d.break_end == null) {
        ctx.addIssue({ code: 'custom', message: 'Informe início e fim do intervalo.', path: ['break_start'] });
      } else if (d.break_end <= d.break_start || d.break_start < d.open || d.break_end > d.close) {
        ctx.addIssue({ code: 'custom', message: 'Intervalo deve estar dentro do expediente.', path: ['break_start'] });
      }
    }
  });

router.put('/hours', adminOnly, (req, res) => {
  const { days } = parse(z.object({ days: z.array(dayHoursSchema).length(7, 'Envie os 7 dias da semana.') }), req.body);
  tx(() => {
    for (const d of days) {
      run(
        `INSERT INTO business_hours (weekday, is_open, open_min, close_min, break_start_min, break_end_min) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(weekday) DO UPDATE SET is_open = excluded.is_open, open_min = excluded.open_min, close_min = excluded.close_min,
           break_start_min = excluded.break_start_min, break_end_min = excluded.break_end_min`,
        [d.weekday, d.is_open ? 1 : 0, d.open, d.close, d.break_start ?? null, d.break_end ?? null],
      );
    }
  });
  audit(req, 'schedule.hours_update', 'business_hours', null);
  res.json({ items: all('SELECT * FROM business_hours ORDER BY weekday') });
});

// ---------------- Feriados ----------------
router.get('/holidays', (req, res) => {
  const from = req.query.all === '1' ? '0000-00-00' : addDays(todayStr(), -30);
  res.json({ items: all('SELECT * FROM holidays WHERE date >= ? ORDER BY date', [from]) });
});

router.post('/holidays', adminOnly, (req, res) => {
  const d = parse(z.object({ date: zDate, name: z.string().trim().min(2, 'Informe o nome.').max(100) }), req.body);
  const { id } = run('INSERT INTO holidays (date, name) VALUES (?, ?)', [d.date, d.name]);
  const affected = one(`SELECT COUNT(*) AS n FROM appointments WHERE date = ? AND status IN ('pending','confirmed')`, [d.date]).n;
  audit(req, 'schedule.holiday_create', 'holiday', id, d);
  res.status(201).json({ holiday: one('SELECT * FROM holidays WHERE id = ?', [id]), affectedAppointments: affected });
});

router.delete('/holidays/:id', adminOnly, (req, res) => {
  const r = run('DELETE FROM holidays WHERE id = ?', [Number(req.params.id)]);
  if (!r.changes) throw notFound('Feriado não encontrado.');
  audit(req, 'schedule.holiday_delete', 'holiday', Number(req.params.id));
  res.json({ ok: true });
});

// ---------------- Bloqueios ----------------
router.get('/blocks', (req, res) => {
  const q = parse(z.object({ from: zDate.optional(), to: zDate.optional(), staffId: zId.optional() }), req.query);
  const from = q.from ?? todayStr();
  const to = q.to ?? addDays(from, 90);
  const scope = req.user.role === 'barber' ? req.user.staffId : q.staffId;
  const items = all(
    `SELECT b.*, u.name AS staff_name, cu.name AS created_by_name FROM schedule_blocks b
       LEFT JOIN staff st ON st.id = b.staff_id LEFT JOIN users u ON u.id = st.user_id
       LEFT JOIN users cu ON cu.id = b.created_by
      WHERE b.date BETWEEN ? AND ? ${scope ? 'AND (b.staff_id IS NULL OR b.staff_id = ?)' : ''}
      ORDER BY b.date, b.start_min`,
    scope ? [from, to, scope] : [from, to],
  ).map((b) => ({ ...b, start_time: minToHHMM(b.start_min), end_time: minToHHMM(b.end_min), all_day: b.start_min === 0 && b.end_min === 1440 }));
  res.json({ items });
});

router.post('/blocks', (req, res) => {
  const d = parse(
    z.object({
      staffId: zId.nullable().optional(),
      dateFrom: zDate,
      dateTo: zDate.optional(),
      allDay: z.boolean().default(false),
      start: zTime.optional(),
      end: zTime.optional(),
      reason: zText(200),
      force: z.boolean().default(false),
    }),
    req.body,
  );
  let staffId = d.staffId ?? null;
  if (req.user.role === 'barber') {
    if (staffId && staffId !== req.user.staffId) throw forbidden('Você só pode bloquear a sua própria agenda.');
    staffId = req.user.staffId;
  }
  if (staffId && !one('SELECT 1 AS x FROM staff WHERE id = ?', [staffId])) throw notFound('Funcionário não encontrado.');
  const dateTo = d.dateTo ?? d.dateFrom;
  if (dateTo < d.dateFrom) throw badRequest('A data final deve ser igual ou posterior à inicial.');
  if (diffDays(d.dateFrom, dateTo) > 92) throw badRequest('Período máximo de bloqueio: 92 dias.');
  const start = d.allDay ? 0 : d.start;
  const end = d.allDay ? 1440 : d.end;
  if (start == null || end == null || end <= start) throw badRequest('Informe um intervalo de horário válido.');

  const dates = [];
  for (let dt = d.dateFrom; dt <= dateTo; dt = addDays(dt, 1)) dates.push(dt);

  // Avisa sobre agendamentos ativos no período bloqueado
  const conflicts = all(
    `SELECT a.id, a.date, a.start_min, c.name AS client_name, u.name AS staff_name FROM appointments a
       JOIN clients c ON c.id = a.client_id JOIN staff st ON st.id = a.staff_id JOIN users u ON u.id = st.user_id
      WHERE a.date BETWEEN ? AND ? AND a.status IN ${OCCUPYING} AND a.status <> 'completed'
        AND a.start_min < ? AND ? < a.end_min ${staffId ? 'AND a.staff_id = ?' : ''}
      ORDER BY a.date, a.start_min`,
    staffId ? [d.dateFrom, dateTo, end, start, staffId] : [d.dateFrom, dateTo, end, start],
  );
  if (conflicts.length && !d.force) {
    return res.status(409).json({
      error: {
        code: 'BLOCK_HAS_APPOINTMENTS',
        message: `Existem ${conflicts.length} agendamento(s) no período. Eles NÃO serão cancelados automaticamente.`,
        details: {
          conflicts: conflicts.map((c) => `${formatDateBR(c.date)} ${minToHHMM(c.start_min)} — ${c.client_name} (${c.staff_name})`),
        },
      },
    });
  }
  const ids = tx(() =>
    dates.map(
      (dt) =>
        run('INSERT INTO schedule_blocks (staff_id, date, start_min, end_min, reason, created_by) VALUES (?, ?, ?, ?, ?, ?)', [
          staffId,
          dt,
          start,
          end,
          d.reason,
          req.user.id,
        ]).id,
    ),
  );
  audit(req, 'schedule.block_create', 'schedule_block', ids[0], { staffId, from: d.dateFrom, to: dateTo, start, end });
  res.status(201).json({ created: ids.length, conflicts: conflicts.length });
});

router.delete('/blocks/:id', (req, res) => {
  const id = Number(req.params.id);
  const b = one('SELECT * FROM schedule_blocks WHERE id = ?', [id]);
  if (!b) throw notFound('Bloqueio não encontrado.');
  if (req.user.role === 'barber' && b.staff_id !== req.user.staffId) throw forbidden('Você só pode remover bloqueios da sua agenda.');
  run('DELETE FROM schedule_blocks WHERE id = ?', [id]);
  audit(req, 'schedule.block_delete', 'schedule_block', id);
  res.json({ ok: true });
});

export default router;
