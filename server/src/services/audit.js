import { run } from '../db/index.js';

/** Registra uma ação na trilha de auditoria. Nunca deve derrubar a requisição. */
export function audit(req, action, entity = null, entityId = null, details = null) {
  try {
    run('INSERT INTO audit_log (user_id, action, entity, entity_id, details, ip) VALUES (?, ?, ?, ?, ?, ?)', [
      req?.user?.id ?? null,
      action,
      entity,
      entityId,
      details ? JSON.stringify(details).slice(0, 2000) : null,
      req?.ip ?? null,
    ]);
  } catch (err) {
    console.error('[audit] falha ao registrar', err.message);
  }
}
