# Barbearia 30 de Maio — Sistema de gestão e agendamento

Sistema web completo para barbearia: página pública com agendamento online, área do cliente,
e painel administrativo (agenda, clientes, funcionários, serviços, horários, financeiro, dashboard,
notificações, backups e auditoria).

## Tecnologias

| Camada | Tecnologia |
|---|---|
| Backend | Node.js 22.13+ (testado no 24), Express 5 |
| Banco | SQLite nativo do Node (`node:sqlite`), modo WAL, chaves estrangeiras, *triggers* e *constraints* |
| Frontend | React 19 + Vite, React Router, FullCalendar (agenda), Chart.js (gráficos) |
| Segurança | Senhas com **scrypt**, sessão em cookie `httpOnly`/`SameSite`, proteção CSRF, Helmet (CSP), rate limit, bloqueio após tentativas de login |
| E-mail | Nodemailer (SMTP) |

Nenhuma dependência nativa precisa ser compilada — funciona em Windows, Linux e macOS.

## Como rodar

```bash
npm install
cp .env.example .env        # opcional: ajuste e-mail, porta, senha do admin etc.
npm run seed                # cria o banco, o administrador e o catálogo inicial de serviços
npm run dev                 # desenvolvimento: API em :3000 e site em http://localhost:5173
```

Na primeira execução o **administrador inicial** é criado e as credenciais aparecem no terminal
(e-mail `admin@barbearia.local`; a senha é aleatória, a menos que você defina `ADMIN_PASSWORD` no `.env`).
Troque a senha em **Meu perfil** após o primeiro acesso.

Depois do login:

1. **Funcionários** → cadastre os barbeiros (login, serviços que realizam, folgas).
2. **Serviços** → revise categorias, preços e durações.
3. **Horários** → ajuste o expediente, intervalo de almoço, feriados (há importação dos feriados nacionais).
4. **Configurações** → dados da barbearia, regras do agendamento online e e-mail.

### Produção

```bash
npm run build     # gera o front-end em client/dist
npm start         # servidor único em http://localhost:3000 (API + site)
```

Recomendações: rode atrás de um proxy com HTTPS (Nginx/Caddy) e defina `COOKIE_SECURE=true` e
`TRUST_PROXY=true`. Use um gerenciador de processos (PM2, systemd, serviço do Windows) para reiniciar
automaticamente.

### Outros comandos

| Comando | Descrição |
|---|---|
| `npm test` | Testes automatizados de integração da API (banco temporário isolado) |
| `npm run backup` | Gera um backup manual do banco em `data/backups` |
| `npm run seed:demo` | **Somente para testes**: cria barbeiros, clientes e ~2 meses de atendimentos fictícios (senha dos barbeiros: `barbeiro123`). Não use no banco de produção. |

## Perfis de acesso

Os logins são separados — cada tela só aceita o seu tipo de conta (validado no backend):

| Área | Endereço | Quem entra |
|---|---|---|
| Painel de gestão | `/painel/entrar` | Administradores e barbeiros |
| Área do cliente | `/entrar` | Clientes |

| Perfil | Acesso |
|---|---|
| **Administrador** | Tudo: dashboard financeiro, agenda de todos, clientes, funcionários, serviços, horários, financeiro, configurações, backups, auditoria |
| **Barbeiro** | Própria agenda e agendamentos, clientes que atendeu, próprio histórico e números, bloqueios da própria agenda, notificações |
| **Cliente** | Próprios agendamentos (com cancelamento online), histórico de serviços e valores, exportação/exclusão de dados (LGPD) |

As permissões são verificadas **no backend** em todas as rotas — o front-end apenas oculta o que não se aplica.

## Regras de negócio implementadas

- **Disponibilidade** calculada a partir de: horário de funcionamento do dia, intervalo de almoço,
  feriados, folgas semanais do barbeiro, bloqueios (barbearia inteira ou por barbeiro), agendamentos
  existentes, **duração do serviço**, antecedência mínima e janela máxima de agendamento.
