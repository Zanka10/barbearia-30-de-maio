// Assistente de agendamento online: serviço -> barbeiro -> data/horário -> dados -> confirmação.
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CalendarCheck, CheckCircle2, Clock, Scissors, Shuffle } from 'lucide-react';
import { api, qs } from '../../lib/api.js';
import { useApi } from '../../lib/hooks.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useShop } from '../../context/ShopContext.jsx';
import { dateLong, duration, isValidPhone, maskPhone, money, onlyDigits, today } from '../../lib/format.js';
import { Avatar, ErrorBox, Field, Loading, PhoneInput, Spinner } from '../../components/ui.jsx';
import MiniCalendar from '../../components/MiniCalendar.jsx';

const STEPS = ['Serviço', 'Barbeiro', 'Data e horário', 'Seus dados', 'Confirmação'];

export default function Booking() {
  const [params] = useSearchParams();
  const { user } = useAuth();
  const { settings } = useShop();
  const { data: catalog, loading: loadingCatalog, error: catalogError } = useApi('/public/catalog');
  const { data: staffData } = useApi('/public/staff');

  const [step, setStep] = useState(0);
  const [catId, setCatId] = useState(null);
  const [serviceId, setServiceId] = useState(params.get('servico') ? Number(params.get('servico')) : null);
  const preferredStaff = params.get('barbeiro') ? Number(params.get('barbeiro')) : undefined;
  const [staffId, setStaffId] = useState(preferredStaff); // undefined = não escolhido, null = sem preferência
  const [month, setMonth] = useState(today().slice(0, 7));
  const [date, setDate] = useState(null);
  const [time, setTime] = useState(null);
  const [form, setForm] = useState({ name: '', phone: '', email: '', notes: '', consent: false, website: '' });
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(null);

  const isClient = user?.role === 'client';
  useEffect(() => {
    if (isClient) setForm((f) => ({ ...f, name: user.name, phone: maskPhone(user.phone || ''), email: user.email || '' }));
  }, [isClient, user]);

  const services = useMemo(() => (catalog?.categories || []).flatMap((c) => c.services.map((s) => ({ ...s, category_name: c.name }))), [catalog]);
  const service = services.find((s) => s.id === serviceId);
  const staff = staffData?.staff || [];
  const staffForService = service ? staff.filter((b) => service.staff_ids.includes(b.id)) : [];
  const chosenStaff = staff.find((b) => b.id === staffId);

  // Pré-seleção via URL (?servico=ID)
  useEffect(() => {
    if (!catalog || step !== 0) return;
    if (serviceId && service) {
      setCatId(catalog.categories.find((c) => c.services.some((s) => s.id === serviceId))?.id);
      if (preferredStaff && service.staff_ids.includes(preferredStaff)) setStep(2);
      else setStep(1);
    } else if (!catId && catalog.categories[0]) {
      setCatId(catalog.categories[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog]);

  const datesUrl = step >= 2 && serviceId ? `/public/available-dates${qs({ serviceId, staffId: staffId || undefined, month })}` : null;
  const { data: datesData, loading: loadingDates } = useApi(datesUrl, { keepPrevious: false });
  const availability = useMemo(() => Object.fromEntries((datesData?.dates || []).map((d) => [d.date, d])), [datesData]);

  // Seleciona automaticamente o primeiro dia disponível do mês
  useEffect(() => {
    if (!datesData || date) return;
    const first = datesData.dates.find((d) => d.available);
    if (first) setDate(first.date);
  }, [datesData, date]);

  const slotsUrl = step >= 2 && serviceId && date ? `/public/availability${qs({ serviceId, staffId: staffId || undefined, date })}` : null;
  const { data: slotsData, loading: loadingSlots, reload: reloadSlots } = useApi(slotsUrl, { keepPrevious: false });

  const visibleCats = (catalog?.categories || []).map((c) => ({
    ...c,
    services: preferredStaff ? c.services.filter((s) => s.staff_ids.includes(preferredStaff)) : c.services,
  }));
  const currentCat = visibleCats.find((c) => c.id === catId) || visibleCats[0];

  const go = (n) => {
    setStep(n);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const validateForm = () => {
    const e = {};
    if (form.name.trim().length < 2) e.name = 'Informe seu nome completo.';
    if (!isValidPhone(form.phone)) e.phone = 'Celular inválido. Ex.: (11) 91234-5678';
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'E-mail inválido.';
    if (!form.consent) e.consent = 'É necessário aceitar a Política de Privacidade.';
    setErrors(e);
    return !Object.keys(e).length;
  };

  const submit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const { appointment } = await api.post('/public/appointments', {
        serviceId,
        staffId: staffId || null,
        date,
        time,
        name: form.name.trim(),
        phone: onlyDigits(form.phone),
        email: form.email.trim() || null,
        notes: form.notes.trim() || null,
        consent: form.consent,
        website: form.website,
      });
      setDone(appointment);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setSubmitError(err);
      if (err.code === 'SLOT_TAKEN' || err.status === 409) {
        setTime(null);
        reloadSlots();
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingCatalog) return <Loading />;
  if (catalogError) {
    return (
      <div className="container" style={{ padding: '40px 20px' }}>
        <ErrorBox error={catalogError} />
      </div>
    );
  }

  if (done) {
    return (
      <div className="container" style={{ maxWidth: 620, padding: '48px 20px 80px' }}>
        <div className="card" style={{ padding: 32 }}>
          <div className="success-hero">
            <div className="success-icon">
              <CheckCircle2 />
            </div>
            <h1 style={{ fontSize: 30 }}>Agendamento realizado!</h1>
            <p className="muted" style={{ marginTop: 8 }}>
              {done.status === 'confirmed' ? 'Seu horário está confirmado.' : 'Recebemos seu agendamento e a barbearia já foi notificada.'}
            </p>
          </div>
          <div className="stack" style={{ gap: 0, marginTop: 20 }}>
            <div className="summary-line">
              <span>Serviço</span>
              <span>{done.service_name}</span>
            </div>
            <div className="summary-line">
              <span>Barbeiro</span>
              <span>{done.staff_name}</span>
            </div>
            <div className="summary-line">
              <span>Data</span>
              <span className="cap">{dateLong(done.date)}</span>
            </div>
            <div className="summary-line">
              <span>Horário</span>
              <span>
                {done.start_time} – {done.end_time}
              </span>
            </div>
            <div className="summary-line">
              <span>Status</span>
              <span>{done.status_label}</span>
            </div>
            <div className="summary-total">
              <span className="muted">Valor</span>
              <strong>{money(done.price_cents)}</strong>
            </div>
          </div>
          <div className="alert info mt">
            <div>
              Para cancelar ou consultar seus horários e histórico,{' '}
              {isClient ? (
                <Link to="/minha-conta">acesse sua área do cliente</Link>
              ) : (
                <>
                  <Link to="/cadastro">crie sua conta</Link> com o mesmo celular ({form.phone}).
                </>
              )}
            </div>
          </div>
          <div className="row wrap mt" style={{ justifyContent: 'center' }}>
            <Link to="/" className="btn btn-ghost">
              Voltar ao início
            </Link>
            <button
              className="btn btn-outline"
              onClick={() => {
                setDone(null);
                setTime(null);
                setDate(null);
                setStep(0);
              }}
            >
              Fazer outro agendamento
            </button>
          </div>
        </div>
      </div>
    );
  }

  const canGoTo = (i) => i < step;

  return (
    <div className="container">
      <div className="booking">
        <div>
          <h1 style={{ fontSize: 32, marginBottom: 6 }}>Agende seu horário</h1>
          <p className="muted" style={{ marginBottom: 24 }}>
            Simples e rápido — sem precisar de cadastro.
          </p>
          <div className="steps">
            {STEPS.map((label, i) => (
              <button
                key={label}
                type="button"
                className={`step ${i < step ? 'done' : ''} ${i === step ? 'current' : ''}`}
                onClick={() => canGoTo(i) && go(i)}
                disabled={!canGoTo(i)}
              >
                {i + 1}. {label}
              </button>
            ))}
          </div>

          {step === 0 && (
            <div className="stack lg">
              {!visibleCats.length ? (
                <div className="alert warning">Nenhum serviço disponível para agendamento no momento.</div>
              ) : (
                <>
                  <div className="chips">
                    {visibleCats
                      .filter((c) => c.services.length)
                      .map((c) => (
                        <button key={c.id} className={`chip ${currentCat?.id === c.id ? 'active' : ''}`} onClick={() => setCatId(c.id)}>
                          {c.name}
                        </button>
                      ))}
                  </div>
                  {currentCat?.description && <p className="muted small">{currentCat.description}</p>}
                  <div className="pick-grid">
                    {currentCat?.services.map((s) => (
                      <button
                        key={s.id}
                        className={`pick ${serviceId === s.id ? 'active' : ''}`}
                        onClick={() => {
                          setServiceId(s.id);
                          setTime(null);
                          setDate(null);
                          if (preferredStaff && s.staff_ids.includes(preferredStaff)) {
                            setStaffId(preferredStaff);
                            go(2);
                          } else {
                            setStaffId(undefined);
                            go(1);
                          }
                        }}
                      >
                        <span className="pick-title">{s.name}</span>
                        {s.description && <span className="small muted">{s.description}</span>}
                        <span className="pick-meta">
                          <span className="row" style={{ gap: 5 }}>
                            <Clock size={14} /> {duration(s.duration_min)}
                          </span>
                          <span className="pick-price">{money(s.price_cents)}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {step === 1 && service && (
            <div className="stack lg">
              <h3>Escolha o barbeiro</h3>
              <div className="pick-grid">
                {staffForService.length > 1 && (
                  <button
                    className={`pick ${staffId === null ? 'active' : ''}`}
                    onClick={() => {
                      setStaffId(null);
                      setDate(null);
                      setTime(null);
                      go(2);
                    }}
                  >
                    <div className="row">
                      <div className="avatar" style={{ '--size': '48px' }}>
                        <Shuffle size={20} />
                      </div>
                      <div>
                        <div className="pick-title">Sem preferência</div>
                        <div className="small muted">Primeiro horário livre com qualquer profissional</div>
                      </div>
                    </div>
                  </button>
                )}
                {staffForService.map((b) => (
                  <button
                    key={b.id}
                    className={`pick ${staffId === b.id ? 'active' : ''}`}
                    onClick={() => {
                      setStaffId(b.id);
                      setDate(null);
                      setTime(null);
                      go(2);
                    }}
                  >
                    <div className="row">
                      <Avatar name={b.name} src={b.photo_path} size={64} />
                      <div>
                        <div className="pick-title">{b.name}</div>
                        {b.specialties && <div className="small gold">{b.specialties}</div>}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
              <div>
                <button className="btn btn-ghost" onClick={() => go(0)}>
                  <ArrowLeft /> Voltar
                </button>
              </div>
            </div>
          )}

          {step === 2 && service && (
            <div className="stack lg">
              <div className="grid grid-2" style={{ alignItems: 'start' }}>
                <div className="card">
                  <MiniCalendar
                    month={month}
                    minMonth={today().slice(0, 7)}
                    onMonthChange={(m) => {
                      setMonth(m);
                      setDate(null);
                      setTime(null);
                    }}
                    availability={availability}
                    selected={date}
                    loading={loadingDates}
                    onSelect={(d) => {
                      setDate(d);
                      setTime(null);
                    }}
                  />
                  {datesData && !datesData.dates.some((d) => d.available) && (
                    <div className="alert warning mt">Sem horários disponíveis neste mês. Tente o próximo.</div>
                  )}
                </div>
                <div className="card">
                  <div className="card-title" style={{ marginBottom: 14 }}>
                    <Clock /> {date ? <span className="cap">{dateLong(date)}</span> : 'Selecione uma data'}
                  </div>
                  {!date ? (
                    <p className="small muted">Os dias com ponto dourado têm horários livres.</p>
                  ) : loadingSlots ? (
                    <Spinner />
                  ) : slotsData?.closed ? (
                    <div className="alert warning">{slotsData.closed}</div>
                  ) : !slotsData?.slots.length ? (
                    <p className="small muted">Todos os horários deste dia já foram reservados.</p>
                  ) : (
                    <div className="slots">
                      {slotsData.slots.map((s) => (
                        <button key={s.time} className={`slot ${time === s.time ? 'active' : ''}`} onClick={() => setTime(s.time)}>
                          {s.time}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              {submitError && <ErrorBox error={submitError} />}
              <div className="row between">
                <button className="btn btn-ghost" onClick={() => go(staffForService.length ? 1 : 0)}>
                  <ArrowLeft /> Voltar
                </button>
                <button
                  className="btn btn-primary"
                  disabled={!date || !time}
                  onClick={() => {
                    setSubmitError(null);
                    go(3);
                  }}
                >
                  Continuar <ArrowRight />
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <form
              className="card stack lg"
              onSubmit={(e) => {
                e.preventDefault();
                if (validateForm()) go(4);
              }}
              noValidate
            >
              <h3>Seus dados</h3>
              {isClient && <div className="alert info">Você está conectado como {user.name}. O agendamento será vinculado à sua conta.</div>}
              <div className="form-grid">
                <Field label="Nome completo *" error={errors.name}>
                  <input
                    className={`input ${errors.name ? 'invalid' : ''}`}
                    autoComplete="name"
                    value={form.name}
                    disabled={isClient}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </Field>
                <Field label="Celular (WhatsApp) *" error={errors.phone} hint="Usamos seu celular para identificar seus agendamentos.">
                  <PhoneInput value={form.phone} disabled={isClient} onChange={(phone) => setForm({ ...form, phone })} className={`input ${errors.phone ? 'invalid' : ''}`} />
                </Field>
                <Field label="E-mail (opcional)" error={errors.email} hint="Para receber a confirmação por e-mail." className="full">
                  <input className="input" type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </Field>
                <Field label="Observações (opcional)" className="full">
                  <textarea className="textarea" maxLength={300} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Algum detalhe que o barbeiro deva saber?" />
                </Field>
              </div>
              <div className="honeypot" aria-hidden="true">
                <label>
                  Website
                  <input tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
                </label>
              </div>
              <div>
                <label className="check">
                  <input type="checkbox" checked={form.consent} onChange={(e) => setForm({ ...form, consent: e.target.checked })} />
                  <span>
                    Li e concordo com a{' '}
                    <Link to="/privacidade" target="_blank">
                      Política de Privacidade
                    </Link>
                    . Autorizo o uso dos meus dados para gestão dos meus agendamentos (LGPD).
                  </span>
                </label>
                {errors.consent && <div className="error-text small" style={{ color: 'var(--danger)', marginTop: 6 }}>{errors.consent}</div>}
              </div>
              <div className="row between">
                <button type="button" className="btn btn-ghost" onClick={() => go(2)}>
                  <ArrowLeft /> Voltar
                </button>
                <button type="submit" className="btn btn-primary">
                  Revisar <ArrowRight />
                </button>
              </div>
            </form>
          )}

          {step === 4 && service && (
            <div className="card stack lg">
              <h3>Confirme seu agendamento</h3>
              <dl className="details">
                <dt>Serviço</dt>
                <dd>
                  {service.name} <span className="muted">({duration(service.duration_min)})</span>
                </dd>
                <dt>Barbeiro</dt>
                <dd>{chosenStaff?.name || 'Sem preferência (definido automaticamente)'}</dd>
                <dt>Data</dt>
                <dd className="cap">{dateLong(date)}</dd>
                <dt>Horário</dt>
                <dd>{time}</dd>
                <dt>Nome</dt>
                <dd>{form.name}</dd>
                <dt>Celular</dt>
                <dd>{form.phone}</dd>
                {form.email && (
                  <>
                    <dt>E-mail</dt>
                    <dd>{form.email}</dd>
                  </>
                )}
                <dt>Valor</dt>
                <dd className="strong gold">{money(service.price_cents)}</dd>
              </dl>
              <p className="xs muted">Pagamento realizado na barbearia (dinheiro, PIX ou cartão).</p>
              <ErrorBox error={submitError} />
              <div className="row between">
                <button className="btn btn-ghost" onClick={() => go(submitError?.status === 409 ? 2 : 3)} disabled={submitting}>
                  <ArrowLeft /> {submitError?.status === 409 ? 'Escolher outro horário' : 'Voltar'}
                </button>
                <button className="btn btn-primary btn-lg" onClick={submit} disabled={submitting}>
                  <CalendarCheck /> {submitting ? 'Agendando...' : 'Confirmar agendamento'}
                </button>
              </div>
            </div>
          )}
        </div>

        <aside className="card summary">
          <div className="card-title" style={{ marginBottom: 8 }}>
            <Scissors /> Resumo
          </div>
          <div className="summary-line">
            <span>Serviço</span>
            <span>{service?.name || '—'}</span>
          </div>
          <div className="summary-line">
            <span>Duração</span>
            <span>{service ? duration(service.duration_min) : '—'}</span>
          </div>
          <div className="summary-line">
            <span>Barbeiro</span>
            <span className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
              {chosenStaff && <Avatar name={chosenStaff.name} src={chosenStaff.photo_path} size={26} />}
              {staffId === null ? 'Sem preferência' : chosenStaff ? chosenStaff.name : '—'}
            </span>
          </div>
          <div className="summary-line">
            <span>Data</span>
            <span>{date ? date.split('-').reverse().join('/') : '—'}</span>
          </div>
          <div className="summary-line">
            <span>Horário</span>
            <span>{time || '—'}</span>
          </div>
          <div className="summary-total">
            <span className="muted">Total</span>
            <strong>{service ? money(service.price_cents) : 'R$ 0,00'}</strong>
          </div>
          {settings.min_advance_min > 0 && (
            <p className="xs muted" style={{ marginTop: 12 }}>
              Agendamentos com antecedência mínima de {settings.min_advance_min} min.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
