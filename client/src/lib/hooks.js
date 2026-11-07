import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.js';

/** Carrega dados de uma URL da API; recarrega quando a URL muda. */
export function useApi(url, { enabled = true, keepPrevious = true } = {}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(!!(url && enabled));
  const reqId = useRef(0);

  const load = useCallback(async () => {
    if (!url || !enabled) return;
    const id = ++reqId.current;
    setLoading(true);
    setError(null);
    if (!keepPrevious) setData(null);
    try {
      const d = await api.get(url);
      if (id === reqId.current) setData(d);
    } catch (err) {
      if (id === reqId.current) setError(err);
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [url, enabled, keepPrevious]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, error, loading, reload: load, setData };
}

export function useDebounced(value, delay = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

/** Recarrega quando chegam notificações de agendamento (tempo real). */
export function useOnAppointmentsChanged(cb) {
  const ref = useRef(cb);
  ref.current = cb;
  useEffect(() => {
    const h = () => ref.current();
    window.addEventListener('appointments:changed', h);
    return () => window.removeEventListener('appointments:changed', h);
  }, []);
}

export const notifyAppointmentsChanged = () => window.dispatchEvent(new CustomEvent('appointments:changed'));
