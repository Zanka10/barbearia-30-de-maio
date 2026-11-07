// Testes de integração da API (banco temporário isolado). Execute: npm test
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'barbearia-test-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.BACKUP_DIR = path.join(tmp, 'backups');
process.env.UPLOAD_DIR = path.join(tmp, 'uploads');
process.env.ADMIN_EMAIL = 'admin@test.local';
process.env.ADMIN_PASSWORD = 'admin12345';
process.env.NODE_ENV = 'test';

const { migrate, run, one, db } = await import('../src/db/index.js');
const { ensureAdmin } = await import('../src/db/bootstrap.js');
const { createApp } = await import('../src/app.js');
const { hashPassword } = await import('../src/utils/password.js');
const { addDays, todayStr, weekdayOf } = await import('../src/utils/time.js');

let server;
let BASE;

function session() {
  let cookie = '';
  return async (method, url, body) => {
    const r = await fetch(BASE + '/api' + url, {
      method,
      headers: { 'content-type': 'application/json', 'x-requested-with': 'fetch', cookie },
      body: body ? JSON.stringify(body) : undefined,
    });
    const sc = r.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    return { status: r.status, data: await r.json().catch(() => null) };
  };
}

/** Próxima data (a partir de amanhã+1) em que a barbearia abre (seg–sáb no padrão). */
function nextOpenDate() {
  let d = addDays(todayStr(), 2);
  while (weekdayOf(d) === 0) d = addDays(d, 1);
  return d;
}

let serviceId;
let barberA;
let barberB;
const pub = session();
const admin = session();
const barber = session();

before(async () => {
  migrate();
  await ensureAdmin();
  const { id: catId } = run("INSERT INTO categories (name) VALUES ('Cortes')");
  serviceId = run('INSERT INTO services (category_id, name, price_cents, duration_min) VALUES (?, ?, ?, ?)', [catId, 'Corte', 5000, 30]).id;
  const pass = await hashPassword('barbeiro123');
  for (const [name, email, phone] of [
    ['Barbeiro A', 'a@test.local', '11900000001'],
    ['Barbeiro B', 'b@test.local', '11900000002'],
  ]) {
    const { id: userId } = run("INSERT INTO users (name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, 'barber')", [name, email, phone, pass]);
    const { id } = run('INSERT INTO staff (user_id) VALUES (?)', [userId]);
    run('INSERT INTO staff_services (staff_id, service_id) VALUES (?, ?)', [id, serviceId]);
    if (!barberA) barberA = id;
    else barberB = id;
  }
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  BASE = `http://127.0.0.1:${server.address().port}`;
  await admin('POST', '/auth/login', { identifier: 'admin@test.local', password: 'admin12345' });
  await barber('POST', '/auth/login', { identifier: 'a@test.local', password: 'barbeiro123' });
});

