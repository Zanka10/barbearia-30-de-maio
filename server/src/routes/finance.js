// Gestão financeira: somente atendimentos concluídos geram registros; faturamento = registros pagos.
import { Router } from 'express';
import { z } from 'zod';
import { all, one, run, tx } from '../db/index.js';
import { requireRole } from '../middleware/auth.js';
import { audit } from '../services/audit.js';
import { badRequest, notFound } from '../utils/errors.js';
import { minToHHMM, nowIso, startOfMonth, todayStr } from '../utils/time.js';
import { formatPhone } from '../services/notifications.js';
import { parse, PAYMENT_METHODS, zCents, zDate, zId, zText, normalizePhone } from '../utils/validation.js';

const router = Router();
router.use(requireRole('admin'));

export const METHOD_LABELS = { cash: 'Dinheiro', pix: 'PIX', debit: 'Cartão de débito', credit: 'Cartão de crédito' };

const filterSchema = z.object({
  from: zDate.optional(),
  to: zDate.optional(),
  staffId: zId.optional(),
  method: z.enum(PAYMENT_METHODS).optional(),
  paid: z.enum(['0', '1']).optional(),
  search: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(500).default(25),
});

function buildWhere(q) {
  const from = q.from ?? startOfMonth(todayStr());
  const to = q.to ?? todayStr();
  const where = ['f.date BETWEEN :from AND :to'];
  const params = { from, to };
  if (q.staffId) {
    where.push('f.staff_id = :staffId');
    params.staffId = q.staffId;
  }
  if (q.method) {
    where.push('f.payment_method = :method');
    params.method = q.method;
  }
  if (q.paid) {
    where.push('f.paid = :paid');
    params.paid = Number(q.paid);
  }
  if (q.search) {
    const digits = normalizePhone(q.search);
    where.push(`(c.name LIKE :term OR f.service_name LIKE :term ${digits.length >= 3 ? 'OR c.phone LIKE :digits' : ''})`);
    params.term = `%${q.search}%`;
    if (digits.length >= 3) params.digits = `%${digits}%`;
  }
  return { sql: `WHERE ${where.join(' AND ')}`, params, from, to };
}

const RECORD_SELECT = `
  SELECT f.*, c.name AS client_name, c.phone AS client_phone, u.name AS staff_name, a.start_min
    FROM financial_records f
    JOIN clients c ON c.id = f.client_id
    JOIN staff st ON st.id = f.staff_id JOIN users u ON u.id = st.user_id
    JOIN appointments a ON a.id = f.appointment_id`;

router.get('/records', (req, res) => {
  const q = parse(filterSchema, req.query);
  const { sql, params, from, to } = buildWhere(q);
  const totals = one(
    `SELECT COUNT(*) AS count,
            COALESCE(SUM(CASE WHEN f.paid = 1 THEN f.amount_cents END), 0) AS received_cents,
            COALESCE(SUM(CASE WHEN f.paid = 0 THEN f.amount_cents END), 0) AS receivable_cents,
            SUM(f.paid) AS paid_count
       FROM financial_records f JOIN clients c ON c.id = f.client_id ${sql}`,
    params,
  );
  const items = all(`${RECORD_SELECT} ${sql} ORDER BY f.date DESC, a.start_min DESC LIMIT :limit OFFSET :offset`, {
    ...params,
    limit: q.pageSize,
    offset: (q.page - 1) * q.pageSize,
  }).map((r) => ({ ...r, paid: !!r.paid, start_time: minToHHMM(r.start_min) }));
  const byMethod = all(
    `SELECT f.payment_method AS method, COUNT(*) AS count, SUM(f.amount_cents) AS total_cents
       FROM financial_records f JOIN clients c ON c.id = f.client_id ${sql} AND f.paid = 1
      GROUP BY f.payment_method ORDER BY total_cents DESC`,
    params,
  );
  const byStaff = all(
    `SELECT f.staff_id, u.name AS staff_name, COUNT(*) AS count, SUM(f.amount_cents) AS total_cents
       FROM financial_records f JOIN clients c ON c.id = f.client_id
       JOIN staff st ON st.id = f.staff_id JOIN users u ON u.id = st.user_id
       ${sql} AND f.paid = 1 GROUP BY f.staff_id ORDER BY total_cents DESC`,
    params,
  );
  res.json({ from, to, items, total: totals.count, totals, byMethod, byStaff, page: q.page, pageSize: q.pageSize });
});

router.patch('/records/:id', (req, res) => {
  const id = Number(req.params.id);
  const d = parse(
    z.object({
      paymentMethod: z.enum(PAYMENT_METHODS).nullable().optional(),
      paid: z.boolean().optional(),
      amountCents: zCents.optional(),
      notes: zText(300),
    }),
    req.body,
  );
  const rec = one('SELECT * FROM financial_records WHERE id = ?', [id]);
  if (!rec) throw notFound('Registro financeiro não encontrado.');
  const method = d.paymentMethod !== undefined ? d.paymentMethod : rec.payment_method;
  const paid = d.paid !== undefined ? d.paid : !!rec.paid;
  if (paid && !method) throw badRequest('Informe a forma de pagamento para marcar como pago.');
  const amount = d.amountCents ?? rec.amount_cents;
  tx(() => {
    run(
      `UPDATE financial_records SET payment_method = ?, paid = ?, paid_at = ?, amount_cents = ?, notes = COALESCE(?, notes), updated_at = ? WHERE id = ?`,
      [method, paid ? 1 : 0, paid ? rec.paid_at ?? nowIso() : null, amount, d.notes, nowIso(), id],
    );
    // Mantém o histórico do cliente coerente com o valor efetivamente cobrado
    run('UPDATE service_history SET price_cents = ? WHERE appointment_id = ?', [amount, rec.appointment_id]);
  });
  audit(req, 'finance.update', 'financial_record', id, {
    paid: [!!rec.paid, paid],
    method: [rec.payment_method, method],
    amount: [rec.amount_cents, amount],
  });
  const r = one(`${RECORD_SELECT} WHERE f.id = ?`, [id]);
  res.json({ record: { ...r, paid: !!r.paid, start_time: minToHHMM(r.start_min) } });
});

const csvCell = (v) => {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // evita injeção de fórmulas em planilhas
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

router.get('/export.csv', (req, res) => {
  const q = parse(filterSchema, req.query);
  const { sql, params, from, to } = buildWhere(q);
  const rows = all(`${RECORD_SELECT} ${sql} ORDER BY f.date, a.start_min`, params);
  const header = ['Data', 'Hora', 'Cliente', 'Telefone', 'Serviço', 'Barbeiro', 'Valor (R$)', 'Forma de pagamento', 'Pago', 'Pago em'];
  const lines = rows.map((r) =>
    [
      r.date.split('-').reverse().join('/'),
      minToHHMM(r.start_min),
      r.client_name,
      formatPhone(r.client_phone),
      r.service_name,
      r.staff_name,
      (r.amount_cents / 100).toFixed(2).replace('.', ','),
      METHOD_LABELS[r.payment_method] ?? '',
      r.paid ? 'Sim' : 'Não',
      r.paid_at ?? '',
    ]
      .map(csvCell)
      .join(';'),
  );
  audit(req, 'finance.export', 'financial_record', null, { from, to, rows: rows.length });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="financeiro_${from}_a_${to}.csv"`);
  res.send('﻿' + [header.join(';'), ...lines].join('\r\n'));
});

export default router;
