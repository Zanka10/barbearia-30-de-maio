// Motor de disponibilidade: aplica horário de funcionamento, intervalo, feriados, folgas,
// bloqueios, agendamentos existentes, duração do serviço e antecedência mínima.
import { all, getSetting, one } from '../db/index.js';
import { AppError, badRequest, conflict } from '../utils/errors.js';
import { diffDays, isValidDateStr, minToHHMM, nowMinutes, todayStr, weekdayOf } from '../utils/time.js';

export const OCCUPYING = `('pending','confirmed','in_service','completed')`;

const overlaps = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && bStart < aEnd;

export function getServiceForBooking(serviceId) {
  return one(
    `SELECT s.*, c.name AS category_name, c.active AS category_active
       FROM services s JOIN categories c ON c.id = s.category_id
      WHERE s.id = ?`,
    [serviceId],
  );
}

/** Barbeiros ativos (e com login ativo) que executam o serviço. */
export function getStaffForService(serviceId) {
  return all(
    `SELECT st.id, u.name, st.photo_path, st.specialties, st.color
       FROM staff st
       JOIN users u ON u.id = st.user_id
       JOIN staff_services ss ON ss.staff_id = st.id AND ss.service_id = ?
      WHERE st.active = 1 AND u.active = 1
      ORDER BY u.name`,
    [serviceId],
  );
}

function getBusy(staffId, date, excludeApptId) {
  const appts = all(
    `SELECT start_min, end_min, 'appointment' AS kind FROM appointments
      WHERE staff_id = ? AND date = ? AND status IN ${OCCUPYING} AND id <> ?`,
    [staffId, date, excludeApptId ?? 0],
  );
  const blocks = all(
    `SELECT start_min, end_min, 'block' AS kind FROM schedule_blocks
      WHERE date = ? AND (staff_id IS NULL OR staff_id = ?)`,
    [date, staffId],
  );
  return [...appts, ...blocks];
}

function isStaffDayOff(staffId, weekday) {
  return !!one('SELECT 1 AS x FROM staff_days_off WHERE staff_id = ? AND weekday = ?', [staffId, weekday]);
}

function leadTimeLimit(date, context) {
  // Retorna o menor minuto permitido para início no dia (ou -1 se não há restrição)
  if (date !== todayStr()) return -1;
  const now = nowMinutes();
  if (context === 'panel') {
    const step = Number(getSetting('slot_interval_min', 15));
    return Math.floor(now / step) * step;
  }
  return now + Number(getSetting('min_advance_min', 60));
}

/** Verifica regras do dia (data, janela, feriado, funcionamento). Retorna { hours } ou { reason }. */
export function dayStatus(date, context = 'public') {
  if (!isValidDateStr(date)) return { reason: 'Data inválida.' };
  const today = todayStr();
  if (date < today) return { reason: 'Não é possível agendar em datas passadas.' };
  const windowDays = Number(getSetting('booking_window_days', 60));
  if (context === 'public' && diffDays(today, date) > windowDays) {
    return { reason: `Agendamentos disponíveis somente para os próximos ${windowDays} dias.` };
  }
  const holiday = one('SELECT name FROM holidays WHERE date = ?', [date]);
  if (holiday) return { reason: `Barbearia fechada: ${holiday.name}.` };
  const hours = one('SELECT * FROM business_hours WHERE weekday = ?', [weekdayOf(date)]);
  if (!hours || !hours.is_open) return { reason: 'A barbearia não funciona neste dia.' };
  return { hours };
}

/**
 * Calcula horários disponíveis.
 * @returns {{ date, closed: string|null, slots: Array<{ time, start, end, staffIds:number[] }> }}
 */