after(() => {
  server?.close();
  db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('agendamento online', () => {
  const date = nextOpenDate();
  const book = (extra) =>
    pub('POST', '/public/appointments', { serviceId, staffId: barberA, date, time: '10:00', name: 'Cliente Um', phone: '(11) 98888-1111', consent: true, ...extra });

  test('lista horários respeitando expediente e intervalo de almoço', async () => {
    const r = await pub('GET', `/public/availability?serviceId=${serviceId}&staffId=${barberA}&date=${date}`);
    assert.equal(r.status, 200);
    const times = r.data.slots.map((s) => s.time);
    assert.ok(times.includes('09:00'));
    assert.ok(!times.includes('12:00') && !times.includes('11:45'), 'não oferece horários sobrepondo o almoço');
    assert.ok(!times.includes('18:45'), 'serviço de 30 min não pode terminar após o fechamento');
  });

  test('cria agendamento e identifica o cliente pelo celular', async () => {
    const r = await book();
    assert.equal(r.status, 201);
    const again = await pub('POST', '/public/appointments', { serviceId, staffId: barberA, date, time: '15:00', name: 'Outro Nome', phone: '11988881111', consent: true });
    assert.equal(again.status, 201);
    assert.equal(one("SELECT COUNT(*) AS n FROM clients WHERE phone = '11988881111'").n, 1, 'sem cadastro duplicado');
  });

  test('impede o mesmo barbeiro no mesmo horário', async () => {
    const r = await book({ phone: '11977772222', name: 'Cliente Dois', time: '10:15' });
    assert.equal(r.status, 409);
  });

  test('o banco também bloqueia sobreposição (trigger)', () => {
    const clientId = one('SELECT id FROM clients LIMIT 1').id;
    assert.throws(
      () =>
        run('INSERT INTO appointments (client_id, staff_id, service_id, date, start_min, end_min, price_cents) VALUES (?, ?, ?, ?, ?, ?, ?)', [
          clientId,
          barberA,
          serviceId,
          date,
          600,
          630,
          5000,
        ]),
      /CONFLITO_HORARIO/,
    );
  });

  test('"sem preferência" escolhe outro barbeiro livre', async () => {
    const r = await pub('POST', '/public/appointments', { serviceId, staffId: null, date, time: '10:00', name: 'Cliente Três', phone: '11966663333', consent: true });
    assert.equal(r.status, 201);
    assert.equal(r.data.appointment.staff_name, 'Barbeiro B');
  });

  test('rejeita fora do expediente, data passada, serviço desabilitado e sem consentimento', async () => {
    assert.equal((await book({ time: '06:00', phone: '11955554444' })).status, 400);
    assert.equal((await book({ date: '2020-01-06', phone: '11955554444' })).status, 400);
    assert.equal((await book({ consent: false, phone: '11955554444' })).status, 400);
    run('UPDATE services SET active = 0 WHERE id = ?', [serviceId]);
    assert.equal((await book({ time: '16:00', phone: '11955554444' })).status, 400);
    run('UPDATE services SET active = 1 WHERE id = ?', [serviceId]);
  });

  test('rejeita barbeiro inativo e horário bloqueado', async () => {
    run('UPDATE staff SET active = 0 WHERE id = ?', [barberB]);
    assert.equal((await book({ staffId: barberB, time: '11:00', phone: '11955554444' })).status, 400);
    run('UPDATE staff SET active = 1 WHERE id = ?', [barberB]);
    run('INSERT INTO schedule_blocks (staff_id, date, start_min, end_min) VALUES (?, ?, ?, ?)', [barberA, date, 960, 1020]);
    assert.equal((await book({ time: '16:00', phone: '11955554444' })).status, 409);
  });

  test('notifica barbeiro e administrador no painel', () => {
    const n = one("SELECT COUNT(*) AS n FROM notifications WHERE type = 'appointment_created'").n;
    assert.ok(n >= 2);
  });
});

describe('fluxo de atendimento e financeiro', () => {
  test('conclusão gera histórico e registro financeiro; só pago conta como faturamento', async () => {
    const clientId = one('SELECT id FROM clients LIMIT 1').id;
    const today = todayStr();
    const { id } = run(
      "INSERT INTO appointments (client_id, staff_id, service_id, date, start_min, end_min, price_cents, status) VALUES (?, ?, ?, ?, 0, 30, 5000, 'confirmed')",
      [clientId, barberA, serviceId, today],
    );
    let r = await admin('POST', `/appointments/${id}/status`, { status: 'completed', paid: false });
    assert.equal(r.status, 200);
    assert.ok(one('SELECT 1 AS x FROM service_history WHERE appointment_id = ?', [id]));
    let dash = await admin('GET', `/dashboard?from=${today}&to=${today}`);
    assert.equal(dash.data.period.revenue_cents, 0, 'não pago não é faturamento');
    assert.equal(dash.data.period.receivable_cents, 5000);

    const rec = one('SELECT id FROM financial_records WHERE appointment_id = ?', [id]);
    r = await admin('PATCH', `/finance/records/${rec.id}`, { paid: true, paymentMethod: 'pix' });
    assert.equal(r.status, 200);
    dash = await admin('GET', `/dashboard?from=${today}&to=${today}`);
    assert.equal(dash.data.period.revenue_cents, 5000);

    r = await admin('POST', `/appointments/${id}/status`, { status: 'cancelled' });
    assert.equal(r.status, 400, 'concluído é definitivo');
  });

  test('não conclui atendimento futuro', async () => {
    const a = one("SELECT id FROM appointments WHERE date > ? AND status IN ('pending','confirmed') LIMIT 1", [todayStr()]);
    const r = await admin('POST', `/appointments/${a.id}/status`, { status: 'completed', paid: true, paymentMethod: 'cash' });
    assert.equal(r.status, 400);
  });
});

describe('segurança e permissões', () => {
  test('barbeiro vê somente a própria agenda e não acessa financeiro/configurações', async () => {
    const r = await barber('GET', '/appointments?pageSize=200');
    assert.equal(r.status, 200);
    assert.ok(r.data.items.every((a) => a.staff_id === barberA));
    assert.equal((await barber('GET', '/finance/records')).status, 403);
    assert.equal((await barber('GET', '/admin/settings')).status, 403);
    assert.equal((await barber('POST', '/staff', {})).status, 403);
  });

  test('rotas protegidas exigem login', async () => {
    assert.equal((await session()('GET', '/clients')).status, 401);
  });

  test('requisições sem cabeçalho anti-CSRF são bloqueadas', async () => {
    const r = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(r.status, 403);
  });

  test('senhas armazenadas com hash scrypt', () => {
    const u = one("SELECT password_hash FROM users WHERE email = 'admin@test.local'");
    assert.match(u.password_hash, /^scrypt\$/);
  });

  test('cadastro de cliente vincula histórico apenas se o e-mail conferir', async () => {
    const c = session();
    run("UPDATE clients SET email = 'certo@test.local' WHERE phone = '11988881111'");
    let r = await c('POST', '/auth/register', { name: 'Cliente Um', phone: '11988881111', email: 'errado@test.local', password: 'senha1234', consent: true });
    assert.equal(r.status, 409);
    r = await c('POST', '/auth/register', { name: 'Cliente Um', phone: '11988881111', email: 'certo@test.local', password: 'senha1234', consent: true });
    assert.equal(r.status, 201);
    const mine = await c('GET', '/me/appointments');
    assert.ok(mine.data.items.length >= 2);
    assert.equal((await c('GET', '/clients')).status, 403);
  });

  test('login separado: painel só aceita equipe e área do cliente só aceita clientes', async () => {
    // Equipe tentando entrar pela área do cliente
    let s = session();
    let r = await s('POST', '/auth/login', { identifier: 'admin@test.local', password: 'admin12345', scope: 'client' });
    assert.equal(r.status, 403);
    assert.equal(r.data.error.code, 'WRONG_AREA');
    assert.equal((await s('GET', '/auth/me')).data.user, null, 'não deve criar sessão');

    // Cliente tentando entrar pelo painel
    s = session();
    r = await s('POST', '/auth/login', { identifier: '11988881111', password: 'senha1234', scope: 'staff' });
    assert.equal(r.status, 403);
    assert.equal(r.data.error.code, 'WRONG_AREA');
    assert.equal((await s('GET', '/auth/me')).data.user, null, 'não deve criar sessão');

    // Cada um pela sua área funciona
    assert.equal((await session()('POST', '/auth/login', { identifier: 'admin@test.local', password: 'admin12345', scope: 'staff' })).status, 200);
    assert.equal((await session()('POST', '/auth/login', { identifier: '11988881111', password: 'senha1234', scope: 'client' })).status, 200);

    // Senha errada continua genérica (não revela o tipo de conta)
    r = await session()('POST', '/auth/login', { identifier: 'admin@test.local', password: 'errada123', scope: 'client' });
    assert.equal(r.status, 401);
  });

  test('LGPD: exclusão de conta anonimiza dados pessoais', async () => {
    const c = session();
    await c('POST', '/auth/login', { identifier: '11988881111', password: 'senha1234' });
    const r = await c('POST', '/me/delete-account', { password: 'senha1234' });
    assert.equal(r.status, 200);
    assert.equal(one("SELECT COUNT(*) AS n FROM clients WHERE phone = '11988881111'").n, 0);
    assert.ok(one("SELECT 1 AS x FROM clients WHERE name = 'Cliente removido'"));
  });
});
