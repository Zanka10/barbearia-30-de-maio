// Notificações em tempo real (SSE) com fallback de polling.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { useToast } from './ToastContext.jsx';

const NotificationsContext = createContext(null);

export function NotificationsProvider({ children }) {
  const toast = useToast();
  const [unread, setUnread] = useState(0);
  const [version, setVersion] = useState(0); // muda a cada nova notificação (para recarregar listas)
  const esRef = useRef(null);

  const refreshCount = useCallback(async () => {
    try {
      const { unread } = await api.get('/notifications/unread-count');
      setUnread(unread);
    } catch {
      /* ignora */
    }
  }, []);

  useEffect(() => {
    refreshCount();
    let poll;
    if ('EventSource' in window) {
      const es = new EventSource('/api/notifications/stream');
      esRef.current = es;
      es.addEventListener('hello', (e) => setUnread(JSON.parse(e.data).unread));
      es.addEventListener('notification', (e) => {
        const n = JSON.parse(e.data);
        setUnread(n.unread);
        setVersion((v) => v + 1);
        toast.info(n.message, n.title);
        window.dispatchEvent(new CustomEvent('appointments:changed'));
      });
    }
    poll = setInterval(refreshCount, 60000);
    // Libera a conexão ao sair da página (navegadores limitam conexões simultâneas por servidor)
    const onHide = () => esRef.current?.close();
    window.addEventListener('pagehide', onHide);
    return () => {
      clearInterval(poll);
      window.removeEventListener('pagehide', onHide);
      esRef.current?.close();
    };
  }, [refreshCount, toast]);

  const markRead = useCallback(async (id) => {
    const r = await api.post(`/notifications/${id}/read`);
    setUnread(r.unread);
  }, []);
  const markAllRead = useCallback(async () => {
    await api.post('/notifications/read-all');
    setUnread(0);
    setVersion((v) => v + 1);
  }, []);

  const value = useMemo(() => ({ unread, version, refreshCount, markRead, markAllRead, setUnread }), [unread, version, refreshCount, markRead, markAllRead]);
  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export const useNotifications = () => useContext(NotificationsContext);