export function computeSlots({ serviceId, staffId = null, date, excludeApptId = null, context = 'public' }) {
  const service = getServiceForBooking(serviceId);
  if (!service || !service.active || !service.category_active) {
    return { date, closed: 'Serviço indisponível.', slots: [] };
  }
  const day = dayStatus(date, context);
  if (day.reason) return { date, closed: day.reason, slots: [] };
  const { hours } = day;

  let staffList = getStaffForService(serviceId);
  if (staffId) staffList = staffList.filter((s) => s.id === Number(staffId));
  const wd = weekdayOf(date);
  staffList = staffList.filter((s) => !isStaffDayOff(s.id, wd));
  if (!staffList.length) return { date, closed: 'Nenhum barbeiro disponível neste dia.', slots: [] };

  const step = Math.max(5, Number(getSetting('slot_interval_min', 15)));
  const dur = service.duration_min;
  const minStart = leadTimeLimit(date, context);
  const busyByStaff = new Map(staffList.map((s) => [s.id, getBusy(s.id, date, excludeApptId)]));

  const slots = [];
  for (let t = hours.open_min; t + dur <= hours.close_min; t += step) {
    const end = t + dur;
    if (t < minStart) continue;
    if (hours.break_start_min != null && overlaps(t, end, hours.break_start_min, hours.break_end_min)) continue;
    const free = staffList.filter((s) => !busyByStaff.get(s.id).some((b) => overlaps(t, end, b.start_min, b.end_min)));
    if (free.length) slots.push({ time: minToHHMM(t), start: t, end, staffIds: free.map((s) => s.id) });
  }
  return { date, closed: null, slots };
}

/**
 * Valida (no backend) que um horário específico pode ser agendado. Lança erro descritivo.
 * Usado na criação e na remarcação — nunca confiamos apenas no front-end.
 */
export function assertBookable({ serviceId, staffId, date, startMin, excludeApptId = null, context = 'public' }) {
  const service = getServiceForBooking(serviceId);
  if (!service) throw badRequest('Serviço não encontrado.');
  if (!service.active || !service.category_active) throw badRequest('Este serviço está desabilitado e não pode ser agendado.');

  const staff = one(
    `SELECT st.id, st.active, u.active AS user_active, u.name,
            EXISTS(SELECT 1 FROM staff_services ss WHERE ss.staff_id = st.id AND ss.service_id = ?) AS does_service
       FROM staff st JOIN users u ON u.id = st.user_id WHERE st.id = ?`,
    [serviceId, staffId],
  );
  if (!staff) throw badRequest('Barbeiro não encontrado.');
  if (!staff.active || !staff.user_active) throw badRequest(`${staff.name} está indisponível no momento.`);
  if (!staff.does_service) throw badRequest(`${staff.name} não realiza este serviço.`);

  if (!Number.isInteger(startMin) || startMin < 0 || startMin > 1439) throw badRequest('Horário inválido.');
  const day = dayStatus(date, context);
  if (day.reason) throw badRequest(day.reason);
  const { hours } = day;
  if (isStaffDayOff(staffId, weekdayOf(date))) throw badRequest(`${staff.name} não atende neste dia da semana.`);

  const endMin = startMin + service.duration_min;
  if (startMin < hours.open_min || endMin > hours.close_min) {
    throw badRequest(
      `Fora do horário de funcionamento (${minToHHMM(hours.open_min)} às ${minToHHMM(hours.close_min)}). ` +
        `O serviço dura ${service.duration_min} min.`,
    );
  }
  if (hours.break_start_min != null && overlaps(startMin, endMin, hours.break_start_min, hours.break_end_min)) {
    throw badRequest(`O horário coincide com o intervalo (${minToHHMM(hours.break_start_min)}–${minToHHMM(hours.break_end_min)}).`);
  }
  const minStart = leadTimeLimit(date, context);
  if (startMin < minStart) {
    throw badRequest(
      context === 'public'
        ? `Agendamentos precisam de antecedência mínima de ${getSetting('min_advance_min', 60)} minutos.`
        : 'Não é possível agendar em um horário que já passou.',
    );
  }
  for (const b of getBusy(staffId, date, excludeApptId)) {
    if (overlaps(startMin, endMin, b.start_min, b.end_min)) {
      if (b.kind === 'block') throw new AppError(409, 'Este horário está bloqueado na agenda do barbeiro.', { code: 'BLOCKED' });
      throw conflict('Este horário já está ocupado para este barbeiro. Escolha outro horário.', 'SLOT_TAKEN');
    }
  }
  return { service, staff, endMin };
}

/** Dias do mês com pelo menos um horário livre (para destacar no calendário público). */
export function availableDates({ serviceId, staffId = null, month }) {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  const out = [];
  for (let d = 1; d <= last; d++) {
    const date = `${month}-${String(d).padStart(2, '0')}`;
    const r = computeSlots({ serviceId, staffId, date });
    out.push({ date, available: r.slots.length > 0, count: r.slots.length, reason: r.closed });
  }
  return out;
}
