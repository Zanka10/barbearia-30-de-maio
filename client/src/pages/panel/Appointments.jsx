// Lista de agendamentos (modo "list") e histórico de atendimentos (modo "history").
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, Plus, Search } from 'lucide-react';
import { qs } from '../../lib/api.js';
import { useApi, useDebounced, useOnAppointmentsChanged } from '../../lib/hooks.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useAppointmentModal } from '../../components/AppointmentModal.jsx';
import PeriodFilter, { presetRange } from '../../components/PeriodFilter.jsx';
import { Empty, ErrorBox, Kpi, Loading, PageHeader, Pagination, StatusBadge } from '../../components/ui.jsx';
import { PAYMENT, STATUS, STATUS_KEYS } from '../../lib/constants.js';
import { dateBR, money, phoneBR } from '../../lib/format.js';

export default function Appointments({ mode = 'list' }) {
  const history = mode === 'history';
  const { isAdmin } = useAuth();
  const { openAppointment, openNew } = useAppointmentModal();
  const [period, setPeriod] = useState(history ? presetRange('last30') : presetRange('week'));
  const [status, setStatus] = useState(history ? ['completed'] : []);
  const [staffId, setStaffId] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const debounced = useDebounced(search, 300);
  const pageSize = 25;

  useEffect(() => setPage(1), [period, status, staffId, debounced]);
  // Ao alternar entre Agendamentos e Histórico, redefine os filtros padrão
  useEffect(() => {
    setPeriod(history ? presetRange('last30') : presetRange('week'));
    setStatus(history ? ['completed'] : []);
  }, [history]);

  const { data: staff } = useApi(isAdmin ? '/staff' : null);
  const url = `/appointments${qs({
    from: period.from,
    to: period.to,
    status,
    staffId,
    search: debounced,
    page,
    pageSize,
    order: history ? 'desc' : 'asc',
  })}`;
  const { data, loading, error, reload } = useApi(url);
  useOnAppointmentsChanged(reload);

  const toggleStatus = (s) => setStatus((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));
  const statusOptions = history ? ['completed', 'cancelled', 'no_show'] : STATUS_KEYS;

  return (
    <div>
      <PageHeader
        title={history ? 'Histórico de atendimentos' : 'Agendamentos'}
        description={
          history
            ? 'Todos os atendimentos realizados, com valores cobrados e status.'
            : 'Consulte, filtre e gerencie os agendamentos.'
        }
        actions={
          <button className="btn btn-primary" onClick={() => openNew()}>
            <Plus /> Novo agendamento
          </button>
        }
      />

      <div className="card mb" style={{ padding: 14 }}>
        <div className="stack">
          <PeriodFilter value={period} onChange={setPeriod} />
          <div className="filters" style={{ marginBottom: 0 }}>
            <div className="field search">
              <label>Buscar</label>
              <div className="input-icon">
                <Search />
                <input className="input" placeholder="Cliente, celular ou serviço" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
            </div>
            {isAdmin && (
              <div className="field">
                <label>Barbeiro</label>
                <select className="select" value={staffId} onChange={(e) => setStaffId(e.target.value)}>
                  <option value="">Todos</option>
                  {staff?.items.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div className="chips">
            {statusOptions.map((s) => (
              <button key={s} className={`chip ${status.includes(s) ? 'active' : ''}`} onClick={() => toggleStatus(s)}>
                {STATUS[s].label}
              </button>
            ))}
            {status.length > 0 && (
              <button className="chip" onClick={() => setStatus([])}>
                Limpar status
              </button>
            )}
          </div>
        </div>
      </div>

      {data && (
        <div className="grid grid-3 mb">
          <Kpi label="Registros" value={data.total} />
          <Kpi label="Valor concluído" value={money(data.summary.completed_value_cents)} sub="atendimentos concluídos no filtro" />
          <Kpi label="Valor recebido" value={money(data.summary.paid_value_cents)} sub="somente pagos" highlight />
        </div>
      )}

      <ErrorBox error={error} onRetry={reload} />
      <div className="card flush">
        {loading && !data ? (
          <Loading />
        ) : !data?.items.length ? (
          <Empty icon={ClipboardList} title="Nenhum agendamento encontrado">
            Ajuste os filtros ou o período.
          </Empty>
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Horário</th>
                    <th>Cliente</th>
                    <th className="hide-xs">Telefone</th>
                    <th>Serviço</th>
                    <th>Barbeiro</th>
                    <th className="num">Valor</th>
                    {history && <th>Pagamento</th>}
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((a) => (
                    <tr key={a.id} className="clickable" onClick={() => openAppointment(a.id)}>
                      <td className="nowrap">{dateBR(a.date)}</td>
                      <td className="nowrap">
                        {a.start_time}–{a.end_time}
                      </td>
                      <td>
                        <Link to={`/painel/clientes/${a.client_id}`} onClick={(e) => e.stopPropagation()}>
                          {a.client_name}
                        </Link>
                      </td>
                      <td className="nowrap hide-xs">{phoneBR(a.client_phone)}</td>
                      <td>{a.service_name}</td>
                      <td>
                        <span className="row nowrap" style={{ gap: 6 }}>
                          <span className="color-dot" style={{ background: a.staff_color }} />
                          {a.staff_name}
                        </span>
                      </td>
                      <td className="num">{money(a.finance_amount_cents ?? a.price_cents)}</td>
                      {history && (
                        <td className="nowrap">
                          {a.status !== 'completed' ? (
                            <span className="muted">—</span>
                          ) : a.paid ? (
                            <span className="badge success plain">{PAYMENT[a.payment_method]}</span>
                          ) : (
                            <span className="badge warning plain">A receber</span>
                          )}
                        </td>
                      )}
                      <td>
                        <StatusBadge status={a.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={pageSize} total={data.total} onChange={setPage} />
          </>
        )}
      </div>
    </div>
  );
}
