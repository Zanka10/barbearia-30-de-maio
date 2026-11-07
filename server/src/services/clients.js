import crypto from 'node:crypto';
import { all, one, run, tx } from '../db/index.js';
import { nowIso, todayStr } from '../utils/time.js';
import { hashPassword } from '../utils/password.js';
import { destroyUserSessions } from '../middleware/auth.js';
import { notifyAppointment } from './notifications.js';
import { OCCUPYING } from './availability.js';

/**
 * LGPD — direito à eliminação: remove os dados pessoais do cliente, mantendo registros
 * financeiros/históricos de forma anonimizada (obrigações legais e contábeis).
 * Agendamentos futuros ativos são cancelados.
 */
export async function anonymizeClient(clientId, actor) {
  const client = one('SELECT * FROM clients WHERE id = ?', [clientId]);
  if (!client || client.anonymized_at) return false;
  const randomHash = await hashPassword(crypto.randomBytes(24).toString('hex'));
  const today = todayStr();
  const cancelled = all(
    `SELECT id FROM appointments WHERE client_id = ? AND date >= ? AND status IN ('pending','confirmed')`,
    [clientId, today],
  );
  tx(() => {
    for (const a of cancelled) {
      run(`UPDATE appointments SET status = 'cancelled', cancel_reason = 'Cadastro do cliente removido (LGPD)', status_changed_at = ?, updated_at = ? WHERE id = ?`, [
        nowIso(),
        nowIso(),
        a.id,
      ]);
    }
    run(
      `UPDATE clients SET name = 'Cliente removido', phone = ?, email = NULL, notes = NULL,
              anonymized_at = ?, updated_at = ?, user_id = NULL WHERE id = ?`,
      [`anon-${clientId}`, nowIso(), nowIso(), clientId],
    );
    if (client.user_id) {
      run(
        `UPDATE users SET name = 'Usuário removido', email = ?, phone = NULL, active = 0, password_hash = ?, updated_at = ? WHERE id = ?`,
        [`removido-${client.user_id}@anonimo.invalid`, randomHash, nowIso(), client.user_id],
      );
      destroyUserSessions(client.user_id);
    }
  });
  for (const a of cancelled) notifyAppointment('cancelled', a.id, { actorUserId: actor?.id ?? null });
  return true;
}

/** LGPD — direito de acesso/portabilidade: exporta todos os dados do cliente. */
export function exportClientData(clientId) {
  const client = one('SELECT id, name, phone, email, consent_at, consent_version, created_at, updated_at FROM clients WHERE id = ?', [clientId]);
  return {
    exported_at: nowIso(),
    client,
    appointments: all(
      `SELECT a.id, a.date, a.start_min, a.end_min, a.status, a.price_cents, a.created_at, s.name AS service, u.name AS barber
         FROM appointments a JOIN services s ON s.id = a.service_id JOIN staff st ON st.id = a.staff_id JOIN users u ON u.id = st.user_id
        WHERE a.client_id = ? ORDER BY a.date DESC, a.start_min DESC`,
      [clientId],
    ),
    services_history: all(
      'SELECT service_name, category_name, staff_name, price_cents, date, completed_at FROM service_history WHERE client_id = ? ORDER BY date DESC',
      [clientId],
    ),
    payments: all(
      'SELECT service_name, amount_cents, payment_method, paid, paid_at, date FROM financial_records WHERE client_id = ? ORDER BY date DESC',
      [clientId],
    ),
  };
}

export function clientStats(clientId) {
  return one(
    `SELECT
       (SELECT COUNT(*) FROM appointments WHERE client_id = :id) AS appointments_count,
       (SELECT COUNT(*) FROM service_history WHERE client_id = :id) AS services_count,
       (SELECT COALESCE(SUM(amount_cents), 0) FROM financial_records WHERE client_id = :id AND paid = 1) AS total_spent_cents,
       (SELECT MAX(date) FROM service_history WHERE client_id = :id) AS last_visit,
       (SELECT COUNT(*) FROM appointments WHERE client_id = :id AND status = 'no_show') AS no_show_count,
       (SELECT COUNT(*) FROM appointments WHERE client_id = :id AND status IN ${OCCUPYING} AND date >= :today) AS upcoming_count`,
    { id: clientId, today: todayStr() },
  );
}
