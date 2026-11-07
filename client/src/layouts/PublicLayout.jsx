import { Link, Outlet, useNavigate } from 'react-router-dom';
import { AtSign, CalendarPlus, LogOut, MapPin, MessageCircle, Phone, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useShop } from '../context/ShopContext.jsx';
import { BrandLockup } from '../components/ui.jsx';
import { whatsappLink } from '../lib/format.js';

export default function PublicLayout() {
  const { user, logout } = useAuth();
  const { settings: s } = useShop();
  const navigate = useNavigate();

  return (
    <>
      <header className="site-header">
        <div className="container">
          <Link to="/" className="site-brand" aria-label="Página inicial">
            <BrandLockup />
          </Link>
          <nav className="site-nav">
            <a className="link hide-sm" href="/#servicos">
              Serviços
            </a>
            <a className="link hide-sm" href="/#como-funciona">
              Como funciona
            </a>
            <a className="link hide-sm" href="/#contato">
              Contato
            </a>
            {user?.role !== 'client' && (
              <Link className="btn btn-ghost btn-sm" to="/minha-conta" title="Meus agendamentos">
                <User /> <span className="hide-xs">Meus agendamentos</span>
              </Link>
            )}
            {user?.role === 'client' && (
              <>
                <Link className="btn btn-ghost btn-sm" to="/minha-conta" title="Minha conta">
                  <User /> <span className="hide-xs">Minha conta</span>
                </Link>
                <button
                  className="icon-btn"
                  title="Sair"
                  onClick={async () => {
                    await logout();
                    navigate('/');
                  }}
                >
                  <LogOut />
                </button>
              </>
            )}
            <Link className="btn btn-primary btn-sm" to="/agendar">
              <CalendarPlus /> Agendar
            </Link>
          </nav>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
      <footer className="site-footer">
        <div className="container footer-grid">
          <div className="footer-brand">
            <BrandLockup size="lg" />
            <p className="muted small">{s.shop_tagline || 'Tradição, estilo e precisão em cada corte.'}</p>
          </div>
          <div className="footer-col">
            <div className="footer-title">Navegação</div>
            <a href="/#servicos">Serviços e preços</a>
            <a href="/#como-funciona">Como funciona</a>
            <Link to="/agendar">Agendar horário</Link>
            <Link to="/minha-conta">Área do cliente</Link>
          </div>
          {(s.shop_address || s.shop_phone || s.shop_whatsapp || s.shop_instagram) && (
            <div className="footer-col">
              <div className="footer-title">Contato</div>
              {s.shop_address && (
                <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.shop_address)}`} target="_blank" rel="noreferrer">
                  <MapPin /> {s.shop_address}
                </a>
              )}
              {s.shop_phone && (
                <a href={`tel:${s.shop_phone}`}>
                  <Phone /> {s.shop_phone}
                </a>
              )}
              {s.shop_whatsapp && (
                <a href={whatsappLink(s.shop_whatsapp)} target="_blank" rel="noreferrer">
                  <MessageCircle /> WhatsApp
                </a>
              )}
              {s.shop_instagram && (
                <a href={`https://instagram.com/${s.shop_instagram.replace('@', '')}`} target="_blank" rel="noreferrer">
                  <AtSign /> {s.shop_instagram}
                </a>
              )}
            </div>
          )}
        </div>
        <div className="container footer-bottom">
          <div>
            © {new Date().getFullYear()} {s.shop_name}. Todos os direitos reservados.
          </div>
          <Link to="/privacidade">Política de Privacidade (LGPD)</Link>
        </div>
      </footer>
    </>
  );
}
