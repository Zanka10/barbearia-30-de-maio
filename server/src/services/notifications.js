// Notificações de agendamento: painel (banco + tempo real) e e-mail.
import { all, getSetting, one, run } from '../db/index.js';
import { formatDateBR, minToHHMM, weekdayName } from '../utils/time.js';
import { queueMail, renderEmail } from './mailer.js';
import { publish } from './realtime.js';

export const formatPhone = (p) => {
  if (!p || p.startsWith('anon')) return p || '';
  return p.length === 11 ? `(${p.slice(0, 2)}) ${p.slice(2, 7)}-${p.slice(7)}` : `(${p.slice(0, 2)}) ${p.slice(2, 6)}-${p.slice(6)}`;
};

export function createNotification({ userId, type, title, message, appointmentId = null }) {
  const { id } = run('INSERT INTO notifications (user_id, type, title, message, appointment_id) VALUES (?, ?, ?, ?, ?)', [
    userId,
    type,
    title,
    message,
    appointmentId,
  ]);
  const unread = one('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL', [userId]).n;
  publish(userId, 'notification', { id, type, title, message, appointmentId, unread, created_at: new Date().toISOString() });
  return id;
}

function loadDetails(appointmentId) {
  return one(
    `SELECT a.id, a.date, a.start_min, a.end_min, a.status, a.cancel_reason, a.price_cents,
            c.name AS client_name, c.phone AS client_phone, c.email AS client_email,
            s.name AS service_name,
            u.id AS staff_user_id, u.name AS staff_name, u.email AS staff_email, u.active AS staff_user_active
       FROM appointments a
       JOIN clients c ON c.id = a.client_id
       JOIN services s ON s.id = a.service_id
       JOIN staff st ON st.id = a.staff_id
       JOIN users u ON u.id = st.user_id
      WHERE a.id = ?`,
    [appointmentId],
  );
}

const EVENTS = {
  created: { type: 'appointment_created', title: 'Novo agendamento', subject: 'Novo agendamento' },
  rescheduled: { type: 'appointment_rescheduled', title: 'Agendamento alterado', subject: 'Agendamento alterado' },
  cancelled: { type: 'appointment_cancelled', title: 'Agendamento cancelado', subject: 'Agendamento cancelado' },
  confirmed: { type: 'appointment_confirmed', title: 'Agendamento confirmado', subject: 'Agendamento confirmado' },
};

/**
 * Notifica barbeiro responsável + administradores (painel e e-mail) e o cliente (e-mail, se houver).
 * @param {'created'|'rescheduled'|'cancelled'|'confirmed'} event
 * @param {{ actorUserId?: number, previous?: { date, start_min, staff_name } }} opts
 */
export function notifyAppointment(event, appointmentId, { actorUserId = null, previous = null } = {}) {
  const ev = EVENTS[event];
  const a = loadDetails(appointmentId);
  if (!ev || !a) return;

  const when = `${formatDateBR(a.date)} às ${minToHHMM(a.start_min)}`;
  const phone = formatPhone(a.client_phone);
  let message = `${a.client_name} • ${phone} • ${a.service_name} • ${when} • Barbeiro: ${a.staff_name}`;
  if (event === 'rescheduled' && previous) {
    message += ` (antes: ${formatDateBR(previous.date)} às ${minToHHMM(previous.start_min)}${previous.staff_name ? ` com ${previous.staff_name}` : ''})`;
  }
  if (event === 'cancelled' && a.cancel_reason) message += ` • Motivo: ${a.cancel_reason}`;

  const rows = [
    ['Cliente', a.client_name],
    ['Telefone', phone],
    ['Serviço', a.service_name],
    ['Data', `${formatDateBR(a.date)} (${weekdayName(a.date)})`],
    ['Horário', `${minToHHMM(a.start_min)} – ${minToHHMM(a.end_min)}`],
    ['Barbeiro', a.staff_name],
  ];
  if (event === 'rescheduled' && previous) rows.push(['Horário anterior', `${formatDateBR(previous.date)} às ${minToHHMM(previous.start_min)}`]);
  if (event === 'cancelled' && a.cancel_reason) rows.push(['Motivo', a.cancel_reason]);

  // Equipe (painel): barbeiro responsável + administradores — exceto quem realizou a ação
  if (event !== 'confirmed') {
    const recipients = new Map();
    if (a.staff_user_active) recipients.set(a.staff_user_id, { email: a.staff_email, isBarber: true });
    for (const adm of all("SELECT id, email FROM users WHERE role = 'admin' AND active = 1")) {
      if (!recipients.has(adm.id)) recipients.set(adm.id, { email: adm.email, isBarber: false });
    }
    const notifyAdminEmail = getSetting('notify_admin_email', '1') === '1';
    for (const [userId, r] of recipients) {
      if (userId !== actorUserId) {
        createNotification({ userId, type: ev.type, title: ev.title, message, appointmentId: a.id });
      }
      // E-mail: barbeiro sempre recebe; admins conforme configuração
      if (r.email && (r.isBarber || notifyAdminEmail) && userId !== actorUserId) {
        const { html, text } = renderEmail({ title: ev.title, intro: `${ev.title} na agenda.`, rows });
        queueMail({ to: r.email, subject: `${ev.subject} — ${a.client_name} — ${when}`, html, text });
      }
    }
  }

  // Cliente (e-mail opcional)
  if (a.client_email && getSetting('notify_client_email', '1') === '1') {
    const intros = {
      created: 'Recebemos seu agendamento! Confira os detalhes abaixo.',
      confirmed: 'Seu horário está confirmado. Até breve!',
      rescheduled: 'Seu agendamento foi alterado. Confira os novos detalhes.',
      cancelled: 'Seu agendamento foi cancelado.',
    };
    const { html, text } = renderEmail({
      title: ev.title,
      intro: intros[event],
      rows: rows.filter(([k]) => k !== 'Telefone'),
      footer: 'Precisa alterar? Entre em contato com a barbearia ou acesse sua área do cliente.',
    });
    queueMail({ to: a.client_email, subject: `${getSetting('shop_name', 'Barbearia')} — ${ev.subject}`, html, text });
  }
}
