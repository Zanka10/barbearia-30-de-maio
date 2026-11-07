// Login exclusivo da equipe (administradores e barbeiros), separado da área do cliente.
import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, LockKeyhole, LogIn } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { BrandMark, ErrorBox, Field } from '../../components/ui.jsx';

export default function StaffLogin() {
  const { user, login, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (user && user.role !== 'client') return <Navigate to="/painel" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(identifier.trim(), password, 'staff');
      const from = location.state?.from;
      navigate(from?.startsWith('/painel') ? from : '/painel', { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="staff-login">
      <div className="staff-login-inner">
        <div className="staff-login-brand">
          <BrandMark height={84} />
          <div className="staff-login-word">Barbearia</div>
          <div className="staff-login-sub">Trinta de Maio</div>
          <div className="staff-login-tag">
            <LockKeyhole /> Painel de gestão
          </div>
        </div>

        {user?.role === 'client' ? (
          <div className="auth-card stack lg center">
            <p className="muted">
              Você está conectado como cliente (<strong>{user.name}</strong>). O painel de gestão é exclusivo da equipe da barbearia.
            </p>
            <button className="btn btn-primary btn-block" onClick={() => logout()}>
              Sair e entrar como funcionário
            </button>
            <Link to="/minha-conta" className="btn btn-ghost btn-block">
              Voltar para minha conta
            </Link>
          </div>
        ) : (
          <form className="auth-card stack lg" onSubmit={submit}>
            <div>
              <h1>Acesso da equipe</h1>
              <p className="muted small">Entre com o e-mail e a senha cadastrados pelo administrador.</p>
            </div>
            <Field label="E-mail ou celular">
              <input className="input" autoComplete="username" value={identifier} onChange={(e) => setIdentifier(e.target.value)} required autoFocus />
            </Field>
            <Field label="Senha">
              <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </Field>
            <ErrorBox error={error} />
            {error?.code === 'WRONG_AREA' && (
              <Link to="/entrar" className="btn btn-outline btn-block">
                Ir para a área do cliente
              </Link>
            )}
            <button className="btn btn-primary btn-lg btn-block" disabled={busy}>
              <LogIn /> {busy ? 'Entrando...' : 'Entrar no painel'}
            </button>
            <p className="xs muted center">Esqueceu a senha? Peça ao administrador para redefini-la em Funcionários.</p>
          </form>
        )}

        <Link to="/" className="staff-login-back">
          <ArrowLeft /> Voltar ao site
        </Link>
      </div>
    </div>
  );
}
