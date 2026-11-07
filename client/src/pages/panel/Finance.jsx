import { useEffect, useState } from 'react';
import { CircleDollarSign, Download, Hourglass, Pencil, Receipt, Search, Wallet } from 'lucide-react';
import { api, qs } from '../../lib/api.js';
import { useApi, useDebounced } from '../../lib/hooks.js';
import { useToast } from '../../context/ToastContext.jsx';
import PeriodFilter, { presetRange } from '../../components/PeriodFilter.jsx';
import { Empty, ErrorBox, Field, Kpi, Loading, Modal, PageHeader, Pagination, Switch } from '../../components/ui.jsx';
import { PAYMENT, PAYMENT_KEYS } from '../../lib/constants.js';
import { centsToInput, dateBR, money, parseMoney } from '../../lib/format.js';

function EditRecord({ record, onClose, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState({
    amount: centsToInput(record.amount_cents),
    paymentMethod: record.payment_method || 'pix',
    paid: record.paid,
    notes: record.notes || '',
  });
  const [error, setError] = useState(null);
  const save = async () => {
    const amountCents = parseMoney(f.amount);
    if (Number.isNaN(amountCents)) return setError(new Error('Valor inválido.'));
    try {
      await api.patch(`/finance/records/${record.id}`, { amountCents, paymentMethod: f.paymentMethod, paid: f.paid, notes: f.notes || null });
      toast.success('Registro financeiro atualizado.');
      onSaved();
    } catch (err) {
      setError(err);
    }
  };
  return (
    <Modal
      title="Registro financeiro"
      onClose={onClose}
      size="sm"
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary" onClick={save}>
            Salvar
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="small muted">
          {record.service_name} · {record.client_name} · {dateBR(record.date)} {record.start_time} · {record.staff_name}
        </div>
        <Field label="Valor cobrado (R$)">
          <input className="input" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
        </Field>
        <Field label="Forma de pagamento">
          <select className="select" value={f.paymentMethod} onChange={(e) => setF({ ...f, paymentMethod: e.target.value })}>
            {PAYMENT_KEYS.map((k) => (
              <option key={k} value={k}>
                {PAYMENT[k]}
              </option>
            ))}
          </select>
        </Field>
        <Switch checked={f.paid} onChange={(paid) => setF({ ...f, paid })} label={f.paid ? 'Pago' : 'A receber'} />
        <Field label="Observação">
          <input className="input" value={f.notes} maxLength={300} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Ex.: desconto aplicado" />
        </Field>
        <ErrorBox error={error} />
      </div>
    </Modal>
  );
}

export default function Finance() {
  const toast = useToast();
  const [period, setPeriod] = useState(presetRange('month'));
  const [staffId, setStaffId] = useState('');
  const [method, setMethod] = useState('');
  const [paid, setPaid] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null);
  const debounced = useDebounced(search, 300);
  const pageSize = 25;
  useEffect(() => setPage(1), [period, staffId, method, paid, debounced]);

  const { data: staff } = useApi('/staff');
  const filters = { from: period.from, to: period.to, staffId, method, paid, search: debounced };
  const { data, loading, error, reload } = useApi(`/finance/records${qs({ ...filters, page, pageSize })}`);

  const markPaid = async (r, value) => {
    if (value && !r.payment_method) return setEditing(r);
    try {
      await api.patch(`/finance/records/${r.id}`, { paid: value });
      reload();
    } catch (err) {
      toast.error(err);
    }
  };

  const totalReceived = data?.totals.received_cents || 0;

  return (
    <div className="stack lg">
      <PageHeader
        title="Financeiro"
        description="Somente atendimentos concluídos geram registros. O faturamento considera apenas os registros pagos."
        actions={
          <a className="btn" href={`/api/finance/export.csv${qs(filters)}`}>
            <Download /> Exportar CSV
          </a>
        }
      />

      <div className="card" style={{ padding: 14 }}>
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
            <div className="field">
              <label>Pagamento</label>
              <select className="select" value={method} onChange={(e) => setMethod(e.target.value)}>
                <option value="">Todas as formas</option>
                {PAYMENT_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {PAYMENT[k]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Situação</label>
              <select className="select" value={paid} onChange={(e) => setPaid(e.target.value)}>
                <option value="">Todos</option>
                <option value="1">Pagos</option>
                <option value="0">A receber</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <ErrorBox error={error} onRetry={reload} />
      {loading && !data ? (
        <Loading />
      ) : (
        data && (
          <>
            <div className="grid grid-4">
              <Kpi label="Faturamento (recebido)" value={money(data.totals.received_cents)} icon={Wallet} highlight sub={`${dateBR(data.from)} a ${dateBR(data.to)}`} />
              <Kpi label="A receber" value={money(data.totals.receivable_cents)} icon={Hourglass} sub="concluídos não pagos" />
              <Kpi label="Atendimentos" value={data.totals.count} icon={Receipt} sub={`${data.totals.paid_count || 0} pagos`} />
              <Kpi
                label="Ticket médio"
                value={money(data.totals.paid_count ? Math.round(data.totals.received_cents / data.totals.paid_count) : 0)}
                icon={CircleDollarSign}
              />
            </div>

            <div className="grid grid-2">
              <div className="card">
                <div className="card-title" style={{ marginBottom: 16 }}>
                  Recebido por forma de pagamento
                </div>
                {!data.byMethod.length ? (
                  <Empty title="Sem pagamentos no período" />
                ) : (
                  <div className="bar-list">
                    {data.byMethod.map((m) => (
                      <div key={m.method} className="bar-row">
                        <div className="bar-label">
                          <span>
                            {PAYMENT[m.method]} <span className="muted xs">({m.count})</span>
                          </span>
                          <span className="strong">
                            {money(m.total_cents)} <span className="muted xs">· {Math.round((m.total_cents / (totalReceived || 1)) * 100)}%</span>
                          </span>
                        </div>
                        <div className="bar-track">
                          <div className="bar-fill" style={{ width: `${(m.total_cents / (totalReceived || 1)) * 100}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="card">
                <div className="card-title" style={{ marginBottom: 16 }}>
                  Recebido por barbeiro
                </div>
                {!data.byStaff.length ? (
                  <Empty title="Sem pagamentos no período" />
                ) : (
                  <div className="bar-list">
                    {data.byStaff.map((s) => (
                      <div key={s.staff_id} className="bar-row">
                        <div className="bar-label">
                          <span>
                            {s.staff_name} <span className="muted xs">({s.count})</span>
                          </span>
                          <span className="strong">{money(s.total_cents)}</span>
                        </div>
                        <div className="bar-track">
                          <div className="bar-fill" style={{ width: `${(s.total_cents / (data.byStaff[0].total_cents || 1)) * 100}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="card flush">
              {!data.items.length ? (
                <Empty icon={Wallet} title="Nenhum registro financeiro no período" />
              ) : (
                <>
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Data</th>
                          <th>Cliente</th>
                          <th>Serviço</th>
                          <th>Barbeiro</th>
                          <th>Forma</th>
                          <th className="num">Valor</th>
                          <th>Pago</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {data.items.map((r) => (
                          <tr key={r.id}>
                            <td className="nowrap">
                              {dateBR(r.date)} <span className="muted xs">{r.start_time}</span>
                            </td>
                            <td>{r.client_name}</td>
                            <td>
                              {r.service_name}
                              {r.notes && <div className="xs muted">{r.notes}</div>}
                            </td>
                            <td>{r.staff_name}</td>
                            <td className="nowrap">{r.payment_method ? PAYMENT[r.payment_method] : <span className="muted">—</span>}</td>
                            <td className="num strong">{money(r.amount_cents)}</td>
                            <td>
                              <Switch checked={r.paid} onChange={(v) => markPaid(r, v)} label={r.paid ? 'Pago' : 'A receber'} />
                            </td>
                            <td>
                              <div className="actions">
                                <button className="icon-btn" title="Editar" onClick={() => setEditing(r)}>
                                  <Pencil />
                                </button>
                              </div>
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
          </>
        )
      )}
      {editing && (
        <EditRecord
          record={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
    </div>
  );
}
