import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { AlertCircle, Bell, CheckCircle2, X } from 'lucide-react';

const ToastContext = createContext(null);
let seq = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (type, message, title, timeout = 4500) => {
      const id = ++seq;
      setToasts((t) => [...t.slice(-4), { id, type, message, title }]);
      setTimeout(() => dismiss(id), timeout);
    },
    [dismiss],
  );

  const toast = useMemo(
    () => ({
      success: (msg, title) => push('success', msg, title),
      error: (msg, title) => push('error', msg?.message || msg, title, 6500),
      info: (msg, title) => push('info', msg, title, 7000),
    }),
    [push],
  );

  const icons = { success: CheckCircle2, error: AlertCircle, info: Bell };
  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => {
          const Icon = icons[t.type];
          return (
            <div key={t.id} className={`toast ${t.type}`}>
              <Icon className={t.type === 'success' ? 'gold' : ''} style={{ color: t.type === 'error' ? 'var(--danger)' : t.type === 'success' ? 'var(--success)' : 'var(--accent)' }} />
              <div className="grow">
                {t.title && <div className="toast-title">{t.title}</div>}
                <div className={t.title ? 'small text-2' : ''}>{t.message}</div>
              </div>
              <button className="icon-btn" style={{ width: 24, height: 24 }} onClick={() => dismiss(t.id)} aria-label="Fechar">
                <X />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
