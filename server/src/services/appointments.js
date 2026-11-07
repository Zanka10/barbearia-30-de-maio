// Regras de negócio de agendamentos: criação, remarcação, mudança de status e conclusão
// (que gera histórico de atendimento e registro financeiro).
import { getSetting, one, run, tx } from '../db/index.js';
import { badRequest, conflict, forbidden, notFound } from '../utils/errors.js';
import { minToHHMM, nowIso, nowMinutes, todayStr } from '../utils/time.js';
import { assertBookable, computeSlots, getStaffForService, OCCUPYING } from './availability.js';
import { notifyAppointment } from './notifications.js';

export const STATUS_LABELS = {
  pending: 'Pendente',
  confirmed: 'Confirmado',
  in_service: 'Em atendimento',
  completed: 'Concluído',
  cancelled: 'Cancelado',
  no_show: 'Cliente não compareceu',
};

// Transições permitidas entre status
const TRANSITIONS = {
  pending: ['confirmed', 'in_service', 'completed', 'cancelled', 'no_show'],
  confirmed: ['pending', 'in_service', 'completed', 'cancelled', 'no_show'],
  in_service: ['confirmed', 'completed', 'cancelled'],
  completed: [],
  cancelled: ['pending', 'confirmed'],
  no_show: ['confirmed'],
};

export const APPOINTMENT_SELECT = `
  SELECT a.*, c.name AS client_name, c.phone AS client_phone, c.email AS client_email,
         s.name AS service_name, s.duration_min, cat.name AS category_name,
         u.name AS staff_name, st.color AS staff_color,
         f.id AS finance_id, f.amount_cents AS finance_amount_cents, f.payment_method, f.paid, f.paid_at
    FROM appointments a
    JOIN clients c ON c.id = a.client_id
    JOIN services s ON s.id = a.service_id
    JOIN categories cat ON cat.id = s.category_id
    JOIN staff st ON st.id = a.staff_id
    JOIN users u ON u.id = st.user_id
    LEFT JOIN financial_records f ON f.appointment_id = a.id`;

export function serializeAppointment(a) {
  if (!a) return a;
  return {
    ...a,
    start_time: minToHHMM(a.start_min),
    end_time: minToHHMM(a.end_min),
    status_label: STATUS_LABELS[a.status],
    paid: a.paid == null ? null : !!a.paid,
  };
}

export function getAppointment(id) {
  return serializeAppointment(one(`${APPOINTMENT_SELECT} WHERE a.id = ?`, [id]));
}

/** Garante que o usuário pode acessar/alterar o agendamento. */
export function assertCanAccess(user, appt) {
  if (!appt) throw notFound('Agendamento não encontrado.');
  if (user.role === 'admin') return;
  if (user.role === 'barber' && appt.staff_id === user.staffId) return;
  if (user.role === 'client' && appt.client_id === user.clientId) return;
  throw forbidden();
}

/** Localiza cliente pelo celular (evita duplicidade) ou cria um novo. */
export function findOrCreateClient({ name, phone, email = null, consent = false }) {
  const existing = one('SELECT * FROM clients WHERE phone = ?', [phone]);
  if (existing) {
    const updates = [];
    const params = [];
    if (email && !existing.email) {
      updates.push('email = ?');
      params.push(email);
    }
    if (consent && !existing.consent_at) {
      updates.push('consent_at = ?', "consent_version = '1.0'");
      params.push(nowIso());
    }
    if (updates.length) {
      run(`UPDATE clients SET ${updates.join(', ')}, updated_at = ? WHERE id = ?`, [...params, nowIso(), existing.id]);
    }
    return { client: one('SELECT * FROM clients WHERE id = ?', [existing.id]), created: false };
  }
  const { id } = run(
    'INSERT INTO clients (name, phone, email, consent_at, consent_version) VALUES (?, ?, ?, ?, ?)',
    [name, phone, email, consent ? nowIso() : null, consent ? '1.0' : null],
  );
  return { client: one('SELECT * FROM clients WHERE id = ?', [id]), created: true };
}

function assertClientFree(clientId, date, startMin, endMin, excludeId = 0) {
  const clash = one(
    `SELECT a.id, a.start_min FROM appointments a
      WHERE a.client_id = ? AND a.date = ? AND a.status IN ${OCCUPYING} AND a.id <> ?
        AND a.start_min < ? AND ? < a.end_min`,
    [clientId, date, excludeId, endMin, startMin],
  );
  if (clash) throw conflict(`O cliente já possui um agendamento às ${minToHHMM(clash.start_min)} neste dia.`, 'CLIENT_BUSY');
}

