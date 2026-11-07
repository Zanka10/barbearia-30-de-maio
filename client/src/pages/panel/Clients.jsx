import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, UserPlus, Users } from 'lucide-react';
import { api, qs } from '../../lib/api.js';
import { useApi, useDebounced } from '../../lib/hooks.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { Empty, ErrorBox, Field, Loading, Modal, PageHeader, Pagination, PhoneInput } from '../../components/ui.jsx';
import { dateBR, dateTimeBR, maskPhone, money, onlyDigits, phoneBR } from '../../lib/format.js';

export function ClientFormModal({ client, onClose, onSaved }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [f, setF] = useState({
    name: client?.name || '',
    phone: client ? maskPhone(client.phone) : '',
    email: client?.email || '',
    notes: client?.notes || '',
  });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const body = { name: f.name, phone: onlyDigits(f.phone), email: f.email || null, notes: f.notes || null };
      const r = client ? await api.put(`/clients/${client.id}`, body) : await api.post('/clients', body);
      toast.success(client ? 'Cliente atualizado.' : 'Cliente cadastrado.');
      onSaved(r.client);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={client ? 'Editar cliente' : 'Novo cliente'}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary" onClick={save} disabled={busy}>
            {busy ? 'Salvando...' : 'Salvar'}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Nome completo *" className="full">
          <input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <Field label="Celular *" hint="Identificador único do cliente">
          <PhoneInput value={f.phone} onChange={(phone) => setF({ ...f, phone })} />
        </Field>
        <Field label="E-mail">
          <input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </Field>
        <Field label="Observações internas" className="full">
          <textarea className="textarea" value={f.notes} maxLength={1000} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Preferências, alergias, etc." />
        </Field>
      </div>
      {error && (
        <div className="mt">
          <ErrorBox error={error} />
          {error.code === 'DUPLICATE_PHONE' && error.details?.clientId && (
            <button className="btn btn-sm btn-outline mt" onClick={() => navigate(`/painel/clientes/${error.details.clientId}`)}>
              Abrir cadastro existente
            </button>
          )}
        </div>
      )}
    </Modal>
  );
}

export default function Clients() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('name');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const debounced = useDebounced(search, 300);
  const pageSize = 25;
  useEffect(() => setPage(1), [debounced, sort]);
  const { data, loading, error, reload } = useApi(`/clients${qs({ search: debounced, sort, page, pageSize })}`);

  return (
    <div>
      <PageHeader
        title="Clientes"
        description={isAdmin ? 'Cadastro, histórico e consumo de cada cliente.' : 'Clientes que você já atendeu ou tem agendados.'}
        actions={
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            <UserPlus /> Novo cliente
          </button>
        }
      />
      <div className="filters">
        <div className="field search">
          <div className="input-icon">
            <Search />
            <input className="input" placeholder="Buscar por nome, celular ou e-mail" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <select className="select" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Ordenar">
            <option value="name">Ordenar por nome</option>
            <option value="recent">Cadastro mais recente</option>
            <option value="last_visit">Última visita</option>
            <option value="spent">Maior consumo</option>
          </select>
        </div>
      </div>
      <ErrorBox error={error} onRetry={reload} />
      <div className="card flush">
        {loading && !data ? (
          <Loading />
        ) : !data?.items.length ? (
          <Empty icon={Users} title="Nenhum cliente encontrado" />
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Celular</th>
                    <th className="hide-xs">E-mail</th>
                    <th>Cadastro</th>
                    <th className="num">Atendimentos</th>
                    <th>Última visita</th>
                    <th className="num">Total gasto</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((c) => (
                    <tr key={c.id} className="clickable" onClick={() => navigate(`/painel/clientes/${c.id}`)}>
                      <td>
                        <span className="strong">{c.name}</span>
                        {c.has_account ? <span className="badge gold plain" style={{ marginLeft: 8 }}>conta</span> : null}
                      </td>
                      <td className="nowrap">{phoneBR(c.phone)}</td>
                      <td className="hide-xs">{c.email || <span className="muted">—</span>}</td>
                      <td className="nowrap">{dateTimeBR(c.created_at).slice(0, 10)}</td>
                      <td className="num">{c.services_count}</td>
                      <td className="nowrap">{c.last_visit ? dateBR(c.last_visit) : <span className="muted">—</span>}</td>
                      <td className="num">{money(c.total_spent_cents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={pageSize} total={data.total} onChange={setPage} />
          </>
        )}
      </div>
      {creating && (
        <ClientFormModal
          onClose={() => setCreating(false)}
          onSaved={(c) => {
            setCreating(false);
            navigate(`/painel/clientes/${c.id}`);
          }}
        />
      )}
    </div>
  );
}