- O backend **revalida** todo agendamento/remarcação; o banco possui *triggers* que impedem dois
  agendamentos ativos sobrepostos para o mesmo barbeiro (proteção contra concorrência).
- Serviços/categorias desabilitados e barbeiros inativos não aparecem nem podem ser agendados.
- Cliente identificado pelo **celular** (único) — sem cadastros duplicados.
- Status: Pendente → Confirmado → Em atendimento → Concluído; Cancelado; Cliente não compareceu.
  Agendamentos online entram como *Pendente* (ou *Confirmado*, se a confirmação automática estiver ligada).
- Ao **concluir**, o sistema grava automaticamente o histórico do cliente e o registro financeiro
  (valor, forma de pagamento, barbeiro, data). Atendimentos futuros não podem ser concluídos e
  atendimentos concluídos não podem ser alterados.
- **Faturamento = somente registros concluídos e pagos.** Concluídos não pagos aparecem como "a receber".
- **Notificações** de novo agendamento, alteração e cancelamento: no painel (em tempo real) para o
  barbeiro responsável e administradores, por e-mail ao barbeiro (e opcionalmente aos admins e ao cliente).

## LGPD e segurança

- Consentimento obrigatório (com data e versão registradas) no agendamento e no cadastro.
- Página de Política de Privacidade (`/privacidade`).
- Cliente pode **exportar** seus dados (JSON) e **excluir a conta** (anonimização — os registros
  financeiros são mantidos sem dados pessoais, por obrigação legal). O admin também pode anonimizar.
- Barbeiros só veem dados de clientes que atendem.
- Trilha de **auditoria** (logins, visualização/alteração de clientes, financeiro, exportações, backups).
- Senhas com scrypt; sessões revogáveis (troca de senha encerra as outras sessões); conta bloqueada
  por 15 min após 5 tentativas erradas; limite de requisições em login e agendamento; honeypot anti-spam.
- Cabeçalhos de segurança (CSP, etc.), CSV exportado protegido contra injeção de fórmulas.

### Clientes criando conta

Ao criar conta, o cliente é vinculado ao histórico existente pelo celular. Se o cadastro existente já
tiver e-mail, ele precisa informar o **mesmo e-mail** — isso evita que alguém acesse o histórico de
outra pessoa só sabendo o celular. Para segurança máxima, uma evolução natural é confirmar o celular
por código via SMS/WhatsApp.

## Backup e restauração

- Backup automático a cada 24h (`BACKUP_INTERVAL_HOURS`), mantendo os 14 mais recentes (`BACKUP_KEEP`).
- Backup manual e download em **Configurações → Backups** ou `npm run backup`.
- **Restaurar:** pare o servidor, substitua `data/barbearia.db` pelo arquivo de backup desejado
  (e remova `barbearia.db-wal` / `barbearia.db-shm`, se existirem) e inicie novamente.
- Guarde cópias periódicas **fora do servidor** (nuvem, outro disco).

## Estrutura

```
server/
  src/
    config.js            configuração (.env)
    app.js / index.js    montagem do Express / inicialização
    db/                  conexão, migrations (SQL), seed, backup
    middleware/          autenticação, permissões, CSRF, tratamento de erros
    services/            regras de negócio: disponibilidade, agendamentos, notificações, e-mail, backup
    routes/              endpoints REST (/api/...)
    utils/               validação (zod), datas, senhas
  test/                  testes de integração
client/
  src/
    pages/public         site, agendamento, login, cadastro, privacidade
    pages/client         área do cliente
    pages/panel          painel administrativo
    components/          modal de agendamento, gráficos, calendário, UI
    context/ lib/        autenticação, notificações em tempo real, API, formatação
data/                    banco, backups e uploads (criado automaticamente, fora do git)
```

Novas alterações de banco devem ser criadas como novos arquivos em `server/src/db/migrations`
(ex.: `002_nova_coluna.sql`) — são aplicadas automaticamente na inicialização.
