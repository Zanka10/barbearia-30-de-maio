import { useEffect, useState } from 'react';
import { CalendarCog, Database, Download, Mail, ScrollText, Store } from 'lucide-react';
import { api, qs } from '../../lib/api.js';
import { useApi } from '../../lib/hooks.js';
import { useShop } from '../../context/ShopContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { Empty, ErrorBox, Field, Loading, PageHeader, Pagination, Switch } from '../../components/ui.jsx';
import { dateTimeBR } from '../../lib/format.js';

function GeneralSettings() {
  const toast = useToast();
  const shop = useShop();
  const { data, loading, error, reload } = useApi('/admin/settings');
  const [f, setF] = useState(null);
  const [saveErr, setSaveErr] = useState(null);

  useEffect(() => {
    if (!data) return;
    const s = data.settings;
    setF({
      shop_name: s.shop_name || '',
      shop_tagline: s.shop_tagline || '',
      shop_phone: s.shop_phone || '',
      shop_whatsapp: s.shop_whatsapp || '',
      shop_email: s.shop_email || '',
      shop_address: s.shop_address || '',
      shop_instagram: s.shop_instagram || '',
      slot_interval_min: Number(s.slot_interval_min || 15),
      booking_window_days: Number(s.booking_window_days || 60),
      min_advance_min: Number(s.min_advance_min || 0),
      client_cancel_min_hours: Number(s.client_cancel_min_hours || 0),
      auto_confirm: s.auto_confirm === '1',
      notify_admin_email: s.notify_admin_email === '1',
      notify_client_email: s.notify_client_email === '1',
      privacy_contact: s.privacy_contact || '',
    });
  }, [data]);

  if (loading && !f) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!f) return null;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const save = async (e) => {
    e.preventDefault();
    setSaveErr(null);
    try {
      await api.put('/admin/settings', f);
      toast.success('Configurações salvas.');
      shop.reload();
      reload();
    } catch (err) {
      setSaveErr(err);
    }
  };

  return (
    <form className="stack lg" onSubmit={save}>
      <div className="card stack">
        <div className="card-title">
          <Store /> Dados da barbearia
        </div>
        <div className="form-grid">
          <Field label="Nome da barbearia *">
            <input className="input" value={f.shop_name} onChange={set('shop_name')} />
          </Field>
          <Field label="Slogan">
            <input className="input" value={f.shop_tagline} onChange={set('shop_tagline')} />
          </Field>
          <Field label="Endereço" className="full">
            <input className="input" value={f.shop_address} onChange={set('shop_address')} />
          </Field>
          <Field label="Telefone">
            <input className="input" value={f.shop_phone} onChange={set('shop_phone')} />
          </Field>
          <Field label="WhatsApp">
            <input className="input" value={f.shop_whatsapp} onChange={set('shop_whatsapp')} placeholder="(11) 91234-5678" />
          </Field>
          <Field label="E-mail">
            <input className="input" type="email" value={f.shop_email} onChange={set('shop_email')} />
          </Field>
          <Field label="Instagram">
            <input className="input" value={f.shop_instagram} onChange={set('shop_instagram')} placeholder="@suabarbearia" />
          </Field>
        </div>
      </div>

      <div className="card stack">
        <div className="card-title">
          <CalendarCog /> Agendamento online
        </div>
        <div className="form-grid">
          <Field label="Intervalo entre horários oferecidos" hint="Ex.: a cada 15 min → 09:00, 09:15, 09:30...">
            <select className="select" value={f.slot_interval_min} onChange={(e) => setF({ ...f, slot_interval_min: Number(e.target.value) })}>
              {[5, 10, 15, 20, 30, 60].map((v) => (
                <option key={v} value={v}>
                  {v} minutos
                </option>
              ))}
            </select>
          </Field>
          <Field label="Agendar com até quantos dias de antecedência">
            <input className="input" type="number" min={1} max={365} value={f.booking_window_days} onChange={set('booking_window_days')} />
          </Field>
          <Field label="Antecedência mínima (minutos)" hint="Evita agendamentos em cima da hora.">
            <input className="input" type="number" min={0} value={f.min_advance_min} onChange={set('min_advance_min')} />
          </Field>
          <Field label="Cliente pode cancelar online até (horas antes)">
            <input className="input" type="number" min={0} max={168} value={f.client_cancel_min_hours} onChange={set('client_cancel_min_hours')} />
          </Field>
          <div className="full">
            <Switch
              checked={f.auto_confirm}
              onChange={(v) => setF({ ...f, auto_confirm: v })}
              label="Confirmar automaticamente os agendamentos online (senão, entram como Pendentes)"
            />
          </div>
        </div>
      </div>

      <div className="card stack">
        <div className="card-title">
          <Mail /> Notificações por e-mail
        </div>
        {!data.mailEnabled && (
          <div className="alert warning">
            SMTP não configurado: os e-mails estão sendo apenas registrados no log abaixo. Configure SMTP_HOST, SMTP_USER e SMTP_PASS no arquivo .env do servidor.
          </div>
        )}
        <p className="small muted">O barbeiro responsável sempre recebe e-mail de novos agendamentos, alterações e cancelamentos.</p>
        <Switch checked={f.notify_admin_email} onChange={(v) => setF({ ...f, notify_admin_email: v })} label="Enviar também para os administradores" />
        <Switch checked={f.notify_client_email} onChange={(v) => setF({ ...f, notify_client_email: v })} label="Enviar confirmação ao cliente (quando informar e-mail)" />
        <div>
          <button
            type="button"
            className="btn btn-sm"
            onClick={async () => {
              try {
                const r = await api.post('/admin/settings/test-email');
                toast.success(`E-mail de teste ${r.mailEnabled ? 'enviado' : 'registrado no log'} para ${r.to}.`);
              } catch (err) {
                toast.error(err);
              }
            }}
          >
            Enviar e-mail de teste
          </button>
        </div>
      </div>

      <div className="card stack">
        <div className="card-title">LGPD</div>
        <Field label="Contato do encarregado de dados (exibido na Política de Privacidade)">
          <input className="input" value={f.privacy_contact} onChange={set('privacy_contact')} placeholder="E-mail ou telefone" />
        </Field>
      </div>

      <ErrorBox error={saveErr} />
      <div>
        <button className="btn btn-primary btn-lg">Salvar configurações</button>
      </div>
    </form>
  );
}