/**
 * Cria um agendamento. staffId = null => escolhe automaticamente um barbeiro livre.
 * context: 'public' (site) aplica antecedência mínima e janela; 'panel' (equipe) é mais flexível.
 */
export function createAppointment({ clientId, staffId, serviceId, date, startMin, notes = null, source, actor = null, context }) {
  const id = tx(() => {
    let chosenStaff = staffId;
    if (!chosenStaff) {
      const { slots, closed } = computeSlots({ serviceId, date, context });
      if (closed) throw badRequest(closed);
      const slot = slots.find((s) => s.start === startMin);
      if (!slot) {
        // Busca o motivo exato (fora do expediente, intervalo, antecedência...) se for o mesmo para todos os barbeiros
        const messages = new Set();
        let lastErr = null;
        for (const c of getStaffForService(serviceId)) {
          try {
            assertBookable({ serviceId, staffId: c.id, date, startMin, context });
          } catch (err) {
            messages.add(err.message);
            lastErr = err;
          }
        }
        if (lastErr && messages.size === 1) throw lastErr;
        throw conflict('Este horário não está mais disponível. Escolha outro horário.', 'SLOT_TAKEN');
      }
      // Distribui a carga: escolhe o barbeiro com menos agendamentos no dia
      chosenStaff = slot.staffIds
        .map((sid) => ({
          sid,
          n: one(`SELECT COUNT(*) AS n FROM appointments WHERE staff_id = ? AND date = ? AND status IN ${OCCUPYING}`, [sid, date]).n,
        }))
        .sort((a, b) => a.n - b.n)[0].sid;
    }
    const { service, endMin } = assertBookable({ serviceId, staffId: chosenStaff, date, startMin, context });
    assertClientFree(clientId, date, startMin, endMin);

    const autoConfirm = source === 'panel' || getSetting('auto_confirm', '0') === '1';
    const now = nowIso();
    return run(
      `INSERT INTO appointments (client_id, staff_id, service_id, date, start_min, end_min, price_cents, status,
                                 notes, source, created_by, status_changed_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        clientId,
        chosenStaff,
        serviceId,
        date,
        startMin,
        endMin,
        service.price_cents,
        autoConfirm ? 'confirmed' : 'pending',
        notes,
        source,
        actor?.id ?? null,
        now,
        now,
        now,
      ],
    ).id;
  });
  // Agendamento pelo site: avisa todos (admins + barbeiro), mesmo que o navegador esteja logado como alguém da equipe.
  // Pelo painel: não avisa quem fez o agendamento (ele mesmo).
  notifyAppointment('created', id, { actorUserId: source === 'online' ? null : (actor?.id ?? null) });
  return getAppointment(id);
}

/** Remarca/edita um agendamento (data, horário, barbeiro, serviço, observações). */
export function updateAppointment(id, changes, actor) {
  const current = one('SELECT a.*, u.name AS staff_name FROM appointments a JOIN staff st ON st.id = a.staff_id JOIN users u ON u.id = st.user_id WHERE a.id = ?', [id]);
  assertCanAccess(actor, current);
  if (current.status === 'completed') throw conflict('Atendimentos concluídos não podem ser alterados.', 'COMPLETED_LOCKED');
  if (['cancelled', 'no_show'].includes(current.status)) {
    throw badRequest('Reative o agendamento antes de alterá-lo.');
  }
  if (actor.role === 'barber' && changes.staffId && changes.staffId !== current.staff_id) {
    throw forbidden('Somente o administrador pode transferir agendamentos entre barbeiros.');
  }

  const next = {
    staffId: changes.staffId ?? current.staff_id,
    serviceId: changes.serviceId ?? current.service_id,
    date: changes.date ?? current.date,
    startMin: changes.startMin ?? current.start_min,
  };
  const scheduleChanged =
    next.staffId !== current.staff_id ||
    next.serviceId !== current.service_id ||
    next.date !== current.date ||
    next.startMin !== current.start_min;

  tx(() => {
    if (scheduleChanged) {
      const { service, endMin } = assertBookable({ ...next, excludeApptId: id, context: 'panel' });
      assertClientFree(current.client_id, next.date, next.startMin, endMin, id);
      run(
        `UPDATE appointments SET staff_id = ?, service_id = ?, date = ?, start_min = ?, end_min = ?, price_cents = ?, updated_at = ?
          WHERE id = ?`,
        [
          next.staffId,
          next.serviceId,
          next.date,
          next.startMin,
          endMin,
          next.serviceId !== current.service_id ? service.price_cents : current.price_cents,
          nowIso(),
          id,
        ],
      );
    }
    if (changes.notes !== undefined) run('UPDATE appointments SET notes = ?, updated_at = ? WHERE id = ?', [changes.notes, nowIso(), id]);
  });

  if (next.date !== current.date || next.startMin !== current.start_min || next.staffId !== current.staff_id) {
    notifyAppointment('rescheduled', id, {
      actorUserId: actor.id,
      previous: { date: current.date, start_min: current.start_min, staff_name: next.staffId !== current.staff_id ? current.staff_name : null },
    });
    // Se o barbeiro mudou, o barbeiro anterior também precisa saber
    if (next.staffId !== current.staff_id) {
      const prevUser = one('SELECT user_id FROM staff WHERE id = ?', [current.staff_id]);
      if (prevUser && prevUser.user_id !== actor.id) {
        run('INSERT INTO notifications (user_id, type, title, message, appointment_id) VALUES (?, ?, ?, ?, ?)', [
          prevUser.user_id,
          'appointment_reassigned',
          'Agendamento transferido',
          `O agendamento #${id} foi transferido para outro barbeiro.`,
          id,
        ]);
      }
    }
  }
  return getAppointment(id);
}

