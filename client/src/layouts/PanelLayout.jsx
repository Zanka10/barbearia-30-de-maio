import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Bell,
  CalendarDays,
  ClipboardList,
  Clock,
  ExternalLink,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Scissors,
  Settings,
  UserCircle,
  UserCog,
  Users,
  Wallet,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { NotificationsProvider, useNotifications } from '../context/NotificationsContext.jsx';
import { Avatar, BrandLockup } from '../components/ui.jsx';
import { ROLE_LABEL } from '../lib/constants.js';
import NotificationList from '../components/NotificationList.jsx';
import { AppointmentModalProvider } from '../components/AppointmentModal.jsx';

const NAV = [
  { section: 'Operação' },
  { to: '/painel', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/painel/agenda', label: 'Agenda', icon: CalendarDays },
  { to: '/painel/agendamentos', label: 'Agendamentos', icon: ClipboardList },
  { to: '/painel/historico', label: 'Histórico', icon: History },
  { to: '/painel/clientes', label: 'Clientes', icon: Users },
  { to: '/painel/notificacoes', label: 'Notificações', icon: Bell, badge: true },
  { section: 'Gestão', admin: true },
  { to: '/painel/financeiro', label: 'Financeiro', icon: Wallet, admin: true },
  { to: '/painel/servicos', label: 'Serviços', icon: Scissors, admin: true },
  { to: '/painel/funcionarios', label: 'Funcionários', icon: UserCog, admin: true },
  { to: '/painel/horarios', label: 'Horários', icon: Clock },
  { to: '/painel/configuracoes', label: 'Configurações', icon: Settings, admin: true },
];

const TITLES = {
  '/painel': 'Dashboard',
  '/painel/agenda': 'Agenda',
  '/painel/agendamentos': 'Agendamentos',
  '/painel/historico': 'Histórico de atendimentos',
  '/painel/clientes': 'Clientes',
  '/painel/notificacoes': 'Notificações',
  '/painel/financeiro': 'Financeiro',
  '/painel/servicos': 'Categorias e serviços',
  '/painel/funcionarios': 'Funcionários',
  '/painel/horarios': 'Horários e bloqueios',
  '/painel/configuracoes': 'Configurações',
  '/painel/perfil': 'Meu perfil',
};

function NotificationBell() {
  const { unread } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const onDoc = (e) => !ref.current?.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);
  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button className="icon-btn" onClick={() => setOpen((o) => !o)} aria-label={`Notificações (${unread} não lidas)`}>
        <Bell />
        {unread > 0 && <span className="dot-count">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <div className="dropdown">
          <NotificationList compact onNavigate={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}

function Shell() {
  const { user, logout, isAdmin } = useAuth();
  const { unread } = useNotifications();
  const [navOpen, setNavOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => setNavOpen(false), [location.pathname]);

  const title = TITLES[location.pathname] || (location.pathname.startsWith('/painel/clientes/') ? 'Cliente' : 'Painel');
  const items = NAV.filter((i) => !i.admin || isAdmin);

  return (
    <div className={`panel ${navOpen ? 'nav-open' : ''}`}>
      <aside className="sidebar">
        <Link to="/painel" className="sidebar-brand">
          <BrandLockup size="sm" sub="Painel de gestão" />
        </Link>
        <nav className="nav">
          {items.map((item, i) =>
            item.section ? (
              <div key={i} className="nav-section">
                {item.section}
              </div>
            ) : (
              <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                <item.icon />
                {item.label}
                {item.badge && unread > 0 && <span className="nav-count">{unread}</span>}
              </NavLink>
            ),
          )}
          <div className="nav-section">Site</div>
          <a className="nav-link" href="/" target="_blank" rel="noreferrer">
            <ExternalLink /> Página de agendamento
          </a>
        </nav>
        <div className="sidebar-user">
          <Avatar name={user.name} src={user.photo_path} size={36} />
          <Link to="/painel/perfil" className="grow" style={{ color: 'inherit', textDecoration: 'none', minWidth: 0 }}>
            <div className="strong small ellipsis">{user.name}</div>
            <div className="xs muted">{ROLE_LABEL[user.role]}</div>
          </Link>
          <button
            className="icon-btn"
            title="Sair"
            aria-label="Sair"
            onClick={async () => {
              await logout();
              navigate('/entrar');
            }}
          >
            <LogOut />
          </button>
        </div>
      </aside>
      <div className="sidebar-backdrop" onClick={() => setNavOpen(false)} />
      <div className="panel-main">
        <header className="topbar">
          <button className="icon-btn menu-toggle" onClick={() => setNavOpen(true)} aria-label="Abrir menu">
            <Menu />
          </button>
          <h1>{title}</h1>
          <NotificationBell />
          <Link to="/painel/perfil" className="icon-btn" aria-label="Meu perfil">
            <UserCircle />
          </Link>
        </header>
        <div className="panel-content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}

export default function PanelLayout() {
  return (
    <NotificationsProvider>
      <AppointmentModalProvider>
        <Shell />
      </AppointmentModalProvider>
    </NotificationsProvider>
  );
}
