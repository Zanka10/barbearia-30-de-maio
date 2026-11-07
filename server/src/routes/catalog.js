// Categorias e serviços (gestão pelo administrador; leitura pela equipe).
import { Router } from 'express';
import { z } from 'zod';
import { all, one, run, tx } from '../db/index.js';
import { requireRole } from '../middleware/auth.js';
import { audit } from '../services/audit.js';
import { badRequest, conflict, notFound } from '../utils/errors.js';
import { nowIso } from '../utils/time.js';
import { parse, zCents, zText } from '../utils/validation.js';

const router = Router();
router.use(requireRole('admin', 'barber'));
const adminOnly = requireRole('admin');

// ---------------- Categorias ----------------
router.get('/categories', (_req, res) => {
  const items = all(
    `SELECT c.*, (SELECT COUNT(*) FROM services s WHERE s.category_id = c.id) AS services_count,
            (SELECT COUNT(*) FROM services s WHERE s.category_id = c.id AND s.active = 1) AS active_services_count
       FROM categories c ORDER BY c.sort_order, c.name`,
  );
  res.json({ items });
});

const categorySchema = z.object({
  name: z.string().trim().min(2, 'Nome muito curto.').max(80),
  description: zText(300),
  sort_order: z.coerce.number().int().min(0).max(999).default(0),
  active: z.boolean().default(true),
});

router.post('/categories', adminOnly, (req, res) => {
  const d = parse(categorySchema, req.body);
  const { id } = run('INSERT INTO categories (name, description, sort_order, active) VALUES (?, ?, ?, ?)', [
    d.name,
    d.description,
    d.sort_order,
    d.active ? 1 : 0,
  ]);
  audit(req, 'category.create', 'category', id);
  res.status(201).json({ category: one('SELECT * FROM categories WHERE id = ?', [id]) });
});

router.put('/categories/:id', adminOnly, (req, res) => {
  const id = Number(req.params.id);
  const d = parse(categorySchema, req.body);
  const r = run('UPDATE categories SET name = ?, description = ?, sort_order = ?, active = ?, updated_at = ? WHERE id = ?', [
    d.name,
    d.description,
    d.sort_order,
    d.active ? 1 : 0,
    nowIso(),
    id,
  ]);
  if (!r.changes) throw notFound('Categoria não encontrada.');
  audit(req, 'category.update', 'category', id);
  res.json({ category: one('SELECT * FROM categories WHERE id = ?', [id]) });
});

router.patch('/categories/:id/status', adminOnly, (req, res) => {
  const id = Number(req.params.id);
  const { active } = parse(z.object({ active: z.boolean() }), req.body);
  const r = run('UPDATE categories SET active = ?, updated_at = ? WHERE id = ?', [active ? 1 : 0, nowIso(), id]);
  if (!r.changes) throw notFound('Categoria não encontrada.');
  audit(req, active ? 'category.activate' : 'category.deactivate', 'category', id);
  res.json({ category: one('SELECT * FROM categories WHERE id = ?', [id]) });
});

router.delete('/categories/:id', adminOnly, (req, res) => {
  const id = Number(req.params.id);
  if (one('SELECT 1 AS x FROM services WHERE category_id = ? LIMIT 1', [id])) {
    throw conflict('A categoria possui serviços vinculados. Mova/exclua os serviços ou desative a categoria.', 'IN_USE');
  }
  const r = run('DELETE FROM categories WHERE id = ?', [id]);
  if (!r.changes) throw notFound('Categoria não encontrada.');
  audit(req, 'category.delete', 'category', id);
  res.json({ ok: true });
});

// ---------------- Serviços ----------------
function loadService(id) {
  const s = one(
    `SELECT s.*, c.name AS category_name, c.active AS category_active FROM services s
       JOIN categories c ON c.id = s.category_id WHERE s.id = ?`,
    [id],
  );
  if (s) s.staff_ids = all('SELECT staff_id FROM staff_services WHERE service_id = ?', [id]).map((r) => r.staff_id);
  return s;
}

router.get('/services', (_req, res) => {
  const items = all(
    `SELECT s.*, c.name AS category_name, c.active AS category_active,
            (SELECT GROUP_CONCAT(staff_id) FROM staff_services WHERE service_id = s.id) AS staff_ids,
            (SELECT COUNT(*) FROM service_history h WHERE h.service_id = s.id) AS times_done
       FROM services s JOIN categories c ON c.id = s.category_id
      ORDER BY c.sort_order, c.name, s.sort_order, s.name`,
  ).map((s) => ({ ...s, staff_ids: s.staff_ids ? s.staff_ids.split(',').map(Number) : [] }));
  res.json({ items });
});

