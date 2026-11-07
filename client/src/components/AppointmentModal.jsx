// Modal de detalhes do agendamento + ações (status, conclusão com pagamento, cancelamento, remarcação).
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Ban, CalendarClock, Check, CheckCheck, MessageCircle, Play, RotateCcw, UserX } from 'lucide-react';
import { api } from '../lib/api.js';
import { centsToInput, dateLong, dateTimeBR, money, parseMoney, phoneBR, whatsappLink } from '../lib/format.js';
import { PAYMENT, PAYMENT_KEYS } from '../lib/constants.js';
import { notifyAppointmentsChanged } from '../lib/hooks.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { ErrorBox, Field, Loading, Modal, StatusBadge, Switch } from './ui.jsx';
import AppointmentForm from './AppointmentForm.jsx';

const Ctx = createContext(null);
export const useAppointmentModal = () => useContext(Ctx);

export function AppointmentModalProvider({ children }) {
  const [viewId, setViewId] = useState(null);
  const [form, setForm] = useState(null); // { prefill } ou { appointment }
  const openAppointment = useCallback((id) => setViewId(id), []);
  const openNew = useCallback((prefill = {}) => setForm({ prefill }), []);
  const value = useMemo(() => ({ openAppointment, openNew }), [openAppointment, openNew]);
  return (
    <Ctx.Provider value={value}>
      {children}
      {viewId && (
        <AppointmentDetails
          id={viewId}
          onClose={() => setViewId(null)}
          onEdit={(appointment) => {
            setViewId(null);
            setForm({ appointment });
          }}
        />
      )}
      {form && (
        <AppointmentForm
          appointment={form.appointment}
          prefill={form.prefill}
          onClose={() => setForm(null)}
          onSaved={(a) => {
            setForm(null);
            notifyAppointmentsChanged();
            setViewId(a.id);
          }}
        />
      )}
    </Ctx.Provider>
  );
}

