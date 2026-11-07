// Indicadores do dashboard. Administrador vê tudo; barbeiro vê somente os próprios números.
import { Router } from 'express';
import { z } from 'zod';
import { all, one } from '../db/index.js';
import { requireRole } from '../middleware/auth.js';
import { APPOINTMENT_SELECT, serializeAppointment } from '../services/appointments.js';
import { badRequest } from '../utils/errors.js';
import { addDays, diffDays, endOfMonth, startOfMonth, startOfWeek, todayStr } from '../utils/time.js';
import { parse, zDate, zId } from '../utils/validation.js';

const router = Router();
router.use(requireRole('admin', 'barber'));

router.get('/', (req, res) => {
  const today = todayStr();
  const q = parse(z.object({ from: zDate.optional(), to: zDate.optional(), staffId: zId.optional() }), req.query);
  const from = q.from ?? startOfMonth(today);
  const to = q.to ?? endOfMonth(today);
  if (from > to) throw badRequest('Período inválido.');
  if (diffDays(from, to) > 3 * 366) throw badRequest('Período máximo: 3 anos.');

  const staffId = req.user.role === 'barber' ? req.user.staffId ?? -1 : q.staffId ?? null;
  const sf = (alias) => (staffId ? ` AND ${alias}.staff_id = ${Number(staffId)}` : '');

  const revenue = (a, b) =>
    one(`SELECT COALESCE(SUM(amount_cents),0) AS v FROM financial_records f WHERE f.paid = 1 AND f.date BETWEEN ? AND ?${sf('f')}`, [a, b]).v;

  // Cards fixos (independentes do filtro)
  const fixed = {
    revenueToday: revenue(today, today),
    revenueWeek: revenue(startOfWeek(today), addDays(startOfWeek(today), 6)),
    revenueMonth: revenue(startOfMonth(today), endOfMonth(today)),
    appointmentsToday: one(
      `SELECT COUNT(*) AS n FROM appointments a WHERE a.date = ? AND a.status NOT IN ('cancelled','no_show')${sf('a')}`,
      [today],
    ).n,
  };

  // Indicadores do período
  const fin = one(
    `SELECT COALESCE(SUM(CASE WHEN paid = 1 THEN amount_cents END),0) AS received,
            COALESCE(SUM(CASE WHEN paid = 0 THEN amount_cents END),0) AS receivable,
            COALESCE(SUM(paid),0) AS paid_count
       FROM financial_records f WHERE f.date BETWEEN ? AND ?${sf('f')}`,
    [from, to],
  );
  const statusCounts = Object.fromEntries(
    all(`SELECT status, COUNT(*) AS n FROM appointments a WHERE a.date BETWEEN ? AND ?${sf('a')} GROUP BY status`, [from, to]).map((r) => [
      r.status,
      r.n,
    ]),
  );
  const totalAppointments = Object.values(statusCounts).reduce((s, n) => s + n, 0);
  const clientsTotal = staffId
    ? one('SELECT COUNT(DISTINCT client_id) AS n FROM appointments WHERE staff_id = ?', [staffId]).n
    : one('SELECT COUNT(*) AS n FROM clients WHERE anonymized_at IS NULL').n;
  const newClients = staffId
    ? null
    : one('SELECT COUNT(*) AS n FROM clients WHERE substr(created_at,1,10) BETWEEN ? AND ? AND anonymized_at IS NULL', [from, to]).n;

  const topServicesByCount = all(
    `SELECT h.service_id, h.service_name AS name, COUNT(*) AS count, SUM(h.price_cents) AS total_cents
       FROM service_history h WHERE h.date BETWEEN ? AND ?${sf('h')}
      GROUP BY h.service_id ORDER BY count DESC, total_cents DESC LIMIT 8`,
    [from, to],
  );
  const topServicesByRevenue = all(
    `SELECT f.service_id, f.service_name AS name, COUNT(*) AS count, SUM(f.amount_cents) AS total_cents
       FROM financial_records f WHERE f.paid = 1 AND f.date BETWEEN ? AND ?${sf('f')}
      GROUP BY f.service_id ORDER BY total_cents DESC LIMIT 8`,
    [from, to],
  );
  const staffRanking = all(
    `SELECT st.id AS staff_id, u.name, st.color,
            (SELECT COUNT(*) FROM service_history h WHERE h.staff_id = st.id AND h.date BETWEEN :from AND :to) AS services,
            (SELECT COALESCE(SUM(amount_cents),0) FROM financial_records f WHERE f.staff_id = st.id AND f.paid = 1 AND f.date BETWEEN :from AND :to) AS revenue_cents,
            (SELECT COUNT(*) FROM appointments a WHERE a.staff_id = st.id AND a.date BETWEEN :from AND :to AND a.status = 'no_show') AS no_shows
       FROM staff st JOIN users u ON u.id = st.user_id
      WHERE ${staffId ? 'st.id = :staffId' : '1=1'}
      ORDER BY services DESC, revenue_cents DESC`,
    staffId ? { from, to, staffId } : { from, to },
  ).filter((s) => s.services > 0 || s.revenue_cents > 0 || staffId);

  // Séries temporais (por dia até ~2 meses, senão por mês)
  const byMonth = diffDays(from, to) > 62;
  const bucket = (col) => (byMonth ? `substr(${col},1,7)` : col);
  const revRows = all(
    `SELECT ${bucket('f.date')} AS k, SUM(amount_cents) AS v FROM financial_records f
      WHERE f.paid = 1 AND f.date BETWEEN ? AND ?${sf('f')} GROUP BY k`,
    [from, to],
  );
  const svcRows = all(
    `SELECT ${bucket('h.date')} AS k, COUNT(*) AS v FROM service_history h WHERE h.date BETWEEN ? AND ?${sf('h')} GROUP BY k`,
    [from, to],
  );
  const keys = [];
  if (byMonth) {
    for (let d = startOfMonth(from); d <= to; d = addDays(endOfMonth(d), 1)) keys.push(d.slice(0, 7));
  } else {
    for (let d = from; d <= to; d = addDays(d, 1)) keys.push(d);
  }
  const revMap = new Map(revRows.map((r) => [r.k, r.v]));
  const svcMap = new Map(svcRows.map((r) => [r.k, r.v]));
  const series = keys.map((k) => ({ key: k, revenue_cents: revMap.get(k) ?? 0, services: svcMap.get(k) ?? 0 }));

  const upcomingToday = all(
    `${APPOINTMENT_SELECT} WHERE a.date = ? AND a.status IN ('pending','confirmed','in_service')${sf('a')} ORDER BY a.start_min LIMIT 12`,
    [today],
  ).map(serializeAppointment);

  res.json({
    from,
    to,
    granularity: byMonth ? 'month' : 'day',
    fixed,
    period: {
      revenue_cents: fin.received,
      receivable_cents: fin.receivable,
      paid_count: fin.paid_count,
      ticket_avg_cents: fin.paid_count ? Math.round(fin.received / fin.paid_count) : 0,
      appointments: totalAppointments,
      completed: statusCounts.completed ?? 0,
      pending: statusCounts.pending ?? 0,
      confirmed: statusCounts.confirmed ?? 0,
      cancelled: statusCounts.cancelled ?? 0,
      no_show: statusCounts.no_show ?? 0,
      clients_total: clientsTotal,
      new_clients: newClients,
    },
    topServicesByCount,
    topServicesByRevenue,
    staffRanking,
    series,
    upcomingToday,
  });
});

export default router;
