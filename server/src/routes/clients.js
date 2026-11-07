import { Router } from 'express';
import { z } from 'zod';
import { all, one, run, tx } from '../db/index.js';
import { requireRole } from '../middleware/auth.js';
import { APPOINTMENT_SELECT, serializeAppointment } from '../services/appointments.js';
import { anonymizeClient, clientStats } from '../services/clients.js';
import { audit } from '../services/audit.js';
import { conflict, forbidden, notFound } from '../utils/errors.js';
import { normalizePhone, parse, zName, zOptionalEmail, zPhone, zText } from '../utils/validation.js';
import { nowIso } from '../utils/time.js';

const router = Router();
router.use(requireRole('admin', 'barber'));

/** Barbeiros só acessam clientes que já tiveram agendamento com eles. */
function assertClientAccess(user, clientId) {
  if (user.role === 'admin') return;
  const ok = one('SELECT 1 AS x FROM appointments WHERE client_id = ? AND staff_id = ? LIMIT 1', [clientId, user.staffId]);
  if (!ok) throw forbidden('Você só pode visualizar clientes atendidos por você.');
}

router.get('/', (req, res) => {
  const q = parse(
    z.object({
      search: z.string().trim().max(80).optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(5).max(100).default(20),
      sort: z.enum(['name', 'recent', 'last_visit', 'spent']).default('name'),
      includeAnonymized: z.enum(['0', '1']).default('0'),
    }),
    req.query,
  );
  const where = [];
  const params = {};
  if (q.includeAnonymized === '0') where.push('c.anonymized_at IS NULL');
  if (q.search) {
    const digits = normalizePhone(q.search);
    where.push(`(c.name LIKE :term ${digits.length >= 3 ? 'OR c.phone LIKE :digits' : ''} OR c.email LIKE :term)`);
    params.term = `%${q.search}%`;
    if (digits.length >= 3) params.digits = `%${digits}%`;
  }
  if (req.user.role === 'barber') {
    where.push('EXISTS (SELECT 1 FROM appointments x WHERE x.client_id = c.id AND x.staff_id = :staffId)');
    params.staffId = req.user.staffId;
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const order = {
    name: 'c.name COLLATE NOCASE',
    recent: 'c.created_at DESC',
    last_visit: 'last_visit DESC NULLS LAST',
    spent: 'total_spent_cents DESC',
  }[q.sort];
  const total = one(`SELECT COUNT(*) AS n FROM clients c ${whereSql}`, params).n;
  const items = all(
    `SELECT c.id, c.name, c.phone, c.email, c.created_at, c.anonymized_at, c.user_id IS NOT NULL AS has_account,
            (SELECT COUNT(*) FROM service_history h WHERE h.client_id = c.id) AS services_count,
            (SELECT MAX(date) FROM service_history h WHERE h.client_id = c.id) AS last_visit,
            (SELECT COALESCE(SUM(amount_cents),0) FROM financial_records f WHERE f.client_id = c.id AND f.paid = 1) AS total_spent_cents
       FROM clients c ${whereSql}
      ORDER BY ${order} LIMIT :limit OFFSET :offset`,
    { ...params, limit: q.pageSize, offset: (q.page - 1) * q.pageSize },
  );
  res.json({ items, total, page: q.page, pageSize: q.pageSize });
});

/** Busca rápida por celular (agendamento pelo painel) — evita cadastro duplicado. */
router.get('/lookup', (req, res) => {
  const phone = normalizePhone(req.query.phone);
  if (phone.length < 10) return res.json({ client: null });
  const client = one('SELECT id, name, phone, email FROM clients WHERE phone = ? AND anonymized_at IS NULL', [phone]);
  res.json({ client: client ?? null });
});

router.get('/:id', (req, res) => {
  const id = Number(req.params.id);
  const client = one('SELECT * FROM clients WHERE id = ?', [id]);
  if (!client) throw notFound('Cliente não encontrado.');
  assertClientAccess(req.user, id);
  const staffFilter = req.user.role === 'barber' ? 'AND a.staff_id = ?' : '';
  const params = req.user.role === 'barber' ? [id, req.user.staffId] : [id];
  const appointments = all(`${APPOINTMENT_SELECT} WHERE a.client_id = ? ${staffFilter} ORDER BY a.date DESC, a.start_min DESC`, params).map(
    serializeAppointment,
  );
  const history = all(
    `SELECT h.*, f.payment_method, f.paid FROM service_history h
       LEFT JOIN financial_records f ON f.appointment_id = h.appointment_id
      WHERE h.client_id = ? ${req.user.role === 'barber' ? 'AND h.staff_id = ?' : ''}
      ORDER BY h.date DESC, h.start_min DESC`,
    params,
  );
  audit(req, 'client.view', 'client', id);
  res.json({ client: { ...client, has_account: !!client.user_id }, stats: clientStats(id), appointments, history });
});

const clientSchema = z.object({ name: zName, phone: zPhone, email: zOptionalEmail, notes: zText(1000) });

router.post('/', (req, res) => {
  const data = parse(clientSchema, req.body);
  const existing = one('SELECT id, name FROM clients WHERE phone = ?', [data.phone]);
  if (existing) {
    return res.status(409).json({
      error: { message: `Já existe um cliente com este celular: ${existing.name}.`, code: 'DUPLICATE_PHONE', details: { clientId: existing.id } },
    });
  }
  const { id } = run('INSERT INTO clients (name, phone, email, notes) VALUES (?, ?, ?, ?)', [data.name, data.phone, data.email, data.notes]);
  audit(req, 'client.create', 'client', id);
  res.status(201).json({ client: one('SELECT * FROM clients WHERE id = ?', [id]) });
});

router.put('/:id', requireRole('admin'), (req, res) => {
  const id = Number(req.params.id);
  const data = parse(clientSchema, req.body);
  const client = one('SELECT * FROM clients WHERE id = ?', [id]);
  if (!client) throw notFound('Cliente não encontrado.');
  if (client.anonymized_at) throw conflict('Cadastro anonimizado não pode ser editado.');
  const dup = one('SELECT id FROM clients WHERE phone = ? AND id <> ?', [data.phone, id]);
  if (dup) throw conflict('Outro cliente já utiliza este celular.', 'DUPLICATE_PHONE');
  tx(() => {
    run('UPDATE clients SET name = ?, phone = ?, email = ?, notes = ?, updated_at = ? WHERE id = ?', [
      data.name,
      data.phone,
      data.email,
      data.notes,
      nowIso(),
      id,
    ]);
    if (client.user_id) {
      run('UPDATE users SET name = ?, phone = ?, updated_at = ? WHERE id = ?', [data.name, data.phone, nowIso(), client.user_id]);
    }
  });
  audit(req, 'client.update', 'client', id);
  res.json({ client: one('SELECT * FROM clients WHERE id = ?', [id]) });
});

router.post('/:id/anonymize', requireRole('admin'), async (req, res) => {
  const id = Number(req.params.id);
  if (!one('SELECT 1 AS x FROM clients WHERE id = ?', [id])) throw notFound('Cliente não encontrado.');
  await anonymizeClient(id, req.user);
  audit(req, 'lgpd.anonymize', 'client', id);
  res.json({ ok: true });
});

router.delete('/:id', requireRole('admin'), (req, res) => {
  const id = Number(req.params.id);
  const client = one('SELECT * FROM clients WHERE id = ?', [id]);
  if (!client) throw notFound('Cliente não encontrado.');
  if (one('SELECT 1 AS x FROM appointments WHERE client_id = ? LIMIT 1', [id])) {
    throw conflict('Cliente possui agendamentos/histórico. Use "Anonimizar (LGPD)" para remover os dados pessoais.', 'IN_USE');
  }
  tx(() => {
    run('DELETE FROM clients WHERE id = ?', [id]);
    if (client.user_id) {
      run('DELETE FROM sessions WHERE user_id = ?', [client.user_id]);
      run('DELETE FROM users WHERE id = ?', [client.user_id]);
    }
  });
  audit(req, 'client.delete', 'client', id);
  res.json({ ok: true });
});

export default router;
