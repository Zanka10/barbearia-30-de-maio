// Hub de Server-Sent Events: entrega notificações em tempo real para o painel.
const subscribers = new Map(); // userId -> Set<res>

export function subscribe(userId, res) {
  if (!subscribers.has(userId)) subscribers.set(userId, new Set());
  subscribers.get(userId).add(res);
  return () => {
    const set = subscribers.get(userId);
    if (!set) return;
    set.delete(res);
    if (!set.size) subscribers.delete(userId);
  };
}

export function publish(userId, event, data) {
  const set = subscribers.get(userId);
  if (!set) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of set) {
    try {
      res.write(payload);
    } catch {
      /* conexão encerrada */
    }
  }
}

// Mantém conexões vivas atrás de proxies
setInterval(() => {
  for (const set of subscribers.values()) for (const res of set) res.write(': ping\n\n');
}, 25000).unref();
