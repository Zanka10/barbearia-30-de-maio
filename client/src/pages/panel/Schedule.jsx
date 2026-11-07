import { useEffect, useState } from 'react';
import { Ban, CalendarOff, Clock, Download, Plus, Trash2 } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useApi, notifyAppointmentsChanged } from '../../lib/hooks.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { ConfirmDialog, Empty, ErrorBox, Field, Loading, Modal, PageHeader, Switch } from '../../components/ui.jsx';
import { WEEKDAYS } from '../../lib/constants.js';
import { addDays, dateBR, minToHHMM, pad, today } from '../../lib/format.js';

// ---------------- Feriados nacionais (inclui datas móveis baseadas na Páscoa) ----------------
function easter(y) {
  const a = y % 19,
    b = Math.floor(y / 100),
    c = y % 100,
    d = Math.floor(b / 4),
    e = b % 4,
    f = Math.floor((b + 8) / 25),
    g = Math.floor((b - f + 1) / 3),
    h = (19 * a + b - d - g + 15) % 30,
    i = Math.floor(c / 4),
    k = c % 4,
    l = (32 + 2 * e + 2 * i - h - k) % 7,
    m = Math.floor((a + 11 * h + 22 * l) / 451),
    month = Math.floor((h + l - 7 * m + 114) / 31),
    day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${y}-${pad(month)}-${pad(day)}`;
}
function nationalHolidays(y) {
  const e = easter(y);
  return [
    [`${y}-01-01`, 'Confraternização Universal'],
    [addDays(e, -48), 'Carnaval (segunda)'],
    [addDays(e, -47), 'Carnaval (terça)'],
    [addDays(e, -2), 'Sexta-feira Santa'],
    [`${y}-04-21`, 'Tiradentes'],
    [`${y}-05-01`, 'Dia do Trabalho'],
    [addDays(e, 60), 'Corpus Christi'],
    [`${y}-09-07`, 'Independência do Brasil'],
    [`${y}-10-12`, 'Nossa Senhora Aparecida'],
    [`${y}-11-02`, 'Finados'],
    [`${y}-11-15`, 'Proclamação da República'],
    [`${y}-11-20`, 'Dia da Consciência Negra'],
    [`${y}-12-25`, 'Natal'],
  ];
}

// ---------------- Horário de funcionamento ----------------
function HoursEditor({ readOnly }) {
  const toast = useToast();
  const { data, loading, error, reload } = useApi('/schedule/hours');
  const [days, setDays] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data)
      setDays(
        data.items.map((h) => ({
          weekday: h.weekday,
          is_open: !!h.is_open,
          open: minToHHMM(h.open_min),
          close: minToHHMM(h.close_min === 1440 ? 1439 : h.close_min),
          break_start: h.break_start_min != null ? minToHHMM(h.break_start_min) : '',
          break_end: h.break_end_min != null ? minToHHMM(h.break_end_min) : '',
        })),
      );
  }, [data]);

  if (loading && !days) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!days) return null;
  const order = [1, 2, 3, 4, 5, 6, 0];
  const set = (wd, patch) => setDays((ds) => ds.map((d) => (d.weekday === wd ? { ...d, ...patch } : d)));

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await api.put('/schedule/hours', {
        days: days.map((d) => ({ ...d, break_start: d.break_start || null, break_end: d.break_end || null })),
      });
      toast.success('Horário de funcionamento salvo. A disponibilidade online foi atualizada.');
      reload();
    } catch (err) {
      setSaveError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card">
      <div className="hours-row hours-head" style={{ paddingTop: 0 }}>
        <span>Dia</span>
        <span>Aberto</span>
        <span>Abertura</span>
        <span>Fechamento</span>
        <span>Início intervalo</span>
        <span>Fim intervalo</span>
      </div>
      {order.map((wd) => {
        const d = days.find((x) => x.weekday === wd);
        return (
          <div key={wd} className={`hours-row ${d.is_open ? '' : 'closed'}`}>
            <span className="strong hours-day">{WEEKDAYS[wd]}</span>
            <Switch checked={d.is_open} disabled={readOnly} onChange={(v) => set(wd, { is_open: v })} label={d.is_open ? 'Aberto' : 'Fechado'} />
            <input className="input" type="time" aria-label="Abertura" disabled={readOnly || !d.is_open} value={d.open} onChange={(e) => set(wd, { open: e.target.value })} />
            <input className="input" type="time" aria-label="Fechamento" disabled={readOnly || !d.is_open} value={d.close} onChange={(e) => set(wd, { close: e.target.value })} />
            <input className="input" type="time" aria-label="Início do intervalo" disabled={readOnly || !d.is_open} value={d.break_start} onChange={(e) => set(wd, { break_start: e.target.value })} />
            <input className="input" type="time" aria-label="Fim do intervalo" disabled={readOnly || !d.is_open} value={d.break_end} onChange={(e) => set(wd, { break_end: e.target.value })} />
          </div>
        );
      })}
      {!readOnly && (
        <div className="stack mt">
          <p className="xs muted">Deixe o intervalo em branco se não houver pausa para almoço. Folgas individuais são definidas no cadastro de cada funcionário.</p>
          <ErrorBox error={saveError} />
          <div>
            <button className="btn btn-primary" onClick={save} disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar horários'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------- Feriados ----------------
function Holidays() {
  const toast = useToast();
  const { data, loading, error, reload } = useApi('/schedule/holidays');
  const [f, setF] = useState({ date: '', name: '' });
  const [err, setErr] = useState(null);
  const [importing, setImporting] = useState(false);

  const add = async (e) => {
    e?.preventDefault();
    setErr(null);
    try {
      const r = await api.post('/schedule/holidays', f);
      toast.success('Feriado cadastrado.');
      if (r.affectedAppointments) toast.info(`Existem ${r.affectedAppointments} agendamento(s) nesta data. Verifique a agenda.`, 'Atenção');
      setF({ date: '', name: '' });
      reload();
    } catch (er) {
      setErr(er);
    }
  };

  const importNational = async () => {
    setImporting(true);
    const y = new Date().getFullYear();
    const existing = new Set((data?.items || []).map((h) => h.date));
    const list = [...nationalHolidays(y), ...nationalHolidays(y + 1)].filter(([d]) => d >= today() && !existing.has(d));
    let ok = 0;
    for (const [date, name] of list) {
      try {
        await api.post('/schedule/holidays', { date, name });
        ok++;
      } catch {
        /* ignora duplicados */
      }
    }
    setImporting(false);
    toast.success(`${ok} feriado(s) nacional(is) importado(s).`);
    reload();
  };

  return (
    <div className="grid grid-2" style={{ alignItems: 'start' }}>
      <form className="card stack" onSubmit={add}>
        <div className="card-title">
          <Plus /> Adicionar feriado / dia fechado
        </div>
        <Field label="Data">
          <input className="input" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} required />
        </Field>
        <Field label="Descrição">
          <input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Ex.: Aniversário da cidade" required />
        </Field>
        <ErrorBox error={err} />
        <div className="row wrap">
          <button className="btn btn-primary">Adicionar</button>
          <button type="button" className="btn btn-outline" onClick={importNational} disabled={importing}>
            <Download /> {importing ? 'Importando...' : 'Importar feriados nacionais'}
          </button>
        </div>
        <p className="xs muted">Em feriados a barbearia fica fechada e nenhum horário é oferecido.</p>
      </form>
      <div className="card flush">
        {loading && !data ? (
          <Loading />
        ) : error ? (
          <ErrorBox error={error} onRetry={reload} />
        ) : !data.items.length ? (
          <Empty icon={CalendarOff} title="Nenhum feriado cadastrado" />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Feriado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.items.map((h) => (
                  <tr key={h.id} className={h.date < today() ? 'inactive-row' : ''}>
                    <td className="nowrap">{dateBR(h.date)}</td>
                    <td>{h.name}</td>
                    <td>
                      <div className="actions">
                        <button
                          className="icon-btn danger"
                          aria-label="Remover"
                          onClick={async () => {
                            await api.del(`/schedule/holidays/${h.id}`);
                            reload();
                          }}
                        >
                          <Trash2 />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------- Bloqueios ----------------
function BlockForm({ onClose, onSaved }) {
  const { user, isAdmin } = useAuth();
  const toast = useToast();
  const { data: staff } = useApi(isAdmin ? '/staff' : null);
  const [f, setF] = useState({
    staffId: isAdmin ? '' : user.staffId,
    dateFrom: today(),
    dateTo: today(),
    allDay: false,
    start: '12:00',
    end: '13:00',
    reason: '',
  });
  const [error, setError] = useState(null);
  const [conflicts, setConflicts] = useState(null);

  const save = async (force = false) => {
    setError(null);
    try {
      const r = await api.post('/schedule/blocks', {
        staffId: f.staffId ? Number(f.staffId) : null,
        dateFrom: f.dateFrom,
        dateTo: f.dateTo || f.dateFrom,
        allDay: f.allDay,
        start: f.allDay ? undefined : f.start,
        end: f.allDay ? undefined : f.end,
        reason: f.reason,
        force,
      });
      toast.success(`${r.created} bloqueio(s) criado(s).`);
      notifyAppointmentsChanged();
      onSaved();
    } catch (err) {
      if (err.code === 'BLOCK_HAS_APPOINTMENTS') setConflicts(err);
      else setError(err);
    }
  };

  return (
    <Modal
      title="Bloquear horários"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          {conflicts ? (
            <button className="btn btn-danger" onClick={() => save(true)}>
              Bloquear mesmo assim
            </button>
          ) : (
            <button className="btn btn-primary" onClick={() => save(false)}>
              Bloquear
            </button>
          )}
        </>
      }
    >
      <div className="form-grid">
        {isAdmin && (
          <Field label="Aplicar a" className="full">
            <select className="select" value={f.staffId} onChange={(e) => setF({ ...f, staffId: e.target.value })}>
              <option value="">Toda a barbearia</option>
              {staff?.items
                .filter((s) => s.active)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </Field>
        )}
        <Field label="De">
          <input className="input" type="date" value={f.dateFrom} min={today()} onChange={(e) => setF({ ...f, dateFrom: e.target.value, dateTo: e.target.value > f.dateTo ? e.target.value : f.dateTo })} />
        </Field>
        <Field label="Até" hint="Para férias ou ausências de vários dias">
          <input className="input" type="date" value={f.dateTo} min={f.dateFrom} onChange={(e) => setF({ ...f, dateTo: e.target.value })} />
        </Field>
        <div className="full">
          <Switch checked={f.allDay} onChange={(allDay) => setF({ ...f, allDay })} label="Dia inteiro" />
        </div>
        {!f.allDay && (
          <>
            <Field label="Início">
              <input className="input" type="time" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} />
            </Field>
            <Field label="Fim">
              <input className="input" type="time" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} />
            </Field>
          </>
        )}
        <Field label="Motivo" className="full">
          <input className="input" value={f.reason} maxLength={200} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="Ex.: reunião, consulta médica, férias" />
        </Field>
      </div>
      {conflicts && (
        <div className="alert warning mt">
          <div>
            <strong>{conflicts.message}</strong>
            <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
              {conflicts.details.conflicts.slice(0, 8).map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            <div className="xs" style={{ marginTop: 6 }}>
              Remarque ou cancele esses agendamentos na agenda.
            </div>
          </div>
        </div>
      )}
      {error && (
        <div className="mt">
          <ErrorBox error={error} />
        </div>
      )}
    </Modal>
  );
}

function Blocks() {
  const { user, isAdmin } = useAuth();
  const toast = useToast();
  const from = today();
  const { data, loading, error, reload } = useApi(`/schedule/blocks?from=${from}&to=${addDays(from, 180)}`);
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState(null);

  return (
    <div className="stack">
      <div className="row between wrap">
        <p className="small muted">Bloqueie horários para compromissos, reuniões, férias ou indisponibilidade. Horários bloqueados não aparecem para agendamento.</p>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          <Ban /> Novo bloqueio
        </button>
      </div>
      <div className="card flush">
        {loading && !data ? (
          <Loading />
        ) : error ? (
          <ErrorBox error={error} onRetry={reload} />
        ) : !data.items.length ? (
          <Empty icon={Ban} title="Nenhum bloqueio futuro" />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Horário</th>
                  <th>Aplica-se a</th>
                  <th>Motivo</th>
                  <th className="hide-xs">Criado por</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.items.map((b) => (
                  <tr key={b.id}>
                    <td className="nowrap">{dateBR(b.date)}</td>
                    <td className="nowrap">{b.all_day ? 'Dia inteiro' : `${b.start_time}–${b.end_time}`}</td>
                    <td>{b.staff_name || <span className="badge gold plain">Toda a barbearia</span>}</td>
                    <td>{b.reason || <span className="muted">—</span>}</td>
                    <td className="hide-xs small muted">{b.created_by_name || '—'}</td>
                    <td>
                      <div className="actions">
                        {(isAdmin || b.staff_id === user.staffId) && (
                          <button className="icon-btn danger" aria-label="Remover bloqueio" onClick={() => setRemoving(b)}>
                            <Trash2 />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {creating && (
        <BlockForm
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            reload();
          }}
        />
      )}
      {removing && (
        <ConfirmDialog
          title="Remover bloqueio"
          confirmLabel="Remover"
          message={`Liberar ${dateBR(removing.date)} ${removing.all_day ? '(dia inteiro)' : `${removing.start_time}–${removing.end_time}`} para agendamentos?`}
          onClose={() => setRemoving(null)}
          onConfirm={async () => {
            await api.del(`/schedule/blocks/${removing.id}`);
            toast.success('Bloqueio removido.');
            notifyAppointmentsChanged();
            reload();
          }}
        />
      )}
    </div>
  );
}

export default function Schedule() {
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState(isAdmin ? 'hours' : 'blocks');
  return (
    <div>
      <PageHeader title="Horários e bloqueios" description="Essas configurações definem automaticamente os horários liberados para agendamento." />
      <div className="tabs">
        <button className={`tab ${tab === 'hours' ? 'active' : ''}`} onClick={() => setTab('hours')}>
          <Clock /> Funcionamento
        </button>
        <button className={`tab ${tab === 'blocks' ? 'active' : ''}`} onClick={() => setTab('blocks')}>
          <Ban /> Bloqueios
        </button>
        {isAdmin && (
          <button className={`tab ${tab === 'holidays' ? 'active' : ''}`} onClick={() => setTab('holidays')}>
            <CalendarOff /> Feriados
          </button>
        )}
      </div>
      {tab === 'hours' && <HoursEditor readOnly={!isAdmin} />}
      {tab === 'blocks' && <Blocks />}
      {tab === 'holidays' && isAdmin && <Holidays />}
    </div>
  );
}
