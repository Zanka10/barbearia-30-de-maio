import { useState } from 'react';
import { KeyRound, User } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { ErrorBox, Field, PageHeader } from '../../components/ui.jsx';
import PhotoPicker from '../../components/PhotoPicker.jsx';
import { ROLE_LABEL } from '../../lib/constants.js';
import { phoneBR } from '../../lib/format.js';

export default function Profile() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [p, setP] = useState({ name: user.name, email: user.email || '' });
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [err, setErr] = useState(null);
  const [pwErr, setPwErr] = useState(null);

  return (
    <div>
      <PageHeader title="Meu perfil" description={`${ROLE_LABEL[user.role]} · ${phoneBR(user.phone) || 'sem telefone'}`} />
      {user.staffId && (
        <div className="card stack" style={{ marginBottom: 20 }}>
          <PhotoPicker
            name={user.name}
            src={user.photo_path}
            size={96}
            hint="Sua foto aparece no site e para os clientes ao escolherem o barbeiro no agendamento."
            onError={(er) => toast.error(er)}
            onSelect={async (file) => {
              const fd = new FormData();
              fd.append('photo', file);
              const r = await api.upload(`/staff/${user.staffId}/photo`, fd);
              setUser({ ...user, photo_path: r.photo_path });
              toast.success('Foto de perfil atualizada.');
            }}
            onRemove={async () => {
              await api.del(`/staff/${user.staffId}/photo`);
              setUser({ ...user, photo_path: null });
              toast.success('Foto removida.');
            }}
          />
        </div>
      )}
      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <form
          className="card stack"
          onSubmit={async (e) => {
            e.preventDefault();
            setErr(null);
            try {
              const r = await api.put('/auth/profile', p);
              setUser(r.user);
              toast.success('Perfil atualizado.');
            } catch (er) {
              setErr(er);
            }
          }}
        >
          <div className="card-title">
            <User /> Dados pessoais
          </div>
          <Field label="Nome">
            <input className="input" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} />
          </Field>
          <Field label="E-mail (login e notificações)">
            <input className="input" type="email" value={p.email} onChange={(e) => setP({ ...p, email: e.target.value })} />
          </Field>
          <ErrorBox error={err} />
          <div>
            <button className="btn btn-primary">Salvar</button>
          </div>
        </form>
        <form
          className="card stack"
          onSubmit={async (e) => {
            e.preventDefault();
            setPwErr(null);
            if (pw.newPassword !== pw.confirm) return setPwErr(new Error('As senhas não conferem.'));
            try {
              await api.post('/auth/change-password', { currentPassword: pw.currentPassword, newPassword: pw.newPassword });
              setPw({ currentPassword: '', newPassword: '', confirm: '' });
              toast.success('Senha alterada. Outras sessões foram encerradas.');
            } catch (er) {
              setPwErr(er);
            }
          }}
        >
          <div className="card-title">
            <KeyRound /> Alterar senha
          </div>
          <Field label="Senha atual">
            <input className="input" type="password" autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} />
          </Field>
          <Field label="Nova senha" hint="Mínimo 8 caracteres, com letras e números.">
            <input className="input" type="password" autoComplete="new-password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} />
          </Field>
          <Field label="Confirmar nova senha">
            <input className="input" type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
          </Field>
          <ErrorBox error={pwErr} />
          <div>
            <button className="btn">Alterar senha</button>
          </div>
        </form>
      </div>
    </div>
  );
}
