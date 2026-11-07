import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import { Loading } from './components/ui.jsx';
import PublicLayout from './layouts/PublicLayout.jsx';
import Home from './pages/public/Home.jsx';
import Booking from './pages/public/Booking.jsx';
import Login from './pages/public/Login.jsx';
import Register from './pages/public/Register.jsx';
import Privacy from './pages/public/Privacy.jsx';
import ClientArea from './pages/client/ClientArea.jsx';

// O painel é carregado sob demanda (calendário e gráficos são pesados)
const PanelLayout = lazy(() => import('./layouts/PanelLayout.jsx'));
const Dashboard = lazy(() => import('./pages/panel/Dashboard.jsx'));
const Agenda = lazy(() => import('./pages/panel/Agenda.jsx'));
const Appointments = lazy(() => import('./pages/panel/Appointments.jsx'));
const Clients = lazy(() => import('./pages/panel/Clients.jsx'));
const ClientDetail = lazy(() => import('./pages/panel/ClientDetail.jsx'));
const Staff = lazy(() => import('./pages/panel/Staff.jsx'));
const Services = lazy(() => import('./pages/panel/Services.jsx'));
const Schedule = lazy(() => import('./pages/panel/Schedule.jsx'));
const Finance = lazy(() => import('./pages/panel/Finance.jsx'));
const Notifications = lazy(() => import('./pages/panel/Notifications.jsx'));
const Settings = lazy(() => import('./pages/panel/Settings.jsx'));
const Profile = lazy(() => import('./pages/panel/Profile.jsx'));
const StaffLogin = lazy(() => import('./pages/panel/StaffLogin.jsx'));

function RequireRole({ roles, children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Loading />;
  // Painel: sem login vai para o login da equipe (separado da área do cliente)
  if (!user) return <Navigate to="/painel/entrar" replace state={{ from: location.pathname }} />;
  if (!roles.includes(user.role)) return <Navigate to={user.role === 'client' ? '/minha-conta' : '/painel'} replace />;
  return children;
}

/** Área do cliente: nunca redireciona para o painel. Se alguém da equipe estiver conectado, avisa. */
function RequireClient({ children }) {
  const { user, loading, logout } = useAuth();
  const location = useLocation();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/entrar" replace state={{ from: location.pathname }} />;
  if (user.role !== 'client') {
    return (
      <div className="auth-page">
        <div className="auth-card stack lg center">
          <h1>Área do cliente</h1>
          <p className="muted">
            Você está conectado como <strong>{user.name}</strong> (equipe da barbearia). Esta área é exclusiva para clientes consultarem
            seus agendamentos e histórico.
          </p>
          <button className="btn btn-primary btn-block" onClick={() => logout()}>
            Sair e entrar como cliente
          </button>
        </div>
      </div>
    );
  }
  return children;
}

export default function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route index element={<Home />} />
          <Route path="agendar" element={<Booking />} />
          <Route path="entrar" element={<Login />} />
          <Route path="cadastro" element={<Register />} />
          <Route path="privacidade" element={<Privacy />} />
          <Route
            path="minha-conta"
            element={
              <RequireClient>
                <ClientArea />
              </RequireClient>
            }
          />
        </Route>

        <Route path="painel/entrar" element={<StaffLogin />} />
        <Route
          path="painel"
          element={
            <RequireRole roles={['admin', 'barber']}>
              <PanelLayout />
            </RequireRole>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="agenda" element={<Agenda />} />
          <Route path="agendamentos" element={<Appointments mode="list" />} />
          <Route path="historico" element={<Appointments mode="history" />} />
          <Route path="clientes" element={<Clients />} />
          <Route path="clientes/:id" element={<ClientDetail />} />
          <Route path="horarios" element={<Schedule />} />
          <Route path="notificacoes" element={<Notifications />} />
          <Route path="perfil" element={<Profile />} />
          <Route
            path="funcionarios"
            element={
              <RequireRole roles={['admin']}>
                <Staff />
              </RequireRole>
            }
          />
          <Route
            path="servicos"
            element={
              <RequireRole roles={['admin']}>
                <Services />
              </RequireRole>
            }
          />
          <Route
            path="financeiro"
            element={
              <RequireRole roles={['admin']}>
                <Finance />
              </RequireRole>
            }
          />
          <Route
            path="configuracoes"
            element={
              <RequireRole roles={['admin']}>
                <Settings />
              </RequireRole>
            }
          />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
