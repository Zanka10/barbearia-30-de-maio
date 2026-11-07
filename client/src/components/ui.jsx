// Componentes de interface reutilizáveis.
import { useEffect, useId, useRef, useState } from 'react';
import { AlertCircle, ChevronLeft, ChevronRight, Inbox, X } from 'lucide-react';
import { STATUS } from '../lib/constants.js';
import { initials, maskPhone } from '../lib/format.js';

export function Spinner() {
  return <div className="spinner" role="status" aria-label="Carregando" />;
}

export function Loading() {
  return (
    <div className="loading-box">
      <Spinner />
    </div>
  );
}

export function Empty({ icon: Icon = Inbox, title = 'Nada por aqui', children }) {
  return (
    <div className="empty">
      <Icon />
      <div className="strong text-2">{title}</div>
      {children && <div className="small">{children}</div>}
    </div>
  );
}

export function ErrorBox({ error, onRetry }) {
  if (!error) return null;
  return (
    <div className="alert error">
      <AlertCircle />
      <div className="grow">{error.message || String(error)}</div>
      {onRetry && (
        <button className="btn btn-sm" onClick={onRetry}>
          Tentar novamente
        </button>
      )}
    </div>
  );
}

export function StatusBadge({ status }) {
  const s = STATUS[status] || { label: status, tone: 'muted' };
  return <span className={`badge ${s.tone}`}>{s.label}</span>;
}

export function Avatar({ name, src, size = 38 }) {
  return (
    <div className="avatar" style={{ '--size': `${size}px` }}>
      {src ? <img src={src} alt={name} /> : initials(name)}
    </div>
  );
}

/**
 * Monograma "B30" em escudo, redesenhado em SVG a partir do logo da barbearia.
 * Escudo branco com as letras vazadas (máscara), em gradiente de metal escovado.
 * `height` define a altura em px (largura proporcional 100:128).
 */
export function BrandMark({ height = 40, className = '' }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  return (
    <svg
      className={`brand-mark ${className}`}
      viewBox="0 0 100 128"
      width={(height * 100) / 128}
      height={height}
      role="img"
      aria-label="B30 — Barbearia Trinta de Maio"
    >
      <defs>
        <linearGradient id={`g${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.45" stopColor="#eceef1" />
          <stop offset="1" stopColor="#9a9ea6" />
        </linearGradient>
        <mask id={`m${uid}`}>
          <path fill="#fff" d="M0 0H100V106L50 128L0 106Z" />
          <g fill="#000">
            {/* separação entre as letras */}
            <rect x="33" y="0" width="3" height="128" />
            <rect x="68" y="0" width="3" height="128" />
            {/* B */}
            <rect x="10" y="12" width="12" height="32" />
            <path d="M10 56H22V103.3L10 98Z" />
            <path d="M33 44.5L27 50L33 55.5Z" />
            {/* 3 */}
            <rect x="36" y="12" width="21" height="32" />
            <path d="M36 56H57V113L50 116L36 110Z" />
            {/* 0 */}
            <path d="M80 12H91V97L80 101.8Z" />
          </g>
        </mask>
      </defs>
      <rect width="100" height="128" fill={`url(#g${uid})`} mask={`url(#m${uid})`} />
    </svg>
  );
}

/** Assinatura da marca: monograma + "BARBEARIA / TRINTA DE MAIO", como no logo. */
export function BrandLockup({ sub = 'Trinta de Maio', size = 'md' }) {
  return (
    <div className={`brand-lockup ${size}`}>
      <BrandMark height={size === 'sm' ? 34 : size === 'lg' ? 54 : 40} />
      <div className="brand-lockup-text">
        <span className="brand-name">Barbearia</span>
        <span className="brand-sub">{sub}</span>
      </div>
    </div>
  );
}

export function Modal({ title, onClose, children, footer, size = '', closeOnBackdrop = true }) {
  const ref = useRef(null);
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.querySelector('input, select, textarea, button.btn-primary')?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => closeOnBackdrop && e.target === e.currentTarget && onClose?.()}>
      <div className={`modal ${size}`} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Fechar">
            <X />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

/** Diálogo de confirmação. `confirm` pode ser assíncrono; erros são exibidos no próprio diálogo. */
export function ConfirmDialog({ title = 'Confirmar', message, confirmLabel = 'Confirmar', danger, onConfirm, onClose, children }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={title}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Voltar
          </button>
          <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={run} disabled={busy}>
            {busy ? 'Aguarde...' : confirmLabel}
          </button>
        </>
      }
    >
      <div className="stack">
        {message && <p className="text-2">{message}</p>}
        {children}
        <ErrorBox error={error} />
      </div>
    </Modal>
  );
}

export function Field({ label, error, hint, children, className = '', htmlFor }) {
  return (
    <div className={`field ${className}`}>
      {label && <label htmlFor={htmlFor}>{label}</label>}
      {children}
      {error ? <span className="error-text">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

export function PhoneInput({ value, onChange, ...props }) {
  return (
    <input
      className="input"
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      placeholder="(11) 91234-5678"
      value={value}
      onChange={(e) => onChange(maskPhone(e.target.value))}
      {...props}
    />
  );
}

export function Switch({ checked, onChange, label, disabled }) {
  return (
    <label className="switch">
      <input type="checkbox" checked={!!checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="track" />
      {label && <span>{label}</span>}
    </label>
  );
}

export function Pagination({ page, pageSize, total, onChange }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return total ? <div className="pagination">{total} registro(s)</div> : null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="pagination">
      <span>
        {from}–{to} de {total}
      </span>
      <div className="row">
        <button className="icon-btn" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Página anterior">
          <ChevronLeft />
        </button>
        <span>
          {page} / {pages}
        </span>
        <button className="icon-btn" disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label="Próxima página">
          <ChevronRight />
        </button>
      </div>
    </div>
  );
}

export function PageHeader({ title, description, actions }) {
  return (
    <div className="page-header">
      <div>
        <h2 style={{ fontSize: 24 }}>{title}</h2>
        {description && <p className="desc">{description}</p>}
      </div>
      {actions && <div className="row wrap">{actions}</div>}
    </div>
  );
}

export function Kpi({ label, value, sub, icon: Icon, highlight }) {
  return (
    <div className={`kpi ${highlight ? 'highlight' : ''}`}>
      <div className="kpi-label">
        {Icon && <Icon />}
        {label}
      </div>
      <div className="kpi-value">{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}
