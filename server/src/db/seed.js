// Uso:
//   npm run seed        -> cria admin (se não existir) + catálogo inicial de categorias/serviços (se vazio)
//   npm run seed:demo   -> além disso cria barbeiros, clientes e agendamentos de demonstração
//                          (útil para testar dashboard e relatórios; NÃO use em produção)
import '../config.js';
import { all, migrate, one, run, tx } from './index.js';
import { ensureAdmin } from './bootstrap.js';
import { hashPassword } from '../utils/password.js';
import { addDays, nowIso, todayStr, weekdayOf } from '../utils/time.js';

migrate();
await ensureAdmin();

const CATALOG = [
  {
    name: 'Cortes de cabelo',
    description: 'Cortes clássicos e modernos',
    services: [
      ['Corte tradicional', 'Corte na tesoura e máquina com acabamento', 4500, 30],
      ['Corte degradê (fade)', 'Degradê com navalha e acabamento detalhado', 5000, 40],
      ['Corte infantil', 'Para crianças até 12 anos', 3500, 30],
      ['Máquina (um pente)', 'Corte rápido na máquina', 3000, 20],
    ],
  },
  {
    name: 'Barba',
    description: 'Cuidados completos com a barba',
    services: [
      ['Barba completa', 'Toalha quente, navalha e balm', 3500, 30],
      ['Barba desenhada', 'Modelagem e contorno na navalha', 3000, 25],
      ['Pezinho / acabamento', 'Contorno de nuca e laterais', 1500, 15],
    ],
  },
  {
    name: 'Combos',
    description: 'Pacotes com valor especial',
    services: [
      ['Corte + Barba', 'Corte tradicional com barba completa', 7000, 60],
      ['Degradê + Barba', 'Fade com barba completa', 7500, 70],
    ],
  },
  {
    name: 'Tratamentos',
    description: 'Tratamentos capilares e de pele',
    services: [
      ['Hidratação capilar', 'Hidratação profunda com massagem', 4000, 30],
      ['Limpeza de pele', 'Limpeza facial completa', 6000, 45],
    ],
  },
  {
    name: 'Serviços especiais',
    description: 'Química, coloração e afins',
    services: [
      ['Pigmentação de barba', 'Correção de falhas com pigmento', 4000, 30],
      ['Luzes / Platinado', 'Descoloração completa', 15000, 120],
      ['Sobrancelha', 'Design na navalha', 1500, 15],
    ],
  },
];

if (!one('SELECT 1 AS x FROM categories LIMIT 1')) {
  tx(() => {
    CATALOG.forEach((cat, ci) => {
      const { id: catId } = run('INSERT INTO categories (name, description, sort_order) VALUES (?, ?, ?)', [cat.name, cat.description, ci]);
      cat.services.forEach(([name, desc, price, dur], si) => {
        run('INSERT INTO services (category_id, name, description, price_cents, duration_min, sort_order) VALUES (?, ?, ?, ?, ?, ?)', [
          catId,
          name,
          desc,
          price,
          dur,
          si,
        ]);
      });
    });
  });
  console.log('[seed] catálogo inicial de categorias e serviços criado.');
} else {
  console.log('[seed] catálogo já existe — mantido.');
}

