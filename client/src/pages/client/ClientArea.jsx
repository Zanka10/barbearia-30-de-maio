import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Banknote,
  Brush,
  CalendarCheck,
  CalendarDays,
  CalendarPlus,
  ChevronDown,
  Clock,
  CreditCard,
  Crown,
  Download,
  Droplets,
  Heart,
  History,
  KeyRound,
  Layers,
  MessageCircle,
  QrCode,
  Scissors,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  User,
  Wallet,
} from 'lucide-react';
import { api } from '../../lib/api.js';
import { useApi } from '../../lib/hooks.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useShop } from '../../context/ShopContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { Avatar, ConfirmDialog, ErrorBox, Field, Loading, StatusBadge } from '../../components/ui.jsx';
import { dateBR, dateLong, dateTimeBR, duration, minToHHMM, money, nowMinutes, parseDate, phoneBR, today, whatsappLink } from '../../lib/format.js';
import { PAYMENT } from '../../lib/constants.js';

// ---------------- Auxiliares visuais ----------------
const PAY_ICON = { cash: Banknote, pix: QrCode, debit: CreditCard, credit: CreditCard };

function categoryIcon(name = '') {
  const n = name.toLowerCase();
  if (n.includes('combo')) return Layers;
  if (n.includes('barba')) return Brush;
  if (n.includes('tratamento')) return Droplets;
  if (n.includes('especia')) return Sparkles;
  return Scissors;
}

const daysUntil = (date) => Math.round((parseDate(date) - parseDate(today())) / 86400000);
function relativeLabel(date) {
  const d = daysUntil(date);
  if (d === 0) return 'Hoje';
  if (d === 1) return 'Amanhã';
  return `Em ${d} dias`;
}

function DateTile({ date, small }) {
  const d = parseDate(date);
  const wd = d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
  const mon = d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
  return (
    <div className={`date-tile ${small ? 'sm' : ''}`} aria-label={dateLong(date)}>
      {!small && <span className="dt-wd">{wd}</span>}
      <span className="dt-day">{String(d.getDate()).padStart(2, '0')}</span>
      <span className="dt-mon">
        {mon}
        {small && d.getFullYear() !== new Date().getFullYear() ? ` ${String(d.getFullYear()).slice(2)}` : ''}
      </span>
    </div>
  );
}

function PayChip({ paid, method }) {
  if (!paid) return <span className="pay-chip pending">A pagar</span>;
  const Icon = PAY_ICON[method] || Wallet;
  return (
    <span className="pay-chip">
      <Icon /> {PAYMENT[method]}
    </span>
  );
}

function canCancel(a, cancelMinHours) {
  if (!['pending', 'confirmed'].includes(a.status)) return false;
  return daysUntil(a.date) * 1440 + a.start_min - nowMinutes() >= cancelMinHours * 60;
}

