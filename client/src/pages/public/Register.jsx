import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { UserPlus } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { BrandMark, ErrorBox, Field, PhoneInput } from '../../components/ui.jsx';
import { isValidPhone, onlyDigits } from '../../lib/format.js';

export default function Register() {
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const [f, setF] = useState({ name: '', phone: '', email: '', password: '', confirm: '', consent: false });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={user.role === 'client' ? '/minha-conta' : '/painel'} replace />;

  const submit = async (e) => {
    e.preventDefault();
    const er = {};
    if (f.name.trim().length < 2) er.name = 'Informe seu nome completo.';
    if (!isValidPhone(f.phone)) er.phone = 'Celular inválido.';
    if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) er.email = 'E-mail inválido.';
    if (f.password.length < 8 || !/[A-Za-z]/.test(f.password) || !/\d/.test(f.password)) er.password = 'Mínimo 8 caracteres, com letras e números.';
    if (f.password !== f.confirm) er.confirm = 'As senhas não conferem.';
    if (!f.consent) er.consent = 'É necessário aceitar a Política de Privacidade.';
    setErrors(er);
    if (Object.keys(er).length) return;
    setBusy(true);
    setError(null);
    try {
      await register({ name: f.name.trim(), phone: onlyDigits(f.phone), email: f.email.trim() || null, password: f.password, consent: true });
      navigate('/minha-conta', { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <form className="auth-card stack lg" onSubmit={submit} noValidate>
        <div className="row">
          <BrandMark />
          <div>
            <h1>Criar conta</h1>
            <p className="muted small">Acompanhe seus agendamentos e histórico</p>
          </div>
        </div>
        <div className="alert info small">
          Já agendou conosco? Use o <strong>mesmo celular</strong> (e o mesmo e-mail, se informou) para ver todo o seu histórico.
        </div>
        <Field label="Nome completo" error={errors.name}>
          <input className="input" autoComplete="name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <Field label="Celular" error={errors.phone}>
          <PhoneInput value={f.phone} onChange={(phone) => setF({ ...f, phone })} />
        </Field>
        <Field label="E-mail (opcional)" error={errors.email}>
          <input className="input" type="email" autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </Field>
        <div className="form-grid">
          <Field label="Senha" error={errors.password}>
            <input className="input" type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
          </Field>
          <Field label="Confirmar senha" error={errors.confirm}>
            <input className="input" type="password" autoComplete="new-password" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} />
          </Field>
        </div>
        <div>
          <label className="check">
            <input type="checkbox" checked={f.consent} onChange={(e) => setF({ ...f, consent: e.target.checked })} />
            <span>
              Li e concordo com a <Link to="/privacidade" target="_blank">Política de Privacidade</Link> (LGPD).
            </span>
          </label>
          {errors.consent && <div className="small" style={{ color: 'var(--danger)', marginTop: 6 }}>{errors.consent}</div>}
        </div>
        <ErrorBox error={error} />
        <button className="btn btn-primary btn-lg btn-block" disabled={busy}>
          <UserPlus /> {busy ? 'Criando conta...' : 'Criar conta'}
        </button>
        <p className="small muted center">
          Já tem conta? <Link to="/entrar">Entrar</Link>
        </p>
      </form>
    </div>
  );
}
