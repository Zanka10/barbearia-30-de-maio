import { Router } from 'express';
import { z } from 'zod';
import { all, one, run } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { subscribe } from '../services/realtime.js';
import { nowIso } from '../utils/time.js';
import { parse } from '../utils/validation.js';

const router = Router();
router.use(requireAuth);

const unreadCount = (userId) => one('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL', [userId]).n;

router.get('/', (req, res) => {
  const q = parse(
    z.object({ unread: z.enum(['0', '1']).default('0'), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(5).max(100).default(30) }),
    req.query,
  );
  const filter = q.unread === '1' ? 'AND read_at IS NULL' : '';
  const items = all(
    `SELECT * FROM notifications WHERE user_id = ? ${filter} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
    [req.user.id, q.pageSize, (q.page - 1) * q.pageSize],
  );
  const total = one(`SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? ${filter}`, [req.user.id]).n;
  res.json({ items, total, unread: unreadCount(req.user.id) });
});

router.get('/unread-count', (req, res) => res.json({ unread: unreadCount(req.user.id) }));

/** Stream em tempo real (Server-Sent Events). */
router.get('/stream', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  res.write(`event: hello\ndata: ${JSON.stringify({ unread: unreadCount(req.user.id) })}\n\n`);
  const unsubscribe = subscribe(req.user.id, res);
  // Importante: usar res 'close' (req 'close' dispara logo após ler o corpo da requisição)
  res.on('close', unsubscribe);
});

router.post('/read-all', (req, res) => {
  run('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL', [nowIso(), req.user.id]);
  res.json({ unread: 0 });
});

router.post('/:id/read', (req, res) => {
  run('UPDATE notifications SET read_at = COALESCE(read_at, ?) WHERE id = ? AND user_id = ?', [nowIso(), Number(req.params.id), req.user.id]);
  res.json({ unread: unreadCount(req.user.id) });
});

router.delete('/:id', (req, res) => {
  run('DELETE FROM notifications WHERE id = ? AND user_id = ?', [Number(req.params.id), req.user.id]);
  res.json({ unread: unreadCount(req.user.id) });
});

export default router;
