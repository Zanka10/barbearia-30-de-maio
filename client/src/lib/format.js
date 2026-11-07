export const pad = (n) => String(n).padStart(2, '0');

const moneyFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const money = (cents) => moneyFmt.format((cents || 0) / 100);
export const moneyShort = (cents) => {
  const v = (cents || 0) / 100;
  if (v >= 1000) return `R$ ${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
  return moneyFmt.format(v);
};

/** "45,90" / "45.90" / "45" -> 4590 */
export function parseMoney(str) {
  const s = String(str ?? '').trim().replace(/[^\d,.-]/g, '');
  if (!s) return NaN;
  const normalized = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
  const v = Number(normalized);
  return Number.isFinite(v) ? Math.round(v * 100) : NaN;
}
export const centsToInput = (cents) => ((cents || 0) / 100).toFixed(2).replace('.', ',');

export const toDateStr = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => toDateStr(new Date());
export function parseDate(str) {
  const [y, m, d] = String(str).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(str, n) {
  const d = parseDate(str);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}
export function startOfWeek(str) {
  const d = parseDate(str);
  const wd = d.getDay();
  return addDays(str, wd === 0 ? -6 : 1 - wd);
}
export const startOfMonth = (str) => `${str.slice(0, 7)}-01`;
export function endOfMonth(str) {
  const d = parseDate(startOfMonth(str));
  d.setMonth(d.getMonth() + 1);
  d.setDate(0);
  return toDateStr(d);
}

export const dateBR = (str) => (str ? str.slice(0, 10).split('-').reverse().join('/') : '');
export const dateLong = (str) =>
  parseDate(str).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
export const dateShort = (str) => parseDate(str).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
export const dateTimeBR = (iso) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
export const nowMinutes = (d = new Date()) => d.getHours() * 60 + d.getMinutes();
export const minToHHMM = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
export const hhmmToMin = (s) => {
  const [h, m] = String(s).split(':').map(Number);
  return h * 60 + m;
};

export function timeAgo(iso) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'agora';
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)} h`;
  if (diff < 7 * 86400) return `há ${Math.floor(diff / 86400)} d`;
  return dateTimeBR(iso);
}

export const duration = (min) => (min >= 60 ? `${Math.floor(min / 60)}h${min % 60 ? pad(min % 60) : ''}` : `${min} min`);

export const onlyDigits = (s) => String(s ?? '').replace(/\D/g, '');
export function phoneBR(p) {
  const d = onlyDigits(p);
  if (!d || String(p).startsWith('anon')) return p || '';
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return p;
}
/** Máscara progressiva para input de celular. */
export function maskPhone(v) {
  let d = onlyDigits(v);
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
  d = d.slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
export const isValidPhone = (v) => /^[1-9]{2}9?\d{8}$/.test(onlyDigits(v));
export const whatsappLink = (p, text = '') => `https://wa.me/55${onlyDigits(p)}${text ? `?text=${encodeURIComponent(text)}` : ''}`;

export const initials = (name = '') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0].toUpperCase())
    .join('');