function Backups() {
  const toast = useToast();
  const { data, loading, error, reload } = useApi('/admin/backups');
  const [busy, setBusy] = useState(false);
  return (
    <div className="card flush">
      <div className="card-header" style={{ padding: '18px 20px 0' }}>
        <div>
          <div className="card-title">
            <Database /> Backups do banco de dados
          </div>
          <p className="xs muted" style={{ marginTop: 4 }}>
            Backups automáticos diários (os 14 mais recentes são mantidos). Guarde cópias fora do servidor periodicamente.
          </p>
        </div>
        <button
          className="btn btn-primary btn-sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await api.post('/admin/backups');
              toast.success('Backup criado.');
              reload();
            } catch (err) {
              toast.error(err);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? 'Gerando...' : 'Gerar backup agora'}
        </button>
      </div>
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <ErrorBox error={error} />
      ) : !data.items.length ? (
        <Empty title="Nenhum backup ainda" />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Arquivo</th>
                <th>Tipo</th>
                <th>Data</th>
                <th className="num">Tamanho</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.items.map((b) => (
                <tr key={b.name}>
                  <td className="small">{b.name}</td>
                  <td>
                    <span className={`badge plain ${b.auto ? 'muted' : 'gold'}`}>{b.auto ? 'Automático' : 'Manual'}</span>
                  </td>
                  <td className="nowrap">{dateTimeBR(b.created_at)}</td>
                  <td className="num">{(b.size / 1024).toFixed(0)} KB</td>
                  <td>
                    <div className="actions">
                      <a className="icon-btn" href={`/api/admin/backups/${encodeURIComponent(b.name)}`} title="Baixar" download>
                        <Download />
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function EmailLog() {
  const { data, loading } = useApi('/admin/email-log');
  if (loading && !data) return <Loading />;
  return (
    <div className="card flush">
      {!data?.items.length ? (
        <Empty icon={Mail} title="Nenhum e-mail registrado" />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Para</th>
                <th>Assunto</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((e) => (
                <tr key={e.id}>
                  <td className="nowrap small">{dateTimeBR(e.created_at)}</td>
                  <td className="small">{e.to_address}</td>
                  <td className="small">{e.subject}</td>
                  <td>
                    <span className={`badge ${e.status === 'sent' ? 'success' : e.status === 'failed' ? 'danger' : 'muted'}`} title={e.error || ''}>
                      {e.status === 'sent' ? 'Enviado' : e.status === 'failed' ? 'Falhou' : 'Registrado (sem SMTP)'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const ACTION_LABELS = {
  'auth.login': 'Login',
  'auth.logout': 'Logout',
  'auth.login_failed': 'Falha de login',
  'auth.register': 'Cadastro de cliente',
  'auth.password_changed': 'Senha alterada',
  'client.view': 'Visualizou cliente',
  'client.create': 'Cadastrou cliente',
  'client.update': 'Editou cliente',
  'client.delete': 'Excluiu cliente',
  'lgpd.anonymize': 'Anonimizou cliente (LGPD)',
  'lgpd.export': 'Exportou dados (LGPD)',
  'lgpd.delete_account': 'Excluiu conta (LGPD)',
  'finance.update': 'Alterou financeiro',
  'finance.export': 'Exportou financeiro',
  'settings.update': 'Alterou configurações',
  'backup.create': 'Gerou backup',
  'backup.download': 'Baixou backup',
};

function AuditLog() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const { data, loading } = useApi(`/admin/audit${qs({ page, pageSize: 50, action })}`);
  return (
    <div className="stack">
      <div className="chips">
        {[
          ['', 'Tudo'],
          ['auth', 'Acessos'],
          ['appointment', 'Agendamentos'],
          ['client', 'Clientes'],
          ['lgpd', 'LGPD'],
          ['finance', 'Financeiro'],
          ['staff', 'Funcionários'],
        ].map(([k, l]) => (
          <button
            key={k}
            className={`chip ${action === k ? 'active' : ''}`}
            onClick={() => {
              setAction(k);
              setPage(1);
            }}
          >
            {l}
          </button>
        ))}
      </div>
      <div className="card flush">
        {loading && !data ? (
          <Loading />
        ) : !data?.items.length ? (
          <Empty icon={ScrollText} title="Sem registros" />
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Usuário</th>
                    <th>Ação</th>
                    <th>Registro</th>
                    <th className="hide-xs">IP</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((l) => (
                    <tr key={l.id}>
                      <td className="nowrap small">{dateTimeBR(l.created_at)}</td>
                      <td className="small">{l.user_name || <span className="muted">—</span>}</td>
                      <td className="small">{ACTION_LABELS[l.action] || l.action}</td>
                      <td className="small muted">{l.entity ? `${l.entity}${l.entity_id ? ` #${l.entity_id}` : ''}` : '—'}</td>
                      <td className="small muted hide-xs">{l.ip}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={50} total={data.total} onChange={setPage} />
          </>
        )}
      </div>
    </div>
  );
}

export default function Settings() {
  const [tab, setTab] = useState('general');
  const tabs = [
    ['general', 'Geral'],
    ['backups', 'Backups'],
    ['emails', 'E-mails enviados'],
    ['audit', 'Auditoria'],
  ];
  return (
    <div>
      <PageHeader title="Configurações" description="Dados da barbearia, regras de agendamento, notificações, backups e auditoria." />
      <div className="tabs">
        {tabs.map(([k, l]) => (
          <button key={k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </div>
      {tab === 'general' && <GeneralSettings />}
      {tab === 'backups' && <Backups />}
      {tab === 'emails' && <EmailLog />}
      {tab === 'audit' && <AuditLog />}
    </div>
  );
}
