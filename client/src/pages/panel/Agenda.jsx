import { useCallback, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import ptBrLocale from '@fullcalendar/core/locales/pt-br';
import { Plus } from 'lucide-react';
import { api, qs } from '../../lib/api.js';
import { addDays, minToHHMM, pad, toDateStr } from '../../lib/format.js';
import { STATUS } from '../../lib/constants.js';
import { useApi, useOnAppointmentsChanged } from '../../lib/hooks.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useAppointmentModal } from '../../components/AppointmentModal.jsx';
import { Switch } from '../../components/ui.jsx';

/** Texto legível sobre a cor do barbeiro. */
function textOn(hex) {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return (r * 299 + g * 587 + b * 114) / 1000 > 140 ? '#121212' : '#ffffff';
}

export default function Agenda() {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const { openAppointment, openNew } = useAppointmentModal();
  const [params] = useSearchParams();
  const [staffId, setStaffId] = useState(params.get('staff') || '');
  const [showCancelled, setShowCancelled] = useState(false);
  const { data: staffData } = useApi(isAdmin ? '/staff' : null);
  const { data: hoursData } = useApi('/schedule/hours');
  const calRef = useRef(null);
  const narrow = typeof window !== 'undefined' && window.innerWidth < 760;

  const hours = hoursData?.items || [];
  const range = useMemo(() => {
    const open = hours.filter((h) => h.is_open);
    if (!open.length) return { min: '07:00:00', max: '21:00:00' };
    const min = Math.max(0, Math.min(...open.map((h) => h.open_min)) - 30);
    const max = Math.min(1440, Math.max(...open.map((h) => h.close_min)) + 30);
    return { min: `${minToHHMM(min)}:00`, max: max >= 1440 ? '24:00:00' : `${minToHHMM(max)}:00` };
  }, [hours]);

  const businessHours = useMemo(
    () =>
      hours
        .filter((h) => h.is_open)
        .flatMap((h) =>
          h.break_start_min != null
            ? [
                { daysOfWeek: [h.weekday], startTime: minToHHMM(h.open_min), endTime: minToHHMM(h.break_start_min) },
                { daysOfWeek: [h.weekday], startTime: minToHHMM(h.break_end_min), endTime: minToHHMM(h.close_min) },
              ]
            : [{ daysOfWeek: [h.weekday], startTime: minToHHMM(h.open_min), endTime: minToHHMM(h.close_min) }],
        ),
    [hours],
  );

  const fetchEvents = useCallback(
    async (info, success, failure) => {
      try {
        const from = toDateStr(info.start);
        const to = addDays(toDateStr(info.end), -1);
        const d = await api.get(`/appointments/calendar${qs({ from, to, staffId, includeCancelled: showCancelled ? 1 : 0 })}`);
        const events = [
          ...d.appointments.map((a) => ({
            id: String(a.id),
            title: `${a.client_name} · ${a.service_name}`,
            start: `${a.date}T${a.start_time}`,
            end: `${a.date}T${a.end_time}`,
            backgroundColor: a.staff_color,
            borderColor: a.staff_color,
            textColor: textOn(a.staff_color),
            classNames: [`st-${a.status}`],
            editable: ['pending', 'confirmed'].includes(a.status),
            extendedProps: { kind: 'appointment', appt: a },
          })),
          ...d.blocks.map((b) => ({
            id: `b${b.id}`,
            title: `Bloqueio${b.staff_name ? ` · ${b.staff_name}` : ' · Barbearia'}${b.reason ? ` — ${b.reason}` : ''}`,
            start: `${b.date}T${b.start_time}`,
            end: b.end_min >= 1440 ? `${addDays(b.date, 1)}T00:00` : `${b.date}T${b.end_time}`,
            display: 'background',
            backgroundColor: '#7a7a84',
          })),
          ...d.holidays.map((h) => ({ id: `h${h.id}`, title: `Feriado: ${h.name}`, start: h.date, allDay: true, display: 'background', backgroundColor: '#a8842f' })),
        ];
        success(events);
      } catch (err) {
        failure(err);
        toast.error(err);
      }
    },
    [staffId, showCancelled, toast],
  );

  // (trocar staffId/showCancelled recria fetchEvents e o FullCalendar recarrega sozinho)
  useOnAppointmentsChanged(() => calRef.current?.getApi().refetchEvents());

  const onDrop = async (info) => {
    const a = info.event.extendedProps.appt;
    const s = info.event.start;
    const date = toDateStr(s);
    const time = `${pad(s.getHours())}:${pad(s.getMinutes())}`;
    if (!window.confirm(`Remarcar ${a.client_name} para ${date.split('-').reverse().join('/')} às ${time}?`)) return info.revert();
    try {
      await api.put(`/appointments/${a.id}`, { date, time });
      toast.success('Agendamento remarcado. O barbeiro e o cliente foram notificados.');
      info.view.calendar.refetchEvents();
    } catch (err) {
      info.revert();
      toast.error(err);
    }
  };

  return (
    <div className="stack">
      <div className="row wrap between">
        <div className="row wrap">
          {isAdmin && (
            <select className="select" style={{ width: 230 }} value={staffId} onChange={(e) => setStaffId(e.target.value)} aria-label="Barbeiro">
              <option value="">Todos os barbeiros</option>
              {staffData?.items
                .filter((s) => s.active)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          )}
          <Switch checked={showCancelled} onChange={setShowCancelled} label="Mostrar cancelados" />
        </div>
        <button className="btn btn-primary" onClick={() => openNew({ staffId: staffId ? Number(staffId) : undefined })}>
          <Plus /> Novo agendamento
        </button>
      </div>

      {isAdmin && staffData && !staffId && (
        <div className="row wrap small" style={{ gap: 14 }}>
          {staffData.items
            .filter((s) => s.active)
            .map((s) => (
              <span key={s.id} className="row" style={{ gap: 6 }}>
                <span className="color-dot" style={{ background: s.color }} /> {s.name}
              </span>
            ))}
          <span className="muted xs">· Listrado = pendente · Contorno = em atendimento · Esmaecido = concluído</span>
        </div>
      )}

      <div className="card" style={{ padding: 14 }}>
        <FullCalendar
          ref={calRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          locale={ptBrLocale}
          initialView={narrow ? 'timeGridDay' : 'timeGridWeek'}
          headerToolbar={{ left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay' }}
          buttonText={{ today: 'Hoje', month: 'Mês', week: 'Semana', day: 'Dia' }}
          height="auto"
          slotMinTime={range.min}
          slotMaxTime={range.max}
          slotDuration="00:15:00"
          slotLabelInterval="01:00"
          allDaySlot
          allDayText="Dia"
          nowIndicator
          firstDay={1}
          businessHours={businessHours.length ? businessHours : false}
          dayMaxEvents={4}
          eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
          slotLabelFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
          events={fetchEvents}
          eventClick={(info) => {
            if (info.event.extendedProps.kind === 'appointment') openAppointment(Number(info.event.id));
          }}
          dateClick={(info) => {
            const date = toDateStr(info.date);
            const time = info.allDay ? undefined : `${pad(info.date.getHours())}:${pad(info.date.getMinutes())}`;
            if (info.view.type === 'dayGridMonth') {
              info.view.calendar.changeView('timeGridDay', date);
              return;
            }
            openNew({ date, time, staffId: staffId ? Number(staffId) : undefined });
          }}
          eventDrop={onDrop}
          eventDurationEditable={false}
          eventDidMount={(info) => {
            const a = info.event.extendedProps.appt;
            if (a) info.el.title = `${a.start_time}–${a.end_time} · ${a.client_name}\n${a.service_name} · ${a.staff_name}\n${STATUS[a.status].label}`;
          }}
        />
      </div>
    </div>
  );
}