/**
 * Altera o status. Ao concluir, gera automaticamente o histórico do cliente e o registro financeiro.
 * Faturamento só é contabilizado quando o registro financeiro está pago.
 */
export function changeStatus(id, { status, paymentMethod = null, paid = false, amountCents = null, reason = null }, actor) {
  const current = one('SELECT * FROM appointments WHERE id = ?', [id]);
  assertCanAccess(actor, current);
  if (current.status === status) return getAppointment(id);
  if (!TRANSITIONS[current.status]?.includes(status)) {
    throw badRequest(`Não é possível mudar de "${STATUS_LABELS[current.status]}" para "${STATUS_LABELS[status]}".`);
  }

  const today = todayStr();
  if (['completed', 'in_service', 'no_show'].includes(status)) {
    if (current.date > today || (current.date === today && status === 'no_show' && current.start_min > nowMinutes())) {
      throw badRequest(
        status === 'completed'
          ? 'Não é possível concluir um atendimento agendado para o futuro.'
          : 'Este status só pode ser aplicado a partir do horário do agendamento.',
      );
    }
  }
  if (status === 'completed' && paid && !paymentMethod) throw badRequest('Informe a forma de pagamento.');

  const now = nowIso();
  tx(() => {
    if (['pending', 'confirmed'].includes(status) && ['cancelled', 'no_show'].includes(current.status)) {
      // Reativação: o horário precisa continuar livre e válido
      assertBookable({
        serviceId: current.service_id,
        staffId: current.staff_id,
        date: current.date,
        startMin: current.start_min,
        excludeApptId: id,
        context: 'panel',
      });
    }
    run(
      `UPDATE appointments SET status = ?, status_changed_at = ?, updated_at = ?,
              cancel_reason = CASE WHEN ? = 'cancelled' THEN ? ELSE NULL END
        WHERE id = ?`,
      [status, now, now, status, reason, id],
    );

    if (status === 'completed') {
      const d = one(
        `SELECT a.*, s.name AS service_name, cat.name AS category_name, u.name AS staff_name
           FROM appointments a JOIN services s ON s.id = a.service_id
           JOIN categories cat ON cat.id = s.category_id
           JOIN staff st ON st.id = a.staff_id JOIN users u ON u.id = st.user_id
          WHERE a.id = ?`,
        [id],
      );
      const amount = amountCents ?? d.price_cents;
      run(
        `INSERT INTO service_history (appointment_id, client_id, staff_id, service_id, service_name, category_name, staff_name,
                                      price_cents, date, start_min, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, d.client_id, d.staff_id, d.service_id, d.service_name, d.category_name, d.staff_name, amount, d.date, d.start_min, now],
      );
      run(
        `INSERT INTO financial_records (appointment_id, client_id, staff_id, service_id, service_name, amount_cents,
                                        payment_method, paid, paid_at, date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, d.client_id, d.staff_id, d.service_id, d.service_name, amount, paymentMethod, paid ? 1 : 0, paid ? now : null, d.date],
      );
    }
  });

  if (status === 'cancelled') notifyAppointment('cancelled', id, { actorUserId: actor.id });
  if (status === 'confirmed' && current.status === 'pending') notifyAppointment('confirmed', id, { actorUserId: actor.id });
  if (['pending', 'confirmed'].includes(status) && ['cancelled', 'no_show'].includes(current.status)) {
    notifyAppointment('created', id, { actorUserId: actor.id });
  }
  return getAppointment(id);
}
