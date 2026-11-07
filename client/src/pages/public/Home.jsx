import { Link } from 'react-router-dom';
import {
  AtSign,
  CalendarCheck,
  CalendarPlus,
  Clock,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Scissors,
  ShieldCheck,
  Smartphone,
  User,
  UserCheck,
} from 'lucide-react';
import { useApi } from '../../lib/hooks.js';
import { useShop } from '../../context/ShopContext.jsx';
import { Avatar, BrandMark, Loading } from '../../components/ui.jsx';
import { WEEKDAYS } from '../../lib/constants.js';
import { dateBR, duration, minToHHMM, money, whatsappLink } from '../../lib/format.js';

const pad = (n) => String(n).padStart(2, '0');
const localDateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Situação atual da barbearia (aberta/fechada/pausa) a partir do expediente e feriados. */
function openStatus(hours, holidays) {
  if (!hours?.length) return null;
  const now = new Date();
  const min = now.getHours() * 60 + now.getMinutes();
  const today = hours.find((h) => h.weekday === now.getDay());
  const holiday = holidays?.find((h) => h.date === localDateStr(now));
  if (holiday) return { open: false, label: `Fechado hoje · ${holiday.name}` };
  if (!today?.is_open) return { open: false, label: 'Fechado hoje' };
  if (min < today.open_min) return { open: false, label: `Abre hoje às ${minToHHMM(today.open_min)}` };
  if (min >= today.close_min) return { open: false, label: 'Fechado agora' };
  if (today.break_start_min != null && min >= today.break_start_min && min < today.break_end_min)
    return { open: false, label: `Em pausa · volta às ${minToHHMM(today.break_end_min)}` };
  return { open: true, label: `Aberto agora · até ${minToHHMM(today.close_min)}` };
}

