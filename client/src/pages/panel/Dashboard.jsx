import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Ban,
  CalendarCheck,
  CalendarDays,
  CheckCircle2,
  Clock,
  CircleDollarSign,
  Hourglass,
  Plus,
  Receipt,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import { qs } from '../../lib/api.js';
import { useApi, useOnAppointmentsChanged } from '../../lib/hooks.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useAppointmentModal } from '../../components/AppointmentModal.jsx';
import { BarChart, LineChart, moneyFmt, moneyTick } from '../../components/Charts.jsx';
import PeriodFilter, { presetRange } from '../../components/PeriodFilter.jsx';
import { Empty, ErrorBox, Kpi, Loading, StatusBadge } from '../../components/ui.jsx';
import { dateBR, money, parseDate } from '../../lib/format.js';

function seriesLabel(key, granularity) {
  if (granularity === 'month') {
    const [y, m] = key.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
  }
  return parseDate(key).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function RankTable({ rows, valueKey, format, empty }) {
  if (!rows.length) return <Empty title={empty} />;
  const max = Math.max(...rows.map((r) => r[valueKey]), 1);
  return (
    <div className="bar-list">
      {rows.map((r) => (
        <div key={r.service_id ?? r.staff_id} className="bar-row">
          <div className="bar-label">
            <span className="ellipsis">{r.name}</span>
            <span className="strong nowrap">{format(r[valueKey])}</span>
          </div>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${(r[valueKey] / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const { user, isAdmin } = useAuth();
  const { openAppointment, openNew } = useAppointmentModal();
  const [period, setPeriod] = useState(presetRange('month'));
  const [staffId, setStaffId] = useState('');
  const { data: staff } = useApi(isAdmin ? '/staff' : null);
  const { data, loading, error, reload } = useApi(`/dashboard${qs({ from: period.from, to: period.to, staffId })}`);
  useOnAppointmentsChanged(reload);

  return (
    <div className="stack lg">
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div>
          <h2 style={{ fontSize: 19 }}>Olá, {user.name.split(' ')[0]}</h2>
          <p className="desc">{isAdmin ? 'Visão geral da barbearia' : 'Seus números e sua agenda de hoje'}</p>
        </div>
        <div className="row wrap">
          <Link to="/painel/agenda" className="btn">
            <CalendarDays /> Ver agenda
          </Link>
          <button className="btn btn-primary" onClick={() => openNew()}>
            <Plus /> Novo agendamento
          </button>
        </div>
      </div>

      {error && <ErrorBox error={error} onRetry={reload} />}
      {!data && loading ? (
        <Loading />
      ) : (
        data && (
          <>
            <div className="grid grid-4">
              <Kpi label="Faturamento hoje" value={money(data.fixed.revenueToday)} icon={CircleDollarSign} highlight />
              <Kpi label="Faturamento na semana" value={money(data.fixed.revenueWeek)} icon={TrendingUp} />
              <Kpi label="Faturamento no mês" value={money(data.fixed.revenueMonth)} icon={Wallet} />
              <Kpi label="Agendamentos hoje" value={data.fixed.appointmentsToday} icon={CalendarCheck} />
            </div>

            <div className="card" style={{ padding: 14 }}>
              <div className="row wrap between">
                <PeriodFilter value={period} onChange={setPeriod} />
                {isAdmin && (
                  <select className="select" style={{ width: 220, minHeight: 34 }} value={staffId} onChange={(e) => setStaffId(e.target.value)} aria-label="Filtrar por barbeiro">
                    <option value="">Todos os barbeiros</option>
                    {staff?.items.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="xs muted" style={{ marginTop: 10 }}>
                Período: {dateBR(data.from)} a {dateBR(data.to)} · faturamento considera somente atendimentos concluídos e pagos.
              </div>
            </div>

            <div className="grid grid-4">
              <Kpi label="Faturamento" value={money(data.period.revenue_cents)} sub={`${data.period.paid_count} atendimento(s) pagos`} icon={Wallet} highlight />
              <Kpi label="Ticket médio" value={money(data.period.ticket_avg_cents)} icon={Receipt} />
              <Kpi
                label="Agendamentos"
                value={data.period.appointments}
                sub={`${data.period.confirmed} confirmados`}
                icon={CalendarDays}
              />
              <Kpi label="Concluídos" value={data.period.completed} sub={data.period.receivable_cents ? `${money(data.period.receivable_cents)} a receber` : 'Nada pendente de pagamento'} icon={CheckCircle2} />
              <Kpi label="Pendentes" value={data.period.pending} sub="aguardando confirmação" icon={Hourglass} />
              <Kpi label="Cancelados" value={data.period.cancelled} sub={`${data.period.no_show} não compareceram`} icon={Ban} />
              <Kpi
                label={isAdmin && !staffId ? 'Clientes cadastrados' : 'Clientes atendidos'}
                value={data.period.clients_total}
                sub={data.period.new_clients != null ? `${data.period.new_clients} novos no período` : undefined}
                icon={Users}
              />
              <Kpi
                label="Taxa de conclusão"
                value={
                  data.period.appointments ? `${Math.round((data.period.completed / data.period.appointments) * 100)}%` : '—'
                }
                sub="concluídos ÷ agendamentos"
                icon={TrendingUp}
              />
            </div>

            <div className="grid grid-2">
              <div className="card">
                <div className="card-header">
                  <div className="card-title">
                    <Wallet /> Faturamento por {data.granularity === 'month' ? 'mês' : 'dia'}
                  </div>
                </div>
                <BarChart
                  labels={data.series.map((s) => seriesLabel(s.key, data.granularity))}
                  values={data.series.map((s) => s.revenue_cents)}
                  format={moneyFmt}
                  tickFormat={moneyTick}
                />
              </div>
              <div className="card">
                <div className="card-header">
                  <div className="card-title">
                    <CheckCircle2 /> Serviços realizados por {data.granularity === 'month' ? 'mês' : 'dia'}
                  </div>
                </div>
                <LineChart
                  labels={data.series.map((s) => seriesLabel(s.key, data.granularity))}
                  values={data.series.map((s) => s.services)}
                  format={(v) => `${v} serviço(s)`}
                />
              </div>
            </div>

            <div className="grid grid-3">
              <div className="card">
                <div className="card-title" style={{ marginBottom: 16 }}>
                  Serviços mais realizados
                </div>
                <RankTable rows={data.topServicesByCount} valueKey="count" format={(v) => `${v}×`} empty="Sem atendimentos no período" />
              </div>
              <div className="card">
                <div className="card-title" style={{ marginBottom: 16 }}>
                  Serviços que mais faturam
                </div>
                <RankTable rows={data.topServicesByRevenue} valueKey="total_cents" format={money} empty="Sem faturamento no período" />
              </div>
              <div className="card">
                <div className="card-title" style={{ marginBottom: 16 }}>
                  Agenda de hoje
                </div>
                {!data.upcomingToday.length ? (
                  <Empty icon={Clock} title="Nenhum atendimento pendente hoje" />
                ) : (
                  data.upcomingToday.map((a) => (
                    <div key={a.id} className="agenda-item" onClick={() => openAppointment(a.id)}>
                      <span className="agenda-time">{a.start_time}</span>
                      <div className="grow">
                        <div className="strong small ellipsis">{a.client_name}</div>
                        <div className="xs muted ellipsis">
                          {a.service_name} · {a.staff_name}
                        </div>
                      </div>
                      <StatusBadge status={a.status} />
                    </div>
                  ))
                )}
              </div>
            </div>

            {data.staffRanking.length > 0 && (
              <div className="grid grid-2">
                <div className="card">
                  <div className="card-title" style={{ marginBottom: 16 }}>
                    Desempenho dos barbeiros — atendimentos
                  </div>
                  <BarChart
                    horizontal
                    height={Math.max(160, data.staffRanking.length * 46)}
                    labels={data.staffRanking.map((s) => s.name)}
                    values={data.staffRanking.map((s) => s.services)}
                    format={(v) => `${v} atendimento(s)`}
                  />
                </div>
                <div className="card flush">
                  <div className="card-title" style={{ padding: '20px 20px 12px' }}>
                    Desempenho individual
                  </div>
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Barbeiro</th>
                          <th className="num">Atendimentos</th>
                          <th className="num">Faturamento</th>
                          <th className="num">Ticket médio</th>
                          <th className="num">Faltas</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.staffRanking.map((s) => (
                          <tr key={s.staff_id}>
                            <td>
                              <span className="row" style={{ gap: 8 }}>
                                <span className="color-dot" style={{ background: s.color }} />
                                {s.name}
                              </span>
                            </td>
                            <td className="num">{s.services}</td>
                            <td className="num">{money(s.revenue_cents)}</td>
                            <td className="num">{s.services ? money(Math.round(s.revenue_cents / s.services)) : '—'}</td>
                            <td className="num">{s.no_shows}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </>
        )
      )}
    </div>
  );
}
