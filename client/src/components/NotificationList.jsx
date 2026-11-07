import { Link } from 'react-router-dom';
import { CalendarCheck, CalendarClock, CalendarX, CheckCheck, Trash2 } from 'lucide-react';
import { api } from '../lib/api.js';
import { timeAgo } from '../lib/format.js';
import { useApi } from '../lib/hooks.js';
import { useNotifications } from '../context/NotificationsContext.jsx';
import { useAppointmentModal } from './AppointmentModal.jsx';
import { Empty, Loading, Pagination } from './ui.jsx';
import { useState } from 'react';

const ICONS = {
  appointment_created: [CalendarCheck, ''],
  appointment_rescheduled: [CalendarClock, 'change'],
  appointment_reassigned: [CalendarClock, 'change'],
  appointment_cancelled: [CalendarX, 'cancel'],
};

export default function NotificationList({ compact = false, onNavigate }) {
  const { version, markRead, markAllRead, setUnread } = useNotifications();
  const { openAppointment } = useAppointmentModal();
  const [page, setPage] = useState(1);
  const [onlyUnread, setOnlyUnread] = useState(false);
  const pageSize = compact ? 8 : 25;
  const { data, loading, reload } = useApi(`/notifications?page=${page}&pageSize=${pageSize}&unread=${onlyUnread ? 1 : 0}&v=${version}`);

  const open = async (n) => {
    if (!n.read_at) await markRead(n.id);
    reload();
    if (n.appointment_id) openAppointment(n.appointment_id);
    onNavigate?.();
  };
  const remove = async (e, n) => {
    e.stopPropagation();
    const r = await api.del(`/notifications/${n.id}`);
    setUnread(r.unread);
    reload();
  };

  return (
    <div>
      <div className="row between" style={{ padding: compact ? '12px 16px' : '0 0 12px', borderBottom: compact ? '1px solid var(--border)' : 0 }}>
        {compact ? (
          <span className="strong">Notificações</span>
        ) : (
          <div className="chips">
            <button className={`chip ${!onlyUnread ? 'active' : ''}`} onClick={() => (setOnlyUnread(false), setPage(1))}>
              Todas
            </button>
            <button className={`chip ${onlyUnread ? 'active' : ''}`} onClick={() => (setOnlyUnread(true), setPage(1))}>
              Não lidas
            </button>
          </div>
        )}
        <button className="btn btn-ghost btn-sm" onClick={markAllRead}>
          <CheckCheck /> Marcar todas como lidas
        </button>
      </div>
      <div className={compact ? '' : 'card flush'} style={compact ? { maxHeight: 420, overflowY: 'auto' } : undefined}>
        {loading && !data ? (
          <Loading />
        ) : !data?.items.length ? (
          <Empty title="Nenhuma notificação">Novos agendamentos, alterações e cancelamentos aparecem aqui.</Empty>
        ) : (
          data.items.map((n) => {
            const [Icon, cls] = ICONS[n.type] || [CalendarCheck, ''];
            return (
              <div key={n.id} className={`notif-item ${n.read_at ? '' : 'unread'}`} onClick={() => open(n)}>
                <div className={`notif-icon ${cls}`}>
                  <Icon />
                </div>
                <div className="grow">
                  <div className="row between">
                    <span className="strong small">{n.title}</span>
                    <span className="xs muted nowrap">{timeAgo(n.created_at)}</span>
                  </div>
                  <div className="small text-2" style={{ marginTop: 2 }}>
                    {n.message}
                  </div>
                </div>
                {!n.read_at && <span className="unread-dot" />}
                {!compact && (
                  <button className="icon-btn danger" onClick={(e) => remove(e, n)} aria-label="Excluir notificação">
                    <Trash2 />
                  </button>
                )}
              </div>
            );
          })
        )}
        {!compact && data && <Pagination page={page} pageSize={pageSize} total={data.total} onChange={setPage} />}
      </div>
      {compact && (
        <div style={{ padding: 10, textAlign: 'center', borderTop: '1px solid var(--border)' }}>
          <Link to="/painel/notificacoes" className="small" onClick={onNavigate}>
            Ver todas
          </Link>
        </div>
      )}
    </div>
  );
}
