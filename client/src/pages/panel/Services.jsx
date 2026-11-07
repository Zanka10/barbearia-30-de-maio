import { useState } from 'react';
import { FolderOpen, Pencil, Plus, Scissors, Trash2 } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useApi } from '../../lib/hooks.js';
import { useToast } from '../../context/ToastContext.jsx';
import { ConfirmDialog, Empty, ErrorBox, Field, Loading, Modal, PageHeader, Switch } from '../../components/ui.jsx';
import { centsToInput, duration, money, parseMoney } from '../../lib/format.js';

function CategoryForm({ category, onClose, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState({
    name: category?.name || '',
    description: category?.description || '',
    sort_order: category?.sort_order ?? 0,
    active: category ? !!category.active : true,
  });
  const [error, setError] = useState(null);
  const save = async () => {
    setError(null);
    try {
      const body = { ...f, sort_order: Number(f.sort_order) || 0 };
      category ? await api.put(`/catalog/categories/${category.id}`, body) : await api.post('/catalog/categories', body);
      toast.success('Categoria salva.');
      onSaved();
    } catch (err) {
      setError(err);
    }
  };
  return (
    <Modal
      title={category ? 'Editar categoria' : 'Nova categoria'}
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
        <Field label="Nome *">
          <input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Ex.: Cortes de cabelo" />
        </Field>
        <Field label="Descrição">
          <input className="input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        </Field>
        <Field label="Ordem de exibição">
          <input className="input" type="number" min={0} value={f.sort_order} onChange={(e) => setF({ ...f, sort_order: e.target.value })} />
        </Field>
        <Switch checked={f.active} onChange={(active) => setF({ ...f, active })} label={f.active ? 'Ativa' : 'Inativa'} />
        <ErrorBox error={error} />
      </div>
    </Modal>
  );
}

function ServiceForm({ service, categories, staff, onClose, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState({
    category_id: service?.category_id ?? categories[0]?.id ?? '',
    name: service?.name || '',
    description: service?.description || '',
    price: service ? centsToInput(service.price_cents) : '',
    duration_min: service?.duration_min ?? 30,
    sort_order: service?.sort_order ?? 0,
    active: service ? !!service.active : true,
    staff_ids: service?.staff_ids ?? staff.filter((s) => s.active).map((s) => s.id),
  });
  const [error, setError] = useState(null);
  const save = async () => {
    setError(null);
    const price_cents = parseMoney(f.price);
    if (Number.isNaN(price_cents)) return setError(new Error('Informe um preço válido.'));
    try {
      const body = {
        category_id: Number(f.category_id),
        name: f.name,
        description: f.description,
        price_cents,
        duration_min: Number(f.duration_min),
        sort_order: Number(f.sort_order) || 0,
        active: f.active,
        staff_ids: f.staff_ids,
      };
      service ? await api.put(`/catalog/services/${service.id}`, body) : await api.post('/catalog/services', body);
      toast.success('Serviço salvo.');
      onSaved();
    } catch (err) {
      setError(err);
    }
  };
  const toggleStaff = (id) => setF((c) => ({ ...c, staff_ids: c.staff_ids.includes(id) ? c.staff_ids.filter((x) => x !== id) : [...c.staff_ids, id] }));

  return (
    <Modal
      title={service ? 'Editar serviço' : 'Novo serviço'}
      onClose={onClose}
      size="lg"
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
      <div className="stack lg">
        <div className="form-grid">
          <Field label="Nome *">
            <input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </Field>
          <Field label="Categoria *">
            <select className="select" value={f.category_id} onChange={(e) => setF({ ...f, category_id: e.target.value })}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {!c.active ? ' (inativa)' : ''}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Descrição" className="full">
            <input className="input" value={f.description} maxLength={500} onChange={(e) => setF({ ...f, description: e.target.value })} />
          </Field>
          <Field label="Preço (R$) *">
            <input className="input" inputMode="decimal" placeholder="45,00" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} />
          </Field>
          <Field label="Duração (minutos) *" hint="Usada para calcular os horários disponíveis.">
            <input className="input" type="number" min={5} max={480} step={5} value={f.duration_min} onChange={(e) => setF({ ...f, duration_min: e.target.value })} />
          </Field>
          <Field label="Ordem de exibição">
            <input className="input" type="number" min={0} value={f.sort_order} onChange={(e) => setF({ ...f, sort_order: e.target.value })} />
          </Field>
          <Field label="Status">
            <Switch checked={f.active} onChange={(active) => setF({ ...f, active })} label={f.active ? 'Habilitado para agendamento' : 'Desabilitado'} />
          </Field>
        </div>
        <Field label="Barbeiros que realizam este serviço">
          {!staff.length ? (
            <div className="small muted">Nenhum funcionário cadastrado.</div>
          ) : (
            <div className="check-list">
              {staff.map((s) => (
                <label key={s.id} className="check-card">
                  <input type="checkbox" checked={f.staff_ids.includes(s.id)} onChange={() => toggleStaff(s.id)} />
                  <span className="grow">{s.name}</span>
                  {!s.active && <span className="badge muted plain">inativo</span>}
                </label>
              ))}
            </div>
          )}
        </Field>
        {f.active && !f.staff_ids.length && <div className="alert warning">Sem barbeiros vinculados, o serviço não aparece no agendamento online.</div>}
        <ErrorBox error={error} />
      </div>
    </Modal>
  );
}

export default function Services() {
  const toast = useToast();
  const cats = useApi('/catalog/categories');
  const svcs = useApi('/catalog/services');
  const { data: staffData } = useApi('/staff');
  const [catForm, setCatForm] = useState(null);
  const [svcForm, setSvcForm] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [filterCat, setFilterCat] = useState('');

  const reloadAll = () => {
    cats.reload();
    svcs.reload();
  };
  const patch = async (url, active, label) => {
    try {
      await api.patch(url, { active });
      toast.success(`${label} ${active ? 'ativado(a)' : 'desativado(a)'}.`);
      reloadAll();
    } catch (err) {
      toast.error(err);
    }
  };

  if ((cats.loading && !cats.data) || (svcs.loading && !svcs.data)) return <Loading />;
  const categories = cats.data?.items || [];
  const services = (svcs.data?.items || []).filter((s) => !filterCat || s.category_id === Number(filterCat));
  const staff = staffData?.items || [];

  return (
    <div className="stack lg">
      <ErrorBox error={cats.error || svcs.error} onRetry={reloadAll} />
      <div>
        <PageHeader
          title="Categorias"
          description="Agrupam os serviços na página de agendamento."
          actions={
            <button className="btn" onClick={() => setCatForm('new')}>
              <Plus /> Nova categoria
            </button>
          }
        />
        <div className="card flush">
          {!categories.length ? (
            <Empty icon={FolderOpen} title="Nenhuma categoria" />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Categoria</th>
                    <th className="hide-xs">Descrição</th>
                    <th className="num">Serviços</th>
                    <th className="num">Ordem</th>
                    <th>Ativa</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {categories.map((c) => (
                    <tr key={c.id} className={c.active ? '' : 'inactive-row'}>
                      <td className="strong">{c.name}</td>
                      <td className="hide-xs muted">{c.description || '—'}</td>
                      <td className="num">
                        {c.active_services_count}/{c.services_count}
                      </td>
                      <td className="num">{c.sort_order}</td>
                      <td>
                        <Switch checked={!!c.active} onChange={(v) => patch(`/catalog/categories/${c.id}/status`, v, 'Categoria')} />
                      </td>
                      <td>
                        <div className="actions">
                          <button className="icon-btn" title="Editar" onClick={() => setCatForm(c)}>
                            <Pencil />
                          </button>
                          <button className="icon-btn danger" title="Excluir" onClick={() => setConfirm({ type: 'category', item: c })}>
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

      <div>
        <PageHeader
          title="Serviços"
          description="Serviços desabilitados não aparecem na página de agendamento."
          actions={
            <>
              <select className="select" style={{ width: 200 }} value={filterCat} onChange={(e) => setFilterCat(e.target.value)} aria-label="Filtrar categoria">
                <option value="">Todas as categorias</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <button className="btn btn-primary" disabled={!categories.length} onClick={() => setSvcForm('new')}>
                <Plus /> Novo serviço
              </button>
            </>
          }
        />
        <div className="card flush">
          {!services.length ? (
            <Empty icon={Scissors} title="Nenhum serviço" />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Serviço</th>
                    <th>Categoria</th>
                    <th className="num">Preço</th>
                    <th className="num">Duração</th>
                    <th className="num">Barbeiros</th>
                    <th className="num">Realizados</th>
                    <th>Ativo</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {services.map((s) => (
                    <tr key={s.id} className={s.active && s.category_active ? '' : 'inactive-row'}>
                      <td>
                        <div className="strong">{s.name}</div>
                        {s.description && <div className="xs muted">{s.description}</div>}
                      </td>
                      <td className="small">
                        {s.category_name}
                        {!s.category_active && <div className="xs" style={{ color: 'var(--warning)' }}>categoria inativa</div>}
                      </td>
                      <td className="num gold strong">{money(s.price_cents)}</td>
                      <td className="num">{duration(s.duration_min)}</td>
                      <td className="num">
                        {s.staff_ids.length || <span style={{ color: 'var(--warning)' }} title="Nenhum barbeiro vinculado">0 ⚠</span>}
                      </td>
                      <td className="num">{s.times_done}</td>
                      <td>
                        <Switch checked={!!s.active} onChange={(v) => patch(`/catalog/services/${s.id}/status`, v, 'Serviço')} />
                      </td>
                      <td>
                        <div className="actions">
                          <button className="icon-btn" title="Editar" onClick={() => setSvcForm(s)}>
                            <Pencil />
                          </button>
                          <button className="icon-btn danger" title="Excluir" onClick={() => setConfirm({ type: 'service', item: s })}>
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

      {catForm && (
        <CategoryForm
          category={catForm === 'new' ? null : catForm}
          onClose={() => setCatForm(null)}
          onSaved={() => {
            setCatForm(null);
            reloadAll();
          }}
        />
      )}
      {svcForm && (
        <ServiceForm
          service={svcForm === 'new' ? null : svcForm}
          categories={categories}
          staff={staff}
          onClose={() => setSvcForm(null)}
          onSaved={() => {
            setSvcForm(null);
            reloadAll();
          }}
        />
      )}
      {confirm && (
        <ConfirmDialog
          title={confirm.type === 'category' ? 'Excluir categoria' : 'Excluir serviço'}
          danger
          confirmLabel="Excluir"
          message={`Excluir "${confirm.item.name}"? Itens com agendamentos ou serviços vinculados não podem ser excluídos — desative-os.`}
          onClose={() => setConfirm(null)}
          onConfirm={async () => {
            await api.del(confirm.type === 'category' ? `/catalog/categories/${confirm.item.id}` : `/catalog/services/${confirm.item.id}`);
            toast.success('Excluído.');
            reloadAll();
          }}
        />
      )}
    </div>
  );
}
