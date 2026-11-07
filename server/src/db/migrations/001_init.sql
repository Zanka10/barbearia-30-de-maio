-- =====================================================================
-- Estrutura inicial do banco de dados da barbearia
-- Convenções:
--   * Timestamps (created_at, updated_at...) em UTC ISO-8601: 2026-01-31T13:45:00Z
--   * Datas de agenda em horário local da barbearia: 'YYYY-MM-DD'
--   * Horários de agenda em minutos desde 00:00 (ex.: 9h30 = 570)
--   * Valores monetários em centavos (INTEGER) para evitar erros de arredondamento
-- =====================================================================

CREATE TABLE users (
  id                   INTEGER PRIMARY KEY,
  name                 TEXT    NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 120),
  email                TEXT    COLLATE NOCASE UNIQUE,
  phone                TEXT    UNIQUE,
  password_hash        TEXT    NOT NULL,
  role                 TEXT    NOT NULL CHECK (role IN ('admin', 'barber', 'client')),
  active               INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  failed_logins        INTEGER NOT NULL DEFAULT 0,
  locked_until         TEXT,
  last_login_at        TEXT,
  created_at           TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at           TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  CHECK (email IS NOT NULL OR phone IS NOT NULL)
);

CREATE TABLE sessions (
  id          TEXT    PRIMARY KEY,               -- hash SHA-256 do token (o token em si nunca é salvo)
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  TEXT    NOT NULL,
  ip          TEXT,
  user_agent  TEXT,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE clients (
  id               INTEGER PRIMARY KEY,
  user_id          INTEGER UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  name             TEXT    NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 120),
  phone            TEXT    NOT NULL UNIQUE,      -- somente dígitos (DDD + número) — chave de identificação
  email            TEXT    COLLATE NOCASE,
  notes            TEXT,
  consent_at       TEXT,                         -- LGPD: aceite da política de privacidade
  consent_version  TEXT,
  anonymized_at    TEXT,
  created_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  CHECK ((length(phone) BETWEEN 10 AND 11 AND phone NOT GLOB '*[^0-9]*') OR phone GLOB 'anon-*')
);
CREATE INDEX idx_clients_name ON clients(name COLLATE NOCASE);

