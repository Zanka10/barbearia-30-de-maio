// Formulário de novo agendamento / remarcação pelo painel.
import { useEffect, useMemo, useState } from 'react';
import { Search, UserPlus, X } from 'lucide-react';
import { api, qs } from '../lib/api.js';
import { duration, isValidPhone, money, onlyDigits, phoneBR, today } from '../lib/format.js';
import { useApi, useDebounced } from '../lib/hooks.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { ErrorBox, Field, Modal, PhoneInput, Spinner } from './ui.jsx';

function ClientPicker({ value, onChange }) {
  const [term, setTerm] = useState('');
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ name: '', phone: '', email: '' });
  const [existing, setExisting] = useState(null);
  const debounced = useDebounced(term, 250);
  const { data, loading } = useApi(debounced.length >= 2 ? `/clients${qs({ search: debounced, pageSize: 8 })}` : null);

  // Ao digitar o celular de um novo cliente, verifica se já existe cadastro (evita duplicidade)
  useEffect(() => {
    if (!creating || !isValidPhone(draft.phone)) return setExisting(null);
    api.get(`/clients/lookup?phone=${onlyDigits(draft.phone)}`).then((r) => setExisting(r.client));
  }, [draft.phone, creating]);

  useEffect(() => {
    if (creating) onChange({ newClient: draft });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, creating]);

  if (value?.client) {
    return (
      <div className="row between card" style={{ padding: 12, background: 'var(--bg-elev)' }}>
        <div>
          <div className="strong">{value.client.name}</div>
          <div className="small muted">{phoneBR(value.client.phone)}</div>
        </div>
        {!value.locked && (
          <button className="icon-btn" onClick={() => onChange(null)} aria-label="Trocar cliente">
            <X />
          </button>
        )}
      </div>
    );
  }

  if (creating) {
    return (
      <div className="card stack" style={{ padding: 14, background: 'var(--bg-elev)' }}>
        <div className="row between">
          <span className="strong small">Novo cliente</span>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setCreating(false);
              onChange(null);
            }}
          >
            Buscar existente
          </button>
        </div>
        <div className="form-grid">
          <Field label="Celular *">
            <PhoneInput value={draft.phone} onChange={(phone) => setDraft({ ...draft, phone })} />
          </Field>
          <Field label="Nome completo *">
            <input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </Field>
          <Field label="E-mail (opcional)" className="full">
            <input className="input" type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
          </Field>
        </div>
        {existing && (
          <div className="alert info">
            <div className="grow">
              Já existe um cliente com este celular: <strong>{existing.name}</strong>.
            </div>
            <button
              className="btn btn-sm btn-outline"
              onClick={() => {
                setCreating(false);
                onChange({ client: existing });
              }}
            >
              Usar cadastro
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="input-icon">
        <Search />
        <input className="input" placeholder="Buscar por nome ou celular..." value={term} onChange={(e) => setTerm(e.target.value)} />
      </div>
      {loading && <Spinner />}
      {data?.items?.length > 0 && (
        <div className="card flush">
          {data.items.map((c) => (
            <button
              key={c.id}
              type="button"
              className="notif-item"
              style={{ width: '100%', background: 'none', border: 0, borderBottom: '1px solid var(--border)', color: 'inherit', textAlign: 'left' }}
              onClick={() => onChange({ client: c })}
            >
              <div className="grow">
                <div className="strong small">{c.name}</div>
                <div className="xs muted">{phoneBR(c.phone)}</div>
              </div>
            </button>
          ))}
        </div>
      )}
      {debounced.length >= 2 && data && !data.items.length && <div className="small muted">Nenhum cliente encontrado.</div>}
      <button
        type="button"
        className="btn btn-outline btn-sm"
        style={{ alignSelf: 'flex-start' }}
        onClick={() => {
          setCreating(true);
          const digits = onlyDigits(term);
          setDraft({ name: digits.length >= 8 ? '' : term, phone: digits.length >= 8 ? term : '', email: '' });
        }}
      >
        <UserPlus /> Cadastrar novo cliente
      </button>
    </div>
  );
}