if (process.argv.includes('--demo')) {
  if (one('SELECT 1 AS x FROM staff LIMIT 1')) {
    console.log('[seed] já existem funcionários cadastrados — dados de demonstração não foram gerados.');
    process.exit(0);
  }
  const pass = await hashPassword('barbeiro123');
  const barbers = [
    ['Rafael Souza', 'rafael@barbearia.local', '11987650001', 'Degradê, navalha', '#c9a24a', [0]],
    ['Bruno Lima', 'bruno@barbearia.local', '11987650002', 'Barba, tratamentos', '#7aa2c9', [0, 1]],
    ['Diego Martins', 'diego@barbearia.local', '11987650003', 'Química, cortes clássicos', '#9fc97a', [0, 3]],
  ];
  const services = all('SELECT id, price_cents, duration_min FROM services');
  const staffIds = tx(() =>
    barbers.map(([name, email, phone, spec, color, daysOff]) => {
      const { id: userId } = run("INSERT INTO users (name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, 'barber')", [name, email, phone, pass]);
      const { id } = run('INSERT INTO staff (user_id, specialties, color) VALUES (?, ?, ?)', [userId, spec, color]);
      for (const s of services) run('INSERT INTO staff_services (staff_id, service_id) VALUES (?, ?)', [id, s.id]);
      for (const wd of daysOff) run('INSERT INTO staff_days_off (staff_id, weekday) VALUES (?, ?)', [id, wd]);
      return id;
    }),
  );

  const first = ['João', 'Pedro', 'Lucas', 'Mateus', 'Gabriel', 'Felipe', 'Gustavo', 'Thiago', 'André', 'Carlos', 'Marcelo', 'Eduardo', 'Rodrigo', 'Vinícius', 'Leonardo', 'Ricardo', 'Fernando', 'Henrique', 'Daniel', 'Paulo'];
  const last = ['Silva', 'Santos', 'Oliveira', 'Pereira', 'Costa', 'Rodrigues', 'Almeida', 'Nascimento', 'Ferreira', 'Araújo'];
  const clientIds = tx(() =>
    Array.from({ length: 40 }, (_, i) => {
      const name = `${first[i % first.length]} ${last[(i * 7) % last.length]}`;
      const phone = `1199${String(1000000 + i * 1373).slice(0, 7)}`;
      return run('INSERT INTO clients (name, phone, consent_at, consent_version) VALUES (?, ?, ?, ?)', [name, phone, nowIso(), '1.0']).id;
    }),
  );

  const methods = ['cash', 'pix', 'pix', 'debit', 'credit'];
  const hours = Object.fromEntries(all('SELECT * FROM business_hours').map((h) => [h.weekday, h]));
  let created = 0;
  let rnd = 42;
  const rand = (n) => {
    rnd = (rnd * 1103515245 + 12345) % 2147483648;
    return (rnd >>> 16) % n; // bits altos: os bits baixos de um LCG se repetem
  };
  const svcInfo = Object.fromEntries(
    all('SELECT s.id, s.name, s.price_cents, s.duration_min, c.name AS cat FROM services s JOIN categories c ON c.id = s.category_id').map((s) => [s.id, s]),
  );
  const staffNames = Object.fromEntries(all('SELECT st.id, u.name FROM staff st JOIN users u ON u.id = st.user_id').map((r) => [r.id, r.name]));
  const today = todayStr();

  tx(() => {
    for (let offset = -75; offset <= 10; offset++) {
      const date = addDays(today, offset);
      const h = hours[weekdayOf(date)];
      if (!h?.is_open) continue;
      for (const staffId of staffIds) {
        if (one('SELECT 1 AS x FROM staff_days_off WHERE staff_id = ? AND weekday = ?', [staffId, weekdayOf(date)])) continue;
        let t = h.open_min + rand(3) * 15;
        while (t < h.close_min) {
          const svc = services[rand(services.length)];
          const end = t + svc.duration_min;
          if (end > h.close_min) break;
          if (h.break_start_min != null && t < h.break_end_min && h.break_start_min < end) {
            t = h.break_end_min;
            continue;
          }
          const fill = offset < 0 ? 6 : offset === 0 ? 5 : 3; // dias passados mais cheios
          if (rand(10) < fill) {
            const clientId = clientIds[rand(clientIds.length)];
            let status = 'confirmed';
            if (offset < 0) {
              const r = rand(20);
              status = r < 16 ? 'completed' : r < 18 ? 'cancelled' : 'no_show';
            } else if (offset > 0) status = rand(3) === 0 ? 'pending' : 'confirmed';
            else status = t < new Date().getHours() * 60 ? 'completed' : 'confirmed';
            const clash = one(
              `SELECT 1 AS x FROM appointments WHERE client_id = ? AND date = ? AND status NOT IN ('cancelled','no_show') AND start_min < ? AND ? < end_min`,
              [clientId, date, end, t],
            );
            if (!clash) {
              const { id } = run(
                `INSERT INTO appointments (client_id, staff_id, service_id, date, start_min, end_min, price_cents, status, source, status_changed_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [clientId, staffId, svc.id, date, t, end, svc.price_cents, status, rand(2) ? 'online' : 'panel', nowIso()],
              );
              if (status === 'completed') {
                const s = svcInfo[svc.id];
                run(
                  `INSERT INTO service_history (appointment_id, client_id, staff_id, service_id, service_name, category_name, staff_name, price_cents, date, start_min, completed_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                  [id, clientId, staffId, svc.id, s.name, s.cat, staffNames[staffId], svc.price_cents, date, t, nowIso()],
                );
                const paid = offset < -1 || rand(4) > 0 ? 1 : 0;
                run(
                  `INSERT INTO financial_records (appointment_id, client_id, staff_id, service_id, service_name, amount_cents, payment_method, paid, paid_at, date)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                  [id, clientId, staffId, svc.id, s.name, svc.price_cents, paid ? methods[rand(methods.length)] : null, paid, paid ? nowIso() : null, date],
                );
              }
              created++;
            }
          }
          t = end + (rand(3) === 0 ? 15 : 0);
        }
      }
    }
  });
  console.log(`[seed] demo: ${staffIds.length} barbeiros (senha: barbeiro123), ${clientIds.length} clientes, ${created} agendamentos.`);
}