const serviceSchema = z.object({
  category_id: z.coerce.number().int().positive({ message: 'Selecione a categoria.' }),
  name: z.string().trim().min(2, 'Nome muito curto.').max(100),
  description: zText(500),
  price_cents: zCents,
  duration_min: z.coerce.number().int().min(5, 'Duração mínima de 5 minutos.').max(480, 'Duração máxima de 8 horas.'),
  active: z.boolean().default(true),
  sort_order: z.coerce.number().int().min(0).max(999).default(0),
  staff_ids: z.array(z.coerce.number().int().positive()).optional(),
});

function saveServiceStaff(serviceId, staffIds) {
  if (!staffIds) return;
  run('DELETE FROM staff_services WHERE service_id = ?', [serviceId]);
  for (const sid of new Set(staffIds)) {
    if (!one('SELECT 1 AS x FROM staff WHERE id = ?', [sid])) throw badRequest(`Funcionário #${sid} não existe.`);
    run('INSERT INTO staff_services (staff_id, service_id) VALUES (?, ?)', [sid, serviceId]);
  }
}

router.post('/services', adminOnly, (req, res) => {
  const d = parse(serviceSchema, req.body);
  if (!one('SELECT 1 AS x FROM categories WHERE id = ?', [d.category_id])) throw badRequest('Categoria inválida.');
  const id = tx(() => {
    const { id } = run(
      'INSERT INTO services (category_id, name, description, price_cents, duration_min, active, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [d.category_id, d.name, d.description, d.price_cents, d.duration_min, d.active ? 1 : 0, d.sort_order],
    );
    saveServiceStaff(id, d.staff_ids);
    return id;
  });
  audit(req, 'service.create', 'service', id);
  res.status(201).json({ service: loadService(id) });
});

router.put('/services/:id', adminOnly, (req, res) => {
  const id = Number(req.params.id);
  const d = parse(serviceSchema, req.body);
  const before = loadService(id);
  if (!before) throw notFound('Serviço não encontrado.');
  if (!one('SELECT 1 AS x FROM categories WHERE id = ?', [d.category_id])) throw badRequest('Categoria inválida.');
  tx(() => {
    run(
      `UPDATE services SET category_id = ?, name = ?, description = ?, price_cents = ?, duration_min = ?, active = ?, sort_order = ?, updated_at = ?
        WHERE id = ?`,
      [d.category_id, d.name, d.description, d.price_cents, d.duration_min, d.active ? 1 : 0, d.sort_order, nowIso(), id],
    );
    saveServiceStaff(id, d.staff_ids);
  });
  audit(req, 'service.update', 'service', id, {
    price: before.price_cents !== d.price_cents ? [before.price_cents, d.price_cents] : undefined,
    duration: before.duration_min !== d.duration_min ? [before.duration_min, d.duration_min] : undefined,
  });
  res.json({ service: loadService(id) });
});

router.patch('/services/:id/status', adminOnly, (req, res) => {
  const id = Number(req.params.id);
  const { active } = parse(z.object({ active: z.boolean() }), req.body);
  const r = run('UPDATE services SET active = ?, updated_at = ? WHERE id = ?', [active ? 1 : 0, nowIso(), id]);
  if (!r.changes) throw notFound('Serviço não encontrado.');
  audit(req, active ? 'service.activate' : 'service.deactivate', 'service', id);
  res.json({ service: loadService(id) });
});

router.put('/services/:id/staff', adminOnly, (req, res) => {
  const id = Number(req.params.id);
  const { staffIds } = parse(z.object({ staffIds: z.array(z.coerce.number().int().positive()) }), req.body);
  if (!loadService(id)) throw notFound('Serviço não encontrado.');
  tx(() => saveServiceStaff(id, staffIds));
  audit(req, 'service.staff', 'service', id);
  res.json({ service: loadService(id) });
});

router.delete('/services/:id', adminOnly, (req, res) => {
  const id = Number(req.params.id);
  if (one('SELECT 1 AS x FROM appointments WHERE service_id = ? LIMIT 1', [id])) {
    throw conflict('Este serviço possui agendamentos/histórico. Desative-o em vez de excluir.', 'IN_USE');
  }
  const r = run('DELETE FROM services WHERE id = ?', [id]);
  if (!r.changes) throw notFound('Serviço não encontrado.');
  audit(req, 'service.delete', 'service', id);
  res.json({ ok: true });
});

export default router;