function HoursList({ hours }) {
  const todayWd = new Date().getDay();
  const order = [1, 2, 3, 4, 5, 6, 0];
  return (
    <div className="hours-list">
      {order.map((wd) => {
        const h = hours.find((x) => x.weekday === wd);
        return (
          <div key={wd} className={`row ${wd === todayWd ? 'today' : ''}`}>
            <span>{WEEKDAYS[wd]}</span>
            <span className="nowrap">
              {!h || !h.is_open ? (
                <span className="muted">Fechado</span>
              ) : (
                <>
                  {minToHHMM(h.open_min)} – {minToHHMM(h.close_min)}
                  {h.break_start_min != null && <span className="muted xs"> (pausa {minToHHMM(h.break_start_min)}–{minToHHMM(h.break_end_min)})</span>}
                </>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

const STEPS = [
  { icon: Scissors, title: 'Escolha o serviço', text: 'Corte, barba, combos ou tratamentos — com preço e duração à vista.' },
  { icon: UserCheck, title: 'Barbeiro e horário', text: 'Veja só os horários realmente livres e escolha com quem quer cortar.' },
  { icon: CalendarCheck, title: 'Confirme em segundos', text: 'Informe nome e celular. Acompanhe ou cancele pela área do cliente.' },
];

export default function Home() {
  const { settings: s, hours, holidays } = useShop();
  const { data: catalog, loading } = useApi('/public/catalog');
  const { data: team } = useApi('/public/staff');
  const status = openStatus(hours, holidays);

  return (
    <>
      <section className="hero">
        <div className="container">
          <div className="hero-main">
            <div className="hero-logo">
              <BrandMark height={150} />
              <div className="hero-wordmark">
                <h1>Barbearia</h1>
                <span>Trinta de Maio</span>
              </div>
            </div>
            <p className="lead">{s.shop_tagline || 'Tradição, estilo e precisão em cada corte.'}</p>
            <div className="hero-actions">
              <Link to="/agendar" className="btn btn-primary btn-lg">
                <CalendarPlus /> Agendar horário
              </Link>
              <Link to="/minha-conta" className="btn btn-outline btn-lg">
                <User /> Meus agendamentos
              </Link>
            </div>
            <ul className="hero-perks">
              <li>
                <Smartphone /> Agendamento online 24h
              </li>
              <li>
                <CalendarCheck /> Confirmação na hora
              </li>
              <li>
                <ShieldCheck /> Seus dados protegidos (LGPD)
              </li>
            </ul>
          </div>
          <div className="hero-card">
            <div className="row between" style={{ marginBottom: 16 }}>
              <div className="card-title" style={{ margin: 0 }}>
                <Clock /> Horário de funcionamento
              </div>
            </div>
            {status && (
              <div className={`open-status ${status.open ? 'is-open' : ''}`}>
                <span className="dot" /> {status.label}
              </div>
            )}
            <HoursList hours={hours} />
            {holidays?.length > 0 && (
              <div className="xs muted" style={{ marginTop: 14 }}>
                Fechado em: {holidays.slice(0, 3).map((h) => `${dateBR(h.date)} (${h.name})`).join(', ')}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="section" id="servicos">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">Serviços</span>
            <h2>Serviços e preços</h2>
            <p>Escolha o serviço, o profissional e o melhor horário. Confirmação imediata.</p>
          </div>
          {loading ? (
            <Loading />
          ) : !catalog?.categories.length ? (
            <div className="soon-card">
              <BrandMark height={56} />
              <div className="display">Em breve</div>
              <p className="muted">Estamos preparando nossa tabela de serviços para o agendamento online. Volte em breve!</p>
            </div>
          ) : (
            <>
              {catalog.categories.map((cat) => (
                <div key={cat.id} className="service-cat">
                  <h3>{cat.name}</h3>
                  <div className="service-list">
                    {cat.services.map((svc) => (
                      <Link key={svc.id} to={`/agendar?servico=${svc.id}`} className="service-line">
                        <div className="grow">
                          <div className="name">{svc.name}</div>
                          <div className="desc">
                            {svc.description ? `${svc.description} · ` : ''}
                            {duration(svc.duration_min)}
                          </div>
                        </div>
                        <div className="price">{money(svc.price_cents)}</div>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
              <div className="center mt-lg">
                <Link to="/agendar" className="btn btn-primary btn-lg">
                  <Scissors /> Agendar agora
                </Link>
              </div>
            </>
          )}
        </div>
      </section>

      <section className="section alt" id="como-funciona">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">Como funciona</span>
            <h2>Seu horário em 3 passos</h2>
            <p>Sem ligação, sem espera: agende pelo celular a qualquer hora do dia.</p>
          </div>
          <div className="steps-grid">
            {STEPS.map(({ icon: Icon, title, text }, i) => (
              <div key={title} className="how-step">
                <div className="how-num">{pad(i + 1)}</div>
                <Icon className="how-icon" />
                <div className="how-title">{title}</div>
                <p className="muted small">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {team?.staff?.length > 0 && (
        <section className="section" id="equipe">
          <div className="container">
            <div className="section-head">
              <span className="eyebrow">Equipe</span>
              <h2>Nossos barbeiros</h2>
              <p>Profissionais experientes, prontos para cuidar do seu visual.</p>
            </div>
            <div className="grid grid-auto">
              {team.staff.map((b) => (
                <div key={b.id} className="team-card">
                  <Avatar name={b.name} src={b.photo_path} size={96} />
                  <div className="display" style={{ fontSize: 15 }}>
                    {b.name}
                  </div>
                  {b.specialties && <div className="small gold">{b.specialties}</div>}
                  {b.bio && <p className="small muted">{b.bio}</p>}
                  <Link to={`/agendar?barbeiro=${b.id}`} className="btn btn-outline btn-sm" style={{ marginTop: 6 }}>
                    Agendar com {b.name.split(' ')[0]}
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className={`section ${team?.staff?.length > 0 ? 'alt' : ''}`} id="contato">
        <div className="container grid grid-2" style={{ alignItems: 'start' }}>
          <div className="stack lg">
            <div>
              <span className="eyebrow">Contato</span>
              <h2 className="contact-title">Venha nos visitar</h2>
            </div>
            {s.shop_address && (
              <div className="contact-item">
                <MapPin />
                <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.shop_address)}`} target="_blank" rel="noreferrer">
                  {s.shop_address}
                </a>
              </div>
            )}
            {s.shop_phone && (
              <div className="contact-item">
                <Phone />
                <a href={`tel:${s.shop_phone}`}>{s.shop_phone}</a>
              </div>
            )}
            {s.shop_whatsapp && (
              <div className="contact-item">
                <MessageCircle />
                <a href={whatsappLink(s.shop_whatsapp)} target="_blank" rel="noreferrer">
                  WhatsApp: {s.shop_whatsapp}
                </a>
              </div>
            )}
            {s.shop_email && (
              <div className="contact-item">
                <Mail />
                <a href={`mailto:${s.shop_email}`}>{s.shop_email}</a>
              </div>
            )}
            {s.shop_instagram && (
              <div className="contact-item">
                <AtSign />
                <a href={`https://instagram.com/${s.shop_instagram.replace('@', '')}`} target="_blank" rel="noreferrer">
                  {s.shop_instagram}
                </a>
              </div>
            )}
            {!s.shop_address && !s.shop_phone && !s.shop_whatsapp && <p className="muted">Agende online a qualquer hora pelo botão ao lado.</p>}
          </div>
          <div className="cta-card">
            <BrandMark height={64} className="cta-mark" />
            <div className="display cta-title">Pronto para o próximo corte?</div>
            <p className="muted" style={{ marginBottom: 22 }}>
              Agende em menos de um minuto. Você recebe a confirmação na hora e acompanha seus horários na área do cliente.
            </p>
            <Link to="/agendar" className="btn btn-primary btn-block btn-lg">
              <CalendarPlus /> Agendar horário
            </Link>
          </div>
        </div>
      </section>

      <div className="mobile-cta">
        <Link to="/agendar" className="btn btn-primary btn-block btn-lg">
          <CalendarPlus /> Agendar horário
        </Link>
      </div>
    </>
  );
}