// ---------------- Próximo horário (destaque) ----------------
function NextAppointment({ appt, cancelMinHours, onCancel, shopWhatsapp }) {
  return (
    <div className="ca-next">
      <DateTile date={appt.date} />
      <div style={{ minWidth: 0 }}>
        <div className="ca-next-label">
          Seu próximo horário <span className="rel-badge">{relativeLabel(appt.date)}</span>
        </div>
        <div className="ca-next-title">{appt.service_name}</div>
        <div className="ca-next-info">
          <span>
            <Clock /> {appt.start_time} – {appt.end_time}
          </span>
          <span className="cap">
            <CalendarDays /> {dateLong(appt.date)}
          </span>
          <span>
            <Avatar name={appt.staff_name} src={appt.staff_photo} size={24} /> {appt.staff_name}
          </span>
        </div>
      </div>
      <div className="ca-next-side">
        <StatusBadge status={appt.status} />
        <div className="ca-price">{money(appt.price_cents)}</div>
        <div className="row wrap" style={{ gap: 8, justifyContent: 'flex-end' }}>
          {shopWhatsapp && (
            <a
              className="btn btn-ghost btn-sm"
              href={whatsappLink(shopWhatsapp, `Olá! Sobre meu agendamento de ${appt.service_name} em ${dateBR(appt.date)} às ${appt.start_time}.`)}
              target="_blank"
              rel="noreferrer"
            >
              <MessageCircle /> Falar com a barbearia
            </a>
          )}
          {canCancel(appt, cancelMinHours) && (
            <button className="btn btn-danger btn-sm" onClick={() => onCancel(appt)}>
              Cancelar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------- Aba: agendamentos ----------------
function AppointmentsTab({ upcoming, others, cancelMinHours, onCancel }) {
  const rest = upcoming.slice(1);
  return (
    <div className="stack lg">
      {rest.length > 0 && (
        <section className="stack">
          <h3 className="ca-section-title">Outros horários agendados</h3>
          {rest.map((a) => (
            <div key={a.id} className="appt-row">
              <DateTile date={a.date} small />
              <div className="grow">
                <div className="strong">{a.service_name}</div>
                <div className="small muted row wrap" style={{ gap: '4px 12px', marginTop: 2 }}>
                  <span className="cap">{dateLong(a.date)}</span>
                  <span>
                    {a.start_time}–{a.end_time}
                  </span>
                  <span>com {a.staff_name}</span>
                </div>
              </div>
              <div className="appt-row-side">
                <span className="strong gold">{money(a.price_cents)}</span>
                <StatusBadge status={a.status} />
                {canCancel(a, cancelMinHours) && (
                  <button className="btn btn-ghost btn-sm" onClick={() => onCancel(a)}>
                    Cancelar
                  </button>
                )}
              </div>
            </div>
          ))}
        </section>
      )}

      {upcoming.length <= 1 && !others.length && (
        <div className="ca-empty">
          <CalendarDays />
          <div className="display" style={{ fontSize: 16 }}>
            {upcoming.length ? 'Nenhum outro horário agendado' : 'Nenhum agendamento ainda'}
          </div>
          <p className="muted small">Seus próximos horários aparecerão aqui.</p>
        </div>
      )}

      {others.length > 0 && (
        <section className="stack">
          <h3 className="ca-section-title">Cancelados e anteriores</h3>
          <div className="card flush">
            {others.map((a) => (
              <div key={a.id} className="appt-row compact">
                <DateTile date={a.date} small />
                <div className="grow">
                  <div className="strong small">{a.service_name}</div>
                  <div className="xs muted">
                    {a.start_time} · com {a.staff_name}
                    {a.cancel_reason ? ` · ${a.cancel_reason}` : ''}
                  </div>
                </div>
                <StatusBadge status={a.status} />
              </div>
            ))}
          </div>
        </section>
      )}

      <p className="xs muted">
        Cancelamentos online podem ser feitos até {cancelMinHours}h antes do horário. Depois disso, fale diretamente com a barbearia.
      </p>
    </div>
  );
}

// ---------------- Aba: histórico por categoria ----------------
function CategoryGroup({ name, items }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = categoryIcon(name);
  const total = items.reduce((s, h) => s + h.price_cents, 0);
  const LIMIT = 5;
  const visible = expanded ? items : items.slice(0, LIMIT);
  return (
    <section className="cat-group">
      <header className="cat-head">
        <div className="cat-icon">
          <Icon />
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="cat-name">{name}</div>
          <div className="xs muted">
            {items.length} {items.length === 1 ? 'serviço' : 'serviços'} · último em {dateBR(items[0].date)}
          </div>
        </div>
        <div className="cat-total">
          <div className="xs muted">Total</div>
          <div className="strong gold">{money(total)}</div>
        </div>
      </header>
      <div>
        {visible.map((h) => (
          <div key={h.id} className="hist-item">
            <DateTile date={h.date} small />
            <div style={{ minWidth: 0 }}>
              <div className="strong ellipsis">{h.service_name}</div>
              <div className="xs muted">
                {minToHHMM(h.start_min)}
                {h.duration_min ? ` · ${duration(h.duration_min)}` : ''}
                <span className="hist-sub-mobile"> · {h.staff_name}</span>
              </div>
            </div>
            <div className="hist-barber">
              <Avatar name={h.staff_name} src={h.staff_photo} size={28} />
              <span className="small ellipsis">{h.staff_name}</span>
            </div>
            <div className="hist-pay">
              <PayChip paid={h.paid} method={h.payment_method} />
            </div>
            <div className="hist-value">{money(h.price_cents)}</div>
          </div>
        ))}
      </div>
      {items.length > LIMIT && (
        <button className="cat-more" onClick={() => setExpanded((e) => !e)}>
          {expanded ? 'Mostrar menos' : `Ver todos os ${items.length} serviços`}
          <ChevronDown style={{ transform: expanded ? 'rotate(180deg)' : 'none' }} />
        </button>
      )}
    </section>
  );
}

function HistoryTab({ items }) {
  const [filter, setFilter] = useState('');
  const groups = useMemo(() => {
    const map = new Map();
    for (const h of items) {
      const k = h.category_name || 'Outros';
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(h);
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [items]);

  if (!items.length) {
    return (
      <div className="ca-empty">
        <History />
        <div className="display" style={{ fontSize: 16 }}>
          Nenhum serviço realizado ainda
        </div>
        <p className="muted small">Depois do seu primeiro atendimento, o histórico aparece aqui organizado por categoria.</p>
        <Link to="/agendar" className="btn btn-primary btn-sm" style={{ marginTop: 6 }}>
          <CalendarPlus /> Agendar agora
        </Link>
      </div>
    );
  }

  const shown = filter ? groups.filter(([name]) => name === filter) : groups;
  const shownItems = shown.flatMap(([, list]) => list);
  return (
    <div className="stack lg">
      <div className="row wrap between">
        <div className="chips">
          <button className={`chip ${!filter ? 'active' : ''}`} onClick={() => setFilter('')}>
            Todas <span className="chip-count">{items.length}</span>
          </button>
          {groups.map(([name, list]) => {
            const Icon = categoryIcon(name);
            return (
              <button key={name} className={`chip ${filter === name ? 'active' : ''}`} onClick={() => setFilter(name)}>
                <Icon /> {name} <span className="chip-count">{list.length}</span>
              </button>
            );
          })}
        </div>
        <div className="small muted">
          {shownItems.length} {shownItems.length === 1 ? 'serviço' : 'serviços'} ·{' '}
          <strong className="gold">{money(shownItems.reduce((s, h) => s + h.price_cents, 0))}</strong>
        </div>
      </div>
      {shown.map(([name, list]) => (
        <CategoryGroup key={name} name={name} items={list} />
      ))}
    </div>
  );
}

// ---------------- Aba: minha conta ----------------
function AccountTab({ summary }) {
  const { user, setUser, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [profile, setProfile] = useState({ name: user.name, email: user.email || '' });
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [err, setErr] = useState(null);
  const [pwErr, setPwErr] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [delPassword, setDelPassword] = useState('');

  return (
    <div className="grid grid-2" style={{ alignItems: 'start' }}>
      <form
        className="card stack"
        onSubmit={async (e) => {
          e.preventDefault();
          setErr(null);
          try {
            const { user: u } = await api.put('/auth/profile', profile);
            setUser(u);
            toast.success('Dados atualizados.');
          } catch (er) {
            setErr(er);
          }
        }}
      >
        <div className="ca-card-title">
          <span className="stat-icon sm">
            <User />
          </span>
          Meus dados
        </div>
        <Field label="Nome">
          <input className="input" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
        </Field>
        <Field label="Celular" hint="Para alterar o celular, fale com a barbearia.">
          <input className="input" value={phoneBR(user.phone)} disabled />
        </Field>
        <Field label="E-mail" hint="Usado para receber confirmações dos seus agendamentos.">
          <input className="input" type="email" value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} />
        </Field>
        <ErrorBox error={err} />
        <button className="btn btn-primary" style={{ alignSelf: 'flex-start' }}>
          Salvar alterações
        </button>
        <div className="xs muted">
          Cliente desde {dateTimeBR(summary.client.created_at).slice(0, 10)}
          {summary.client.consent_at && ` · consentimento LGPD registrado em ${dateTimeBR(summary.client.consent_at)}`}
        </div>
      </form>

      <div className="stack lg">
        <form
          className="card stack"
          onSubmit={async (e) => {
            e.preventDefault();
            setPwErr(null);
            try {
              await api.post('/auth/change-password', pw);
              setPw({ currentPassword: '', newPassword: '' });
              toast.success('Senha alterada.');
            } catch (er) {
              setPwErr(er);
            }
          }}
        >
          <div className="ca-card-title">
            <span className="stat-icon sm">
              <KeyRound />
            </span>
            Alterar senha
          </div>
          <Field label="Senha atual">
            <input className="input" type="password" autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} />
          </Field>
          <Field label="Nova senha" hint="Mínimo 8 caracteres, com letras e números.">
            <input className="input" type="password" autoComplete="new-password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} />
          </Field>
          <ErrorBox error={pwErr} />
          <button className="btn" style={{ alignSelf: 'flex-start' }}>
            Alterar senha
          </button>
        </form>

        <div className="card stack">
          <div className="ca-card-title">
            <span className="stat-icon sm">
              <ShieldCheck />
            </span>
            Privacidade e dados (LGPD)
          </div>
          <p className="small muted">
            Você pode baixar uma cópia de todos os seus dados ou solicitar a exclusão da sua conta a qualquer momento.{' '}
            <Link to="/privacidade">Política de Privacidade</Link>
          </p>
          <div className="row wrap">
            <a className="btn btn-sm" href="/api/me/export" download>
              <Download /> Exportar meus dados
            </a>
            <button className="btn btn-sm btn-danger" onClick={() => setDeleting(true)}>
              <Trash2 /> Excluir minha conta
            </button>
          </div>
        </div>
      </div>

      {deleting && (
        <ConfirmDialog
          title="Excluir minha conta"
          danger
          confirmLabel="Excluir definitivamente"
          message="Seus dados pessoais serão removidos e seus agendamentos futuros cancelados. Registros financeiros são mantidos de forma anônima, conforme exigido por lei. Esta ação não pode ser desfeita."
          onClose={() => setDeleting(false)}
          onConfirm={async () => {
            await api.post('/me/delete-account', { password: delPassword });
            await logout().catch(() => {});
            navigate('/');
          }}
        >
          <Field label="Confirme sua senha">
            <input className="input" type="password" value={delPassword} onChange={(e) => setDelPassword(e.target.value)} />
          </Field>
        </ConfirmDialog>
      )}
    </div>
  );
}

// ---------------- Página ----------------
function mostFrequent(items, key) {
  const counts = new Map();
  for (const it of items) {
    const k = it[key];
    if (!k) continue;
    if (!counts.has(k)) counts.set(k, { n: 0, item: it });
    counts.get(k).n++;
  }
  return [...counts.values()].sort((a, b) => b.n - a.n)[0] || null;
}

function StatCard({ icon: Icon, label, value, sub, highlight, avatar }) {
  return (
    <div className={`stat-card ${highlight ? 'highlight' : ''}`}>
      {avatar || (
        <div className="stat-icon">
          <Icon />
        </div>
      )}
      <div style={{ minWidth: 0 }}>
        <div className="stat-label">{label}</div>
        <div className="stat-value ellipsis">{value}</div>
        {sub && <div className="stat-sub ellipsis">{sub}</div>}
      </div>
    </div>
  );
}

export default function ClientArea() {
  const { user } = useAuth();
  const { settings } = useShop();
  const toast = useToast();
  const summaryQ = useApi('/me/summary');
  const apptsQ = useApi('/me/appointments');
  const historyQ = useApi('/me/history');
  const [tab, setTab] = useState('appointments');
  const [cancelling, setCancelling] = useState(null);
  const [reason, setReason] = useState('');

  const { upcoming, others } = useMemo(() => {
    const items = apptsQ.data?.items || [];
    const t = today();
    const up = items
      .filter((a) => a.date >= t && ['pending', 'confirmed', 'in_service'].includes(a.status))
      .sort((a, b) => (a.date === b.date ? a.start_min - b.start_min : a.date.localeCompare(b.date)));
    const rest = items.filter((a) => !up.includes(a) && a.status !== 'completed');
    return { upcoming: up, others: rest };
  }, [apptsQ.data]);

  const history = historyQ.data?.items || [];
  const favService = useMemo(() => mostFrequent(history, 'service_name'), [history]);
  const favBarber = useMemo(() => mostFrequent(history, 'staff_name'), [history]);

  const loading = (!summaryQ.data && summaryQ.loading) || (!apptsQ.data && apptsQ.loading) || (!historyQ.data && historyQ.loading);
  const error = summaryQ.error || apptsQ.error || historyQ.error;
  if (loading) return <Loading />;
  if (error || !summaryQ.data) {
    return (
      <div className="container" style={{ padding: '40px 20px' }}>
        <ErrorBox
          error={error || new Error('Não foi possível carregar seus dados.')}
          onRetry={() => {
            summaryQ.reload();
            apptsQ.reload();
            historyQ.reload();
          }}
        />
      </div>
    );
  }

  const summary = summaryQ.data;
  const stats = summary.stats;
  const since = parseDate(summary.client.created_at.slice(0, 10)).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const cancelMinHours = summary.cancelMinHours;

  return (
    <div className="container ca">
      <div className="stack lg">
        {/* Cabeçalho */}
        <section className="ca-hero">
          <div className="ca-hero-id">
            <Avatar name={user.name} size={68} />
            <div style={{ minWidth: 0 }}>
              <span className="eyebrow">Área do cliente</span>
              <h1>Olá, {user.name.split(' ')[0]}!</h1>
              <div className="ca-meta">
                <span>
                  <Crown /> Cliente desde {since}
                </span>
                <span>
                  <Scissors /> {stats.services_count} {stats.services_count === 1 ? 'visita' : 'visitas'}
                </span>
              </div>
            </div>
          </div>
          <div className="ca-hero-actions">
            {settings.shop_whatsapp && (
              <a className="btn btn-outline" href={whatsappLink(settings.shop_whatsapp)} target="_blank" rel="noreferrer">
                <MessageCircle /> WhatsApp
              </a>
            )}
            <Link to="/agendar" className="btn btn-primary">
              <CalendarPlus /> Agendar horário
            </Link>
          </div>
        </section>

        {/* Próximo horário */}
        {upcoming[0] ? (
          <NextAppointment appt={upcoming[0]} cancelMinHours={cancelMinHours} onCancel={setCancelling} shopWhatsapp={settings.shop_whatsapp} />
        ) : (
          <div className="ca-next empty">
            <div className="stat-icon lg">
              <CalendarCheck />
            </div>
            <div>
              <div className="ca-next-title" style={{ margin: 0 }}>
                Nenhum horário marcado
              </div>
              <p className="muted small">
                {favService ? `Que tal repetir: ${favService.item.service_name}?` : 'Escolha o serviço e o melhor horário para você.'}
              </p>
            </div>
            <Link to="/agendar" className="btn btn-primary">
              <CalendarPlus /> Agendar agora
            </Link>
          </div>
        )}

        {/* Indicadores */}
        <div className="ca-stats">
          <StatCard
            icon={Scissors}
            label="Visitas"
            value={stats.services_count}
            sub={stats.last_visit ? `Última em ${dateBR(stats.last_visit)}` : 'Nenhuma ainda'}
          />
          <StatCard icon={Wallet} label="Total investido" value={money(stats.total_spent_cents)} sub="em serviços pagos" highlight />
          <StatCard
            icon={Heart}
            label="Serviço favorito"
            value={favService ? favService.item.service_name : '—'}
            sub={favService ? `${favService.n}× realizado` : 'Ainda sem histórico'}
          />
          <StatCard
            icon={Star}
            label="Barbeiro preferido"
            value={favBarber ? favBarber.item.staff_name : '—'}
            sub={favBarber ? `${favBarber.n} atendimento(s)` : 'Ainda sem histórico'}
            avatar={favBarber ? <Avatar name={favBarber.item.staff_name} src={favBarber.item.staff_photo} size={44} /> : null}
          />
        </div>

        {/* Abas */}
        <div className="seg" role="tablist">
          <button role="tab" aria-selected={tab === 'appointments'} className={tab === 'appointments' ? 'active' : ''} onClick={() => setTab('appointments')}>
            <CalendarDays /> Agendamentos <span className="count">{upcoming.length}</span>
          </button>
          <button role="tab" aria-selected={tab === 'history'} className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>
            <History /> <span className="seg-long">Histórico de serviços</span>
            <span className="seg-short">Histórico</span> <span className="count">{history.length}</span>
          </button>
          <button role="tab" aria-selected={tab === 'account'} className={tab === 'account' ? 'active' : ''} onClick={() => setTab('account')}>
            <User /> Minha conta
          </button>
        </div>

        {tab === 'appointments' && <AppointmentsTab upcoming={upcoming} others={others} cancelMinHours={cancelMinHours} onCancel={setCancelling} />}
        {tab === 'history' && <HistoryTab items={history} />}
        {tab === 'account' && <AccountTab summary={summary} />}
      </div>

      {cancelling && (
        <ConfirmDialog
          title="Cancelar agendamento"
          danger
          confirmLabel="Cancelar agendamento"
          message={`${cancelling.service_name} em ${dateBR(cancelling.date)} às ${cancelling.start_time} com ${cancelling.staff_name}.`}
          onClose={() => {
            setCancelling(null);
            setReason('');
          }}
          onConfirm={async () => {
            await api.post(`/me/appointments/${cancelling.id}/cancel`, { reason });
            toast.success('Agendamento cancelado. A barbearia foi avisada.');
            apptsQ.reload();
            summaryQ.reload();
          }}
        >
          <Field label="Motivo (opcional)">
            <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} />
          </Field>
        </ConfirmDialog>
      )}
    </div>
  );
}
