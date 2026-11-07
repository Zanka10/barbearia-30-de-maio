import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { LogIn } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { BrandMark, ErrorBox, Field } from '../../components/ui.jsx';

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  // Login exclusivo de clientes. A equipe entra por /painel/entrar.
  if (user?.role === 'client') return <Navigate to="/minha-conta" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(identifier.trim(), password, 'client');
      const from = location.state?.from;
      navigate(from?.startsWith('/minha-conta') ? from : '/minha-conta', { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <form className="auth-card stack lg" onSubmit={submit}>
        <div className="row">
          <BrandMark />
          <div>
            <h1>Área do cliente</h1>
            <p className="muted small">Acesse seus agendamentos e histórico</p>
          </div>
        </div>
        <div className="alert info small">
          <div className="grow">
            <strong>Primeiro acesso?</strong> Se você já agendou conosco, crie sua senha usando o <strong>mesmo celular</strong> do
            agendamento e veja todo o seu histórico.
            <div style={{ marginTop: 10 }}>
              <Link to="/cadastro" className="btn btn-outline btn-sm">
                Criar meu acesso
              </Link>
            </div>
          </div>
        </div>
        <Field label="Celular ou e-mail">
          <input className="input" autoComplete="username" value={identifier} onChange={(e) => setIdentifier(e.target.value)} required autoFocus />
        </Field>
        <Field label="Senha">
          <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        <ErrorBox error={error} />
        {error?.code === 'WRONG_AREA' && (
          <Link to="/painel/entrar" className="btn btn-outline btn-block">
            Ir para o painel de gestão
          </Link>
        )}
        <button className="btn btn-primary btn-lg btn-block" disabled={busy}>
          <LogIn /> {busy ? 'Entrando...' : 'Entrar'}
        </button>
        <div className="divider" style={{ margin: 0 }} />
        <p className="small muted center">
          Ainda não tem conta? <Link to="/cadastro">Crie sua conta</Link> para acompanhar seus agendamentos.
        </p>
        <p className="xs muted center">Esqueceu a senha? Fale com a barbearia para redefini-la.</p>
      </form>
    </div>
  );
}