CREATE TABLE staff (
  id           INTEGER PRIMARY KEY,
  user_id      INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE RESTRICT,
  photo_path   TEXT,
  specialties  TEXT,
  bio          TEXT,
  color        TEXT    NOT NULL DEFAULT '#c9a24a' CHECK (color GLOB '#[0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F]'),
  active       INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- Dias da semana em que o funcionário folga (0 = domingo ... 6 = sábado)
CREATE TABLE staff_days_off (
  staff_id  INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  weekday   INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  PRIMARY KEY (staff_id, weekday)
);

CREATE TABLE categories (
  id           INTEGER PRIMARY KEY,
  name         TEXT    NOT NULL UNIQUE COLLATE NOCASE CHECK (length(trim(name)) BETWEEN 2 AND 80),
  description  TEXT,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  active       INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE services (
  id            INTEGER PRIMARY KEY,
  category_id   INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  name          TEXT    NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 100),
  description   TEXT,
  price_cents   INTEGER NOT NULL CHECK (price_cents >= 0),
  duration_min  INTEGER NOT NULL CHECK (duration_min BETWEEN 5 AND 480),
  active        INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  UNIQUE (category_id, name COLLATE NOCASE)
);
CREATE INDEX idx_services_category ON services(category_id);

-- Quais serviços cada barbeiro executa
CREATE TABLE staff_services (
  staff_id    INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  service_id  INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  PRIMARY KEY (staff_id, service_id)
);
CREATE INDEX idx_staff_services_service ON staff_services(service_id);

CREATE TABLE business_hours (
  weekday          INTEGER PRIMARY KEY CHECK (weekday BETWEEN 0 AND 6),
  is_open          INTEGER NOT NULL DEFAULT 1 CHECK (is_open IN (0, 1)),
  open_min         INTEGER NOT NULL CHECK (open_min BETWEEN 0 AND 1439),
  close_min        INTEGER NOT NULL CHECK (close_min BETWEEN 1 AND 1440),
  break_start_min  INTEGER,
  break_end_min    INTEGER,
  CHECK (close_min > open_min),
  CHECK (
    (break_start_min IS NULL AND break_end_min IS NULL) OR
    (break_start_min >= open_min AND break_end_min <= close_min AND break_end_min > break_start_min)
  )
);

CREATE TABLE holidays (
  id          INTEGER PRIMARY KEY,
  date        TEXT NOT NULL UNIQUE CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
  name        TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 100),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- Bloqueios de agenda: staff_id NULL = bloqueia a barbearia inteira
CREATE TABLE schedule_blocks (
  id          INTEGER PRIMARY KEY,
  staff_id    INTEGER REFERENCES staff(id) ON DELETE CASCADE,
  date        TEXT    NOT NULL CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
  start_min   INTEGER NOT NULL CHECK (start_min BETWEEN 0 AND 1439),
  end_min     INTEGER NOT NULL CHECK (end_min BETWEEN 1 AND 1440),
  reason      TEXT,
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  CHECK (end_min > start_min)
);
CREATE INDEX idx_blocks_date ON schedule_blocks(date, staff_id);

CREATE TABLE appointments (
  id                 INTEGER PRIMARY KEY,
  client_id          INTEGER NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  staff_id           INTEGER NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
  service_id         INTEGER NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
  date               TEXT    NOT NULL CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
  start_min          INTEGER NOT NULL CHECK (start_min BETWEEN 0 AND 1439),
  end_min            INTEGER NOT NULL CHECK (end_min BETWEEN 1 AND 1440),
  price_cents        INTEGER NOT NULL CHECK (price_cents >= 0),   -- preço no momento do agendamento
  status             TEXT    NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'confirmed', 'in_service', 'completed', 'cancelled', 'no_show')),
  notes              TEXT,
  source             TEXT    NOT NULL DEFAULT 'online' CHECK (source IN ('online', 'panel')),
  cancel_reason      TEXT,
  created_by         INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status_changed_at  TEXT,
  created_at         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  CHECK (end_min > start_min)
);
CREATE INDEX idx_appt_staff_date  ON appointments(staff_id, date);
CREATE INDEX idx_appt_client      ON appointments(client_id);
CREATE INDEX idx_appt_date_status ON appointments(date, status);

-- Garantia no próprio banco: um barbeiro não pode ter dois agendamentos ativos sobrepostos
CREATE TRIGGER trg_appt_no_overlap_insert
BEFORE INSERT ON appointments
WHEN NEW.status NOT IN ('cancelled', 'no_show')
BEGIN
  SELECT RAISE(ABORT, 'CONFLITO_HORARIO')
  WHERE EXISTS (
    SELECT 1 FROM appointments a
    WHERE a.staff_id = NEW.staff_id
      AND a.date = NEW.date
      AND a.status NOT IN ('cancelled', 'no_show')
      AND a.start_min < NEW.end_min
      AND NEW.start_min < a.end_min
  );
END;

CREATE TRIGGER trg_appt_no_overlap_update
BEFORE UPDATE OF staff_id, date, start_min, end_min, status ON appointments
WHEN NEW.status NOT IN ('cancelled', 'no_show')
BEGIN
  SELECT RAISE(ABORT, 'CONFLITO_HORARIO')
  WHERE EXISTS (
    SELECT 1 FROM appointments a
    WHERE a.id <> NEW.id
      AND a.staff_id = NEW.staff_id
      AND a.date = NEW.date
      AND a.status NOT IN ('cancelled', 'no_show')
      AND a.start_min < NEW.end_min
      AND NEW.start_min < a.end_min
  );
END;

-- Atendimento concluído é definitivo (registro histórico/financeiro)
CREATE TRIGGER trg_appt_completed_is_final
BEFORE UPDATE OF status, staff_id, service_id, date, start_min, end_min, client_id ON appointments
WHEN OLD.status = 'completed'
BEGIN
  SELECT RAISE(ABORT, 'ATENDIMENTO_CONCLUIDO_IMUTAVEL');
END;

