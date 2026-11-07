import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, KeyRound, Pencil, Plus, Trash2, UserCog } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useApi } from '../../lib/hooks.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { Avatar, ConfirmDialog, Empty, ErrorBox, Field, Loading, Modal, PageHeader, PhoneInput, Switch } from '../../components/ui.jsx';
import PhotoPicker from '../../components/PhotoPicker.jsx';
import { ROLE_LABEL, WEEKDAYS_SHORT } from '../../lib/constants.js';
import { dateTimeBR, maskPhone, onlyDigits, phoneBR } from '../../lib/format.js';

const COLORS = ['#c9a24a', '#7aa2c9', '#9fc97a', '#c97a9f', '#c98a5a', '#8f7ac9', '#5ab8b0', '#d4d06a'];

function StaffForm({ staff, services, onClose, onSaved, onPhotoChanged }) {
  const toast = useToast();
  const { user } = useAuth();
  const editing = !!staff;
  const [f, setF] = useState({
    name: staff?.name || '',
    email: staff?.email || '',
    phone: staff ? maskPhone(staff.phone || '') : '',
    password: '',
    role: staff?.role || 'barber',
    color: staff?.color || COLORS[0],
    specialties: staff?.specialties || '',
    bio: staff?.bio || '',
    serviceIds: staff?.service_ids || [],
    daysOff: staff?.days_off || [0],
    active: staff ? !!staff.active : true,
  });
  const [photo, setPhoto] = useState(staff?.photo_path || null);
  // No cadastro a foto fica pendente e é enviada logo após criar o funcionário.
  const [pendingPhoto, setPendingPhoto] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!pendingPhoto) return undefined;
    const url = URL.createObjectURL(pendingPhoto);
    setPhoto(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingPhoto]);

  const grouped = useMemo(() => {
    const g = new Map();
    for (const s of services) {
      if (!g.has(s.category_name)) g.set(s.category_name, []);
      g.get(s.category_name).push(s);
    }
    return [...g.entries()];
  }, [services]);

  const toggle = (key, value) => setF((cur) => ({ ...cur, [key]: cur[key].includes(value) ? cur[key].filter((x) => x !== value) : [...cur[key], value] }));

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const body = { ...f, phone: onlyDigits(f.phone) };
      if (editing) delete body.password;
      const r = editing ? await api.put(`/staff/${staff.id}`, body) : await api.post('/staff', body);
      if (!editing && pendingPhoto) {
        try {
          const fd = new FormData();
          fd.append('photo', pendingPhoto);
          await api.upload(`/staff/${r.staff.id}/photo`, fd);
        } catch (err) {
          toast.error(`Funcionário cadastrado, mas a foto não foi enviada: ${err.message}`);
        }
      }
      toast.success(editing ? 'Funcionário atualizado.' : 'Funcionário cadastrado.');
      onSaved(r.staff);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const selectPhoto = async (file) => {
    setError(null);
    if (!editing) return setPendingPhoto(file);
    const fd = new FormData();
    fd.append('photo', file);
    const r = await api.upload(`/staff/${staff.id}/photo`, fd);
    setPhoto(r.photo_path);
    toast.success('Foto atualizada.');
    onPhotoChanged?.();
  };

  const removePhoto = async () => {
    if (!editing) {
      setPendingPhoto(null);
      return setPhoto(null);
    }
    await api.del(`/staff/${staff.id}/photo`);
    setPhoto(null);
    toast.success('Foto removida.');
    onPhotoChanged?.();
  };

  return (
    <Modal
      title={editing ? `Editar ${staff.name}` : 'Novo funcionário'}
      onClose={onClose}
      size="lg"
      closeOnBackdrop={false}
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
      <div className="stack lg">
        <PhotoPicker
          name={f.name}
          src={photo}
          onSelect={selectPhoto}
          onRemove={removePhoto}
          onError={setError}
          hint="Aparece no site e na escolha do barbeiro durante o agendamento. JPG, PNG ou WEBP."
        />
        <div className="form-grid">
          <Field label="Nome completo *" className="full">
            <input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </Field>
          <Field label="E-mail * (login e notificações)">
            <input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          </Field>
          <Field label="Telefone *">
            <PhoneInput value={f.phone} onChange={(phone) => setF({ ...f, phone })} />
          </Field>
          {!editing && (
            <Field label="Senha inicial *" hint="Mínimo 8 caracteres, com letras e números.">
              <input className="input" type="text" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
            </Field>
          )}
          <Field label="Perfil de acesso">
            <select className="select" value={f.role} disabled={staff?.user_id === user.id} onChange={(e) => setF({ ...f, role: e.target.value })}>
              <option value="barber">Barbeiro (somente a própria agenda)</option>
              <option value="admin">Administrador (acesso completo)</option>
            </select>
          </Field>
          <Field label="Especialidades" className={editing ? '' : 'full'}>
            <input className="input" value={f.specialties} placeholder="Ex.: degradê, barba, química" onChange={(e) => setF({ ...f, specialties: e.target.value })} />
          </Field>
          <Field label="Apresentação (exibida no site)" className="full">
            <textarea className="textarea" maxLength={1000} value={f.bio} onChange={(e) => setF({ ...f, bio: e.target.value })} />
          </Field>
          <Field label="Cor na agenda">
            <div className="row wrap" style={{ gap: 6 }}>
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Cor ${c}`}
                  onClick={() => setF({ ...f, color: c })}
                  style={{ width: 28, height: 28, borderRadius: '50%', background: c, border: f.color === c ? '3px solid #fff' : '2px solid transparent', cursor: 'pointer' }}
                />
              ))}
              <input type="color" value={f.color} onChange={(e) => setF({ ...f, color: e.target.value })} aria-label="Cor personalizada" style={{ width: 32, height: 28, background: 'none', border: 0 }} />
            </div>
          </Field>
          <Field label="Status">
            <Switch checked={f.active} disabled={staff?.user_id === user.id} onChange={(active) => setF({ ...f, active })} label={f.active ? 'Ativo' : 'Inativo'} />
          </Field>
        </div>

        <Field label="Folgas semanais (dias sem atendimento)">
          <div className="chips">
            {WEEKDAYS_SHORT.map((w, i) => (
              <button key={w} type="button" className={`chip ${f.daysOff.includes(i) ? 'active' : ''}`} onClick={() => toggle('daysOff', i)}>
                {w}
              </button>
            ))}
          </div>
        </Field>

        <Field label={`Serviços que realiza (${f.serviceIds.length})`}>
          <div className="row" style={{ gap: 8, marginBottom: 6 }}>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setF({ ...f, serviceIds: services.map((s) => s.id) })}>
              Marcar todos
            </button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setF({ ...f, serviceIds: [] })}>
              Limpar
            </button>
          </div>
          <div className="stack" style={{ gap: 10 }}>
            {grouped.map(([cat, list]) => (
              <div key={cat}>
                <div className="xs muted" style={{ marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {cat}
                </div>
                <div className="check-list" style={{ maxHeight: 'none' }}>
                  {list.map((s) => (
                    <label key={s.id} className="check-card">
                      <input type="checkbox" checked={f.serviceIds.includes(s.id)} onChange={() => toggle('serviceIds', s.id)} />
                      <span className="grow">{s.name}</span>
                      {!s.active && <span className="badge muted plain">inativo</span>}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Field>
        <ErrorBox error={error} />
      </div>
    </Modal>
  );
}

function ResetPassword({ staff, onClose }) {
  const toast = useToast();
  const [password, setPassword] = useState('');
  return (
    <ConfirmDialog
      title={`Redefinir senha — ${staff.name}`}
      confirmLabel="Redefinir senha"
      message="O funcionário será desconectado de todas as sessões e deverá usar a nova senha."
      onClose={onClose}
      onConfirm={async () => {
        await api.post(`/staff/${staff.id}/reset-password`, { password });
        toast.success('Senha redefinida.');
      }}
    >
      <Field label="Nova senha" hint="Mínimo 8 caracteres, com letras e números.">
        <input className="input" type="text" value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
    </ConfirmDialog>
  );
}

export default function Staff() {
  const toast = useToast();
  const { user } = useAuth();
  const { data, loading, error, reload } = useApi('/staff');
  const { data: svc } = useApi('/catalog/services');
  const [editing, setEditing] = useState(null); // null | 'new' | staff
  const [resetting, setResetting] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const openEdit = async (s) => {
    const r = await api.get(`/staff/${s.id}`);
    setEditing(r.staff);
  };

  const toggleActive = async (s, active) => {
    try {
      const r = await api.patch(`/staff/${s.id}/status`, { active });
      toast.success(active ? `${s.name} ativado.` : `${s.name} desativado.`);
      if (!active && r.upcomingAppointments) {
        toast.info(`${s.name} possui ${r.upcomingAppointments} agendamento(s) futuro(s). Remarque-os na agenda.`, 'Atenção');
      }
      reload();
    } catch (err) {
      toast.error(err);
    }
  };

  return (
    <div>
      <PageHeader
        title="Funcionários"
        description="Barbeiros e administradores com acesso ao sistema."
        actions={
          <button className="btn btn-primary" onClick={() => setEditing('new')}>
            <Plus /> Novo funcionário
          </button>
        }
      />
      <ErrorBox error={error} onRetry={reload} />
      {loading && !data ? (
        <Loading />
      ) : !data?.items.length ? (
        <div className="card">
          <Empty icon={UserCog} title="Nenhum funcionário cadastrado">
            Cadastre os barbeiros para liberar o agendamento online.
          </Empty>
        </div>
      ) : (
        <div className="card flush">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Funcionário</th>
                  <th>Contato</th>
                  <th>Perfil</th>
                  <th className="num">Serviços</th>
                  <th>Folgas</th>
                  <th className="num">Próximos</th>
                  <th>Ativo</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.items.map((s) => (
                  <tr key={s.id} className={s.active ? '' : 'inactive-row'}>
                    <td>
                      <div className="row">
                        <Avatar name={s.name} src={s.photo_path} />
                        <div>
                          <div className="strong row" style={{ gap: 6 }}>
                            <span className="color-dot" style={{ background: s.color }} />
                            {s.name}
                          </div>
                          <div className="xs muted">{s.specialties || '—'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="small">
                      <div>{s.email}</div>
                      <div className="muted">{phoneBR(s.phone)}</div>
                    </td>
                    <td>
                      <span className={`badge plain ${s.role === 'admin' ? 'gold' : 'muted'}`}>{ROLE_LABEL[s.role]}</span>
                    </td>
                    <td className="num">{s.service_ids.length}</td>
                    <td className="small nowrap">{s.days_off.length ? s.days_off.map((d) => WEEKDAYS_SHORT[d]).join(', ') : '—'}</td>
                    <td className="num">{s.upcoming}</td>
                    <td>
                      <Switch checked={!!s.active} disabled={s.user_id === user.id} onChange={(v) => toggleActive(s, v)} />
                    </td>
                    <td>
                      <div className="actions">
                        <Link className="icon-btn" to={`/painel/agenda?staff=${s.id}`} title="Ver agenda">
                          <CalendarDays />
                        </Link>
                        <button className="icon-btn" title="Editar" onClick={() => openEdit(s)}>
                          <Pencil />
                        </button>
                        <button className="icon-btn" title="Redefinir senha" onClick={() => setResetting(s)}>
                          <KeyRound />
                        </button>
                        <button className="icon-btn danger" title="Excluir" disabled={s.user_id === user.id} onClick={() => setDeleting(s)}>
                          <Trash2 />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editing && (
        <StaffForm
          staff={editing === 'new' ? null : editing}
          services={svc?.items || []}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
          onPhotoChanged={reload}
        />
      )}
      {resetting && <ResetPassword staff={resetting} onClose={() => setResetting(null)} />}
      {deleting && (
        <ConfirmDialog
          title="Excluir funcionário"
          danger
          confirmLabel="Excluir"
          message={`Excluir ${deleting.name}? Funcionários com histórico de atendimentos não podem ser excluídos — desative-os.`}
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await api.del(`/staff/${deleting.id}`);
            toast.success('Funcionário excluído.');
            reload();
          }}
        />
      )}
      {data?.items.some((s) => s.last_login_at) && (
        <p className="xs muted mt">
          Últimos acessos:{' '}
          {data.items
            .filter((s) => s.last_login_at)
            .map((s) => `${s.name.split(' ')[0]} (${dateTimeBR(s.last_login_at)})`)
            .join(' · ')}
        </p>
      )}
    </div>
  );
}
