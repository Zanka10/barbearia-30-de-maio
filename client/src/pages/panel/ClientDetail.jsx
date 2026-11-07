import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarPlus, ClipboardList, History, MessageCircle, Pencil, ShieldOff, Trash2 } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useApi, useOnAppointmentsChanged } from '../../lib/hooks.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useAppointmentModal } from '../../components/AppointmentModal.jsx';
import { ConfirmDialog, Empty, ErrorBox, Kpi, Loading, StatusBadge } from '../../components/ui.jsx';
import { ClientFormModal } from './Clients.jsx';
import { PAYMENT } from '../../lib/constants.js';
import { dateBR, dateTimeBR, minToHHMM, money, phoneBR, whatsappLink } from '../../lib/format.js';

export default function ClientDetail() {
  const { id } = useParams();
  const { isAdmin } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const { openAppointment, openNew } = useAppointmentModal();
  const { data, loading, error, reload } = useApi(`/clients/${id}`);
  useOnAppointmentsChanged(reload);
  const [tab, setTab] = useState('appointments');
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(null);

  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const { client, stats, appointments, history } = data;
  const anonymized = !!client.anonymized_at;

  return (
    <div className="stack lg">
      <div>
        <Link to="/painel/clientes" className="btn btn-ghost btn-sm">
          <ArrowLeft /> Clientes
        </Link>
      </div>
      <div className="card">
        <div className="row between wrap">
          <div>
            <h2 style={{ fontSize: 20 }}>{client.name}</h2>
            <div className="row wrap muted small" style={{ marginTop: 6, gap: 14 }}>
              <span>{phoneBR(client.phone)}</span>
              {client.email && <span>{client.email}</span>}
              <span>Cliente desde {dateTimeBR(client.created_at).slice(0, 10)}</span>
              {client.has_account && <span className="badge gold plain">Possui conta</span>}
              {anonymized && <span className="badge muted plain">Anonimizado (LGPD)</span>}
            </div>
            {client.notes && <p className="small text-2" style={{ marginTop: 10 }}>📝 {client.notes}</p>}
          </div>
          {!anonymized && (
            <div className="row wrap">
              <a className="btn btn-sm" href={whatsappLink(client.phone)} target="_blank" rel="noreferrer">
                <MessageCircle /> WhatsApp
              </a>
              <button className="btn btn-sm btn-primary" onClick={() => openNew({ client })}>
                <CalendarPlus /> Agendar
              </button>
              {isAdmin && (
                <>
                  <button className="btn btn-sm" onClick={() => setEditing(true)}>
                    <Pencil /> Editar
                  </button>
                  <button className="btn btn-sm btn-ghost" onClick={() => setConfirm('anonymize')} title="Remover dados pessoais (LGPD)">
                    <ShieldOff /> Anonimizar
                  </button>
                  {!appointments.length && (
                    <button className="icon-btn danger" onClick={() => setConfirm('delete')} aria-label="Excluir cliente">
                      <Trash2 />
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-4">
        <Kpi label="Agendamentos" value={stats.appointments_count} sub={`${stats.upcoming_count} futuro(s)`} />
        <Kpi label="Serviços realizados" value={stats.services_count} sub={stats.last_visit ? `Última visita: ${dateBR(stats.last_visit)}` : 'Nenhuma visita'} />
        <Kpi label="Total gasto" value={money(stats.total_spent_cents)} highlight />
        <Kpi label="Faltas" value={stats.no_show_count} sub="não compareceu" />
      </div>

      <div>
        <div className="tabs">
          <button className={`tab ${tab === 'appointments' ? 'active' : ''}`} onClick={() => setTab('appointments')}>
            <ClipboardList /> Agendamentos ({appointments.length})
          </button>
          <button className={`tab ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>
            <History /> Serviços realizados ({history.length})
          </button>
        </div>
        <div className="card flush">
          {tab === 'appointments' &&
            (!appointments.length ? (
              <Empty title="Nenhum agendamento" />
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Horário</th>
                      <th>Serviço</th>
                      <th>Barbeiro</th>
                      <th className="num">Valor</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {appointments.map((a) => (
                      <tr key={a.id} className="clickable" onClick={() => openAppointment(a.id)}>
                        <td className="nowrap">{dateBR(a.date)}</td>
                        <td className="nowrap">{a.start_time}</td>
                        <td>{a.service_name}</td>
                        <td>{a.staff_name}</td>
                        <td className="num">{money(a.finance_amount_cents ?? a.price_cents)}</td>
                        <td>
                          <StatusBadge status={a.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          {tab === 'history' &&
            (!history.length ? (
              <Empty title="Nenhum serviço realizado" />
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Serviço</th>
                      <th>Barbeiro</th>
                      <th>Pagamento</th>
                      <th className="num">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h) => (
                      <tr key={h.id} className="clickable" onClick={() => openAppointment(h.appointment_id)}>
                        <td className="nowrap">
                          {dateBR(h.date)} {minToHHMM(h.start_min)}
                        </td>
                        <td>
                          {h.service_name}
                          <div className="xs muted">{h.category_name}</div>
                        </td>
                        <td>{h.staff_name}</td>
                        <td>{h.paid ? PAYMENT[h.payment_method] : <span className="badge warning plain">A receber</span>}</td>
                        <td className="num">{money(h.price_cents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
        </div>
      </div>

      {editing && (
        <ClientFormModal
          client={client}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            reload();
          }}
        />
      )}
      {confirm === 'anonymize' && (
        <ConfirmDialog
          title="Anonimizar cliente (LGPD)"
          danger
          confirmLabel="Anonimizar"
          message="Nome, celular, e-mail e observações serão removidos definitivamente. Agendamentos futuros serão cancelados. O histórico financeiro é mantido de forma anônima."
          onClose={() => setConfirm(null)}
          onConfirm={async () => {
            await api.post(`/clients/${client.id}/anonymize`);
            toast.success('Dados pessoais removidos.');
            reload();
          }}
        />
      )}
      {confirm === 'delete' && (
        <ConfirmDialog
          title="Excluir cliente"
          danger
          confirmLabel="Excluir"
          message={`Excluir definitivamente o cadastro de ${client.name}?`}
          onClose={() => setConfirm(null)}
          onConfirm={async () => {
            await api.del(`/clients/${client.id}`);
            toast.success('Cliente excluído.');
            navigate('/painel/clientes');
          }}
        />
      )}
    </div>
  );
}