export default function AppointmentForm({ appointment, prefill = {}, onClose, onSaved }) {
  const { user, isAdmin } = useAuth();
  const toast = useToast();
  const editing = !!appointment;
  const [clientSel, setClientSel] = useState(
    editing
      ? { client: { id: appointment.client_id, name: appointment.client_name, phone: appointment.client_phone }, locked: true }
      : prefill.client
        ? { client: prefill.client, locked: false }
        : null,
  );
  const [serviceId, setServiceId] = useState(appointment?.service_id ?? prefill.serviceId ?? '');
  const [staffId, setStaffId] = useState(appointment?.staff_id ?? prefill.staffId ?? (user.role === 'barber' ? user.staffId : ''));
  const [date, setDate] = useState(appointment?.date ?? prefill.date ?? today());
  const [time, setTime] = useState(appointment?.start_time ?? prefill.time ?? '');
  const [notes, setNotes] = useState(appointment?.notes ?? '');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const { data: svcData } = useApi('/catalog/services');
  const { data: staffData } = useApi('/staff');
  const services = useMemo(
    () => (svcData?.items || []).filter((s) => (s.active && s.category_active) || s.id === appointment?.service_id),
    [svcData, appointment],
  );
  const service = services.find((s) => s.id === Number(serviceId));
  const staffOptions = useMemo(
    () => (staffData?.items || []).filter((s) => s.active && s.user_active && (!service || s.service_ids.includes(service.id))),
    [staffData, service],
  );

  const availUrl =
    serviceId && date
      ? `/appointments/availability${qs({ serviceId, staffId: staffId || undefined, date, excludeId: appointment?.id })}`
      : null;
  const { data: avail, loading: loadingSlots } = useApi(availUrl, { keepPrevious: false });
  const slots = avail?.slots || [];
  // Se o horário original do agendamento em edição não estiver na lista (ex.: fora da grade), mantém visível
  const timeInSlots = slots.some((s) => s.time === time);

  const grouped = useMemo(() => {
    const g = new Map();
    for (const s of services) {
      if (!g.has(s.category_name)) g.set(s.category_name, []);
      g.get(s.category_name).push(s);
    }
    return [...g.entries()];
  }, [services]);

  const save = async () => {
    setError(null);
    if (!editing && !clientSel) return setError(new Error('Selecione ou cadastre o cliente.'));
    if (!serviceId) return setError(new Error('Selecione o serviço.'));
    if (!time) return setError(new Error('Selecione um horário disponível.'));
    setSaving(true);
    try {
      let res;
      if (editing) {
        res = await api.put(`/appointments/${appointment.id}`, {
          serviceId: Number(serviceId),
          staffId: staffId ? Number(staffId) : undefined,
          date,
          time,
          notes,
        });
        toast.success('Agendamento atualizado.');
      } else {
        const body = { serviceId: Number(serviceId), staffId: staffId ? Number(staffId) : null, date, time, notes };
        if (clientSel.client) body.clientId = clientSel.client.id;
        else body.client = { ...clientSel.newClient, email: clientSel.newClient.email || null };
        res = await api.post('/appointments', body);
        toast.success('Agendamento criado.');
      }
      onSaved(res.appointment);
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={editing ? `Remarcar / editar #${appointment.id}` : 'Novo agendamento'}
      onClose={onClose}
      size="lg"
      closeOnBackdrop={false}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Salvando...' : editing ? 'Salvar alterações' : 'Agendar'}
          </button>
        </>
      }
    >
      <div className="stack lg">
        <Field label="Cliente">
          <ClientPicker value={clientSel} onChange={setClientSel} />
        </Field>
        <div className="form-grid">
          <Field label="Serviço">
            <select
              className="select"
              value={serviceId}
              onChange={(e) => {
                setServiceId(e.target.value);
                setTime('');
              }}
            >
              <option value="">Selecione...</option>
              {grouped.map(([cat, list]) => (
                <optgroup key={cat} label={cat}>
                  {list.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} — {money(s.price_cents)} · {duration(s.duration_min)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </Field>
          <Field label="Barbeiro">
            <select
              className="select"
              value={staffId}
              disabled={user.role === 'barber'}
              onChange={(e) => {
                setStaffId(e.target.value);
                setTime('');
              }}
            >
              {isAdmin && <option value="">Qualquer disponível</option>}
              {staffOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
              {user.role === 'barber' && !staffOptions.some((s) => s.id === user.staffId) && <option value={user.staffId}>{user.name}</option>}
            </select>
          </Field>
          <Field label="Data">
            <input
              className="input"
              type="date"
              value={date}
              min={today()}
              onChange={(e) => {
                setDate(e.target.value);
                setTime('');
              }}
            />
          </Field>
          <Field label="Observações (opcional)">
            <input className="input" value={notes ?? ''} maxLength={500} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>

        <Field label={`Horários disponíveis${service ? ` (duração: ${duration(service.duration_min)})` : ''}`}>
          {!serviceId ? (
            <div className="small muted">Selecione o serviço para ver os horários.</div>
          ) : loadingSlots ? (
            <Spinner />
          ) : avail?.closed ? (
            <div className="alert warning">{avail.closed}</div>
          ) : (
            <div className="slots">
              {editing && time && !timeInSlots && date === appointment.date && Number(serviceId) === appointment.service_id && (
                <button type="button" className="slot active" title="Horário atual">
                  {time}
                </button>
              )}
              {slots.map((s) => (
                <button key={s.time} type="button" className={`slot ${time === s.time ? 'active' : ''}`} onClick={() => setTime(s.time)}>
                  {s.time}
                </button>
              ))}
              {!slots.length && <div className="small muted">Nenhum horário livre nesta data.</div>}
            </div>
          )}
        </Field>
        <ErrorBox error={error} />
      </div>
    </Modal>
  );
}
