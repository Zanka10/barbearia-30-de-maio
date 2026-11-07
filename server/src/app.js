import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { config, ROOT } from './config.js';
import { csrfGuard, loadUser } from './middleware/auth.js';
import { errorHandler, notFoundApi } from './middleware/errors.js';
import authRoutes from './routes/auth.js';
import publicRoutes from './routes/public.js';
import meRoutes from './routes/me.js';
import clientRoutes from './routes/clients.js';
import staffRoutes from './routes/staff.js';
import catalogRoutes from './routes/catalog.js';
import appointmentRoutes from './routes/appointments.js';
import scheduleRoutes from './routes/schedule.js';
import financeRoutes from './routes/finance.js';
import dashboardRoutes from './routes/dashboard.js';
import notificationRoutes from './routes/notifications.js';
import adminRoutes from './routes/admin.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'default-src': ["'self'"],
          'script-src': ["'self'"],
          'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
          'img-src': ["'self'", 'data:', 'blob:'],
          'connect-src': ["'self'"],
          'upgrade-insecure-requests': config.cookieSecure ? [] : null,
        },
      },
      strictTransportSecurity: config.cookieSecure,
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(express.json({ limit: '200kb' }));
  app.use(cookieParser());

  // ---------- API ----------
  const api = express.Router();
  api.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  api.use(loadUser, csrfGuard);
  api.get('/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));
  api.use('/auth', authRoutes);
  api.use('/public', publicRoutes);
  api.use('/me', meRoutes);
  api.use('/clients', clientRoutes);
  api.use('/staff', staffRoutes);
  api.use('/catalog', catalogRoutes);
  api.use('/appointments', appointmentRoutes);
  api.use('/schedule', scheduleRoutes);
  api.use('/finance', financeRoutes);
  api.use('/dashboard', dashboardRoutes);
  api.use('/notifications', notificationRoutes);
  api.use('/admin', adminRoutes);
  api.use(notFoundApi);
  app.use('/api', api);

  // ---------- Arquivos enviados (fotos dos barbeiros) ----------
  app.use('/uploads', express.static(config.uploadDir, { maxAge: '7d', index: false, dotfiles: 'deny' }));

  // ---------- Front-end (build de produção) ----------
  const dist = path.join(ROOT, 'client', 'dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist, { index: false, maxAge: '1h' }));
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
      res.sendFile(path.join(dist, 'index.html'));
    });
  } else {
    app.get('/', (_req, res) =>
      res.type('text').send('API da barbearia em execução. Rode "npm run dev" (desenvolvimento) ou "npm run build" para gerar o front-end.'),
    );
  }

  app.use(errorHandler);
  return app;
}