-- Histórico de atendimentos efetivamente realizados (snapshot no momento da conclusão)
CREATE TABLE service_history (
  id              INTEGER PRIMARY KEY,
  appointment_id  INTEGER NOT NULL UNIQUE REFERENCES appointments(id) ON DELETE RESTRICT,
  client_id       INTEGER NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  staff_id        INTEGER NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
  service_id      INTEGER NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
  service_name    TEXT    NOT NULL,
  category_name   TEXT,
  staff_name      TEXT    NOT NULL,
  price_cents     INTEGER NOT NULL CHECK (price_cents >= 0),
  date            TEXT    NOT NULL,
  start_min       INTEGER NOT NULL,
  completed_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX idx_history_client ON service_history(client_id);
CREATE INDEX idx_history_date   ON service_history(date);

-- Registro financeiro: só conta como faturamento quando paid = 1
CREATE TABLE financial_records (
  id              INTEGER PRIMARY KEY,
  appointment_id  INTEGER NOT NULL UNIQUE REFERENCES appointments(id) ON DELETE RESTRICT,
  client_id       INTEGER NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  staff_id        INTEGER NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
  service_id      INTEGER NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
  service_name    TEXT    NOT NULL,
  amount_cents    INTEGER NOT NULL CHECK (amount_cents >= 0),
  payment_method  TEXT    CHECK (payment_method IN ('cash', 'pix', 'debit', 'credit')),
  paid            INTEGER NOT NULL DEFAULT 0 CHECK (paid IN (0, 1)),
  paid_at         TEXT,
  date            TEXT    NOT NULL,             -- data do atendimento (competência)
  notes           TEXT,
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  CHECK (paid = 0 OR payment_method IS NOT NULL)
);
CREATE INDEX idx_fin_date ON financial_records(date, paid);
CREATE INDEX idx_fin_staff ON financial_records(staff_id);

CREATE TABLE notifications (
  id              INTEGER PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type            TEXT    NOT NULL,
  title           TEXT    NOT NULL,
  message         TEXT    NOT NULL,
  appointment_id  INTEGER REFERENCES appointments(id) ON DELETE SET NULL,
  read_at         TEXT,
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX idx_notifications_user ON notifications(user_id, read_at);

CREATE TABLE email_log (
  id          INTEGER PRIMARY KEY,
  to_address  TEXT NOT NULL,
  subject     TEXT NOT NULL,
  body_text   TEXT NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'logged')),
  error       TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE settings (
  key    TEXT PRIMARY KEY,
  value  TEXT
);

-- Trilha de auditoria (LGPD: rastreabilidade de acesso e alteração de dados pessoais)
CREATE TABLE audit_log (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  entity      TEXT,
  entity_id   INTEGER,
  details     TEXT,
  ip          TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX idx_audit_created ON audit_log(created_at);

-- Horário de funcionamento padrão: seg-sex 9h-19h (almoço 12h-13h), sáb 9h-17h, dom fechado
INSERT INTO business_hours (weekday, is_open, open_min, close_min, break_start_min, break_end_min) VALUES
  (0, 0, 540, 1020, NULL, NULL),
  (1, 1, 540, 1140, 720, 780),
  (2, 1, 540, 1140, 720, 780),
  (3, 1, 540, 1140, 720, 780),
  (4, 1, 540, 1140, 720, 780),
  (5, 1, 540, 1140, 720, 780),
  (6, 1, 540, 1020, NULL, NULL);

INSERT INTO settings (key, value) VALUES
  ('shop_name', 'Barbearia 30 de Maio'),
  ('shop_tagline', 'Tradição, estilo e precisão em cada corte.'),
  ('shop_phone', ''),
  ('shop_whatsapp', ''),
  ('shop_email', ''),
  ('shop_address', ''),
  ('shop_instagram', ''),
  ('slot_interval_min', '15'),
  ('booking_window_days', '60'),
  ('min_advance_min', '60'),
  ('client_cancel_min_hours', '2'),
  ('auto_confirm', '0'),
  ('notify_admin_email', '1'),
  ('notify_client_email', '1'),
  ('privacy_contact', '');