function AppointmentDetails({ id, onClose, onEdit }) {
  const { user, isAdmin } = useAuth();
  const toast = useToast();
  const [appt, setAppt] = useState(null);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState('view'); // view | complete | cancel
  const [busy, setBusy] = useState(false);
  const [payment, setPayment] = useState({ amount: '', method: 'pix', paid: true });
  const [reason, setReason] = useState('');

  useEffect(() => {
    api
      .get(`/appointments/${id}`)
      .then((d) => {
        setAppt(d.appointment);
        setPayment((p) => ({ ...p, amount: centsToInput(d.appointment.price_cents) }));
      })
      .catch(setError);
  }, [id]);

  const setStatus = async (status, extra = {}) => {
    setBusy(true);
    setError(null);
    try {
      const { appointment } = await api.post(`/appointments/${id}/status`, { status, ...extra });
      setAppt(appointment);
      setMode('view');
      notifyAppointmentsChanged();
      toast.success(`Status alterado para "${appointment.status_label}".`);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const complete = () => {
    const amountCents = parseMoney(payment.amount);
    if (Number.isNaN(amountCents) || amountCents < 0) return setError(new Error('Informe um valor válido.'));
    setStatus('completed', { amountCents, paymentMethod: payment.method || null, paid: payment.paid });
  };

  if (!appt) {
    return (
      <Modal title="Agendamento" onClose={onClose}>
        {error ? <ErrorBox error={error} /> : <Loading />}
      </Modal>
    );
  }

  const s = appt.status;
  const active = ['pending', 'confirmed', 'in_service'].includes(s);
  const canReactivate = isAdmin || appt.staff_id === user.staffId;

  const footer =
    mode === 'complete' ? (
      <>
        <button className="btn btn-ghost" onClick={() => setMode('view')} disabled={busy}>
          Voltar
        </button>
        <button className="btn btn-primary" onClick={complete} disabled={busy}>
          <CheckCheck /> Concluir atendimento
        </button>
      </>
    ) : mode === 'cancel' ? (
      <>
        <button className="btn btn-ghost" onClick={() => setMode('view')} disabled={busy}>
          Voltar
        </button>
        <button className="btn btn-danger" onClick={() => setStatus('cancelled', { reason })} disabled={busy}>
          <Ban /> Confirmar cancelamento
        </button>
      </>
    ) : (
      <>
        {active && s !== 'in_service' && (
          <button className="btn btn-ghost" onClick={() => onEdit(appt)} disabled={busy}>
            <CalendarClock /> Remarcar / editar
          </button>
        )}
        {active && (
          <button className="btn btn-danger" onClick={() => setMode('cancel')} disabled={busy}>
            <Ban /> Cancelar
          </button>
        )}
        {['pending', 'confirmed'].includes(s) && (
          <button className="btn btn-ghost" onClick={() => setStatus('no_show')} disabled={busy}>
            <UserX /> Não compareceu
          </button>
        )}
        {s === 'pending' && (
          <button className="btn btn-outline" onClick={() => setStatus('confirmed')} disabled={busy}>
            <Check /> Confirmar
          </button>
        )}
        {['pending', 'confirmed'].includes(s) && (
          <button className="btn btn-outline" onClick={() => setStatus('in_service')} disabled={busy}>
            <Play /> Iniciar atendimento
          </button>
        )}
        {s === 'in_service' && (
          <button className="btn btn-ghost" onClick={() => setStatus('confirmed')} disabled={busy}>
            <RotateCcw /> Voltar para confirmado
          </button>
        )}
        {active && (
          <button className="btn btn-primary" onClick={() => setMode('complete')} disabled={busy}>
            <CheckCheck /> Concluir
          </button>
        )}
        {['cancelled', 'no_show'].includes(s) && canReactivate && (
          <button className="btn btn-outline" onClick={() => setStatus('confirmed')} disabled={busy}>
            <RotateCcw /> Reativar agendamento
          </button>
        )}
      </>
    );

  return (
    <Modal title={`Agendamento #${appt.id}`} onClose={onClose} footer={footer} size="lg">
      <div className="stack lg">
        <div className="row between wrap">
          <div>
            <div className="display" style={{ fontSize: 17 }}>
              {appt.service_name}
            </div>
            <div className="muted cap">
              {dateLong(appt.date)} · {appt.start_time}–{appt.end_time}
            </div>
          </div>
          <StatusBadge status={appt.status} />
        </div>

        <dl className="details">
          <dt>Cliente</dt>
          <dd>
            {isAdmin || user.role === 'barber' ? (
              <Link to={`/painel/clientes/${appt.client_id}`} onClick={onClose}>
                {appt.client_name}
              </Link>
            ) : (
              appt.client_name
            )}
          </dd>
          <dt>Celular</dt>
          <dd className="row wrap" style={{ gap: 8 }}>
            <a href={`tel:${appt.client_phone}`}>{phoneBR(appt.client_phone)}</a>
            {!String(appt.client_phone).startsWith('anon') && (
              <a className="btn btn-sm btn-ghost" href={whatsappLink(appt.client_phone)} target="_blank" rel="noreferrer">
                <MessageCircle /> WhatsApp
              </a>
            )}
          </dd>
          {appt.client_email && (
            <>
              <dt>E-mail</dt>
              <dd>{appt.client_email}</dd>
            </>
          )}
          <dt>Barbeiro</dt>
          <dd className="row" style={{ gap: 8 }}>
            <span className="color-dot" style={{ background: appt.staff_color }} />
            {appt.staff_name}
          </dd>
          <dt>Categoria</dt>
          <dd>{appt.category_name}</dd>
          <dt>Valor</dt>
          <dd className="strong gold">{money(appt.finance_amount_cents ?? appt.price_cents)}</dd>
          {appt.status === 'completed' && (
            <>
              <dt>Pagamento</dt>
              <dd>
                {appt.paid ? (
                  <span className="badge success">Pago · {PAYMENT[appt.payment_method]}</span>
                ) : (
                  <span className="badge warning">Pendente{appt.payment_method ? ` · ${PAYMENT[appt.payment_method]}` : ''}</span>
                )}
                {isAdmin && (
                  <Link to="/painel/financeiro" className="small" style={{ marginLeft: 10 }} onClick={onClose}>
                    ver no financeiro
                  </Link>
                )}
              </dd>
            </>
          )}
          {appt.notes && (
            <>
              <dt>Observações</dt>
              <dd>{appt.notes}</dd>
            </>
          )}
          {appt.cancel_reason && (
            <>
              <dt>Motivo</dt>
              <dd>{appt.cancel_reason}</dd>
            </>
          )}
          <dt>Origem</dt>
          <dd className="muted small">
            {appt.source === 'online' ? 'Agendamento online' : 'Painel'} · criado em {dateTimeBR(appt.created_at)}
          </dd>
        </dl>

        {mode === 'complete' && (
          <div className="card" style={{ background: 'var(--bg-elev)' }}>
            <div className="card-title" style={{ marginBottom: 14 }}>
              <CheckCheck /> Registrar atendimento concluído
            </div>
            <div className="form-grid">
              <Field label="Valor cobrado (R$)">
                <input className="input" inputMode="decimal" value={payment.amount} onChange={(e) => setPayment({ ...payment, amount: e.target.value })} />
              </Field>
              <Field label="Forma de pagamento">
                <select className="select" value={payment.method} onChange={(e) => setPayment({ ...payment, method: e.target.value })}>
                  {PAYMENT_KEYS.map((k) => (
                    <option key={k} value={k}>
                      {PAYMENT[k]}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="full">
                <Switch checked={payment.paid} onChange={(paid) => setPayment({ ...payment, paid })} label="Pagamento recebido" />
                <p className="xs muted mt" style={{ marginTop: 8 }}>
                  Somente atendimentos pagos entram no faturamento. Você pode marcar o pagamento depois, no Financeiro.
                </p>
              </div>
            </div>
          </div>
        )}
        {mode === 'cancel' && (
          <Field label="Motivo do cancelamento (opcional)">
            <input className="input" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: cliente pediu para remarcar" />
          </Field>
        )}
        <ErrorBox error={error} />
      </div>
    </Modal>
  );
}
