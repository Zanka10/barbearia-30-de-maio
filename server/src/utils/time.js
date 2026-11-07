// Utilitários de data/hora. Datas de agenda são strings 'YYYY-MM-DD' no fuso da barbearia;
// horários são minutos desde 00:00.

export const pad = (n) => String(n).padStart(2, '0');

export const minToHHMM = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;

export function hhmmToMin(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s ?? ''));
  if (!m) return NaN;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59 || (h === 24 && min > 0)) return NaN;
  return h * 60 + min;
}

export function toDateStr(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const todayStr = () => toDateStr(new Date());

export const nowMinutes = (d = new Date()) => d.getHours() * 60 + d.getMinutes();

export function parseDate(str) {
  const [y, m, d] = String(str).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function isValidDateStr(str) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(str))) return false;
  const d = parseDate(str);
  return toDateStr(d) === str;
}

export const weekdayOf = (dateStr) => parseDate(dateStr).getDay();

export function addDays(dateStr, n) {
  const d = parseDate(dateStr);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

export function diffDays(a, b) {
  return Math.round((parseDate(b) - parseDate(a)) / 86400000);
}

export function startOfWeek(dateStr) {
  const wd = weekdayOf(dateStr); // semana começa na segunda-feira
  return addDays(dateStr, wd === 0 ? -6 : 1 - wd);
}

export function startOfMonth(dateStr) {
  return `${dateStr.slice(0, 7)}-01`;
}

export function endOfMonth(dateStr) {
  const d = parseDate(startOfMonth(dateStr));
  d.setMonth(d.getMonth() + 1);
  d.setDate(0);
  return toDateStr(d);
}

export const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

export function formatDateBR(dateStr) {
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

const WEEKDAYS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
export const weekdayName = (dateStr) => WEEKDAYS[weekdayOf(dateStr)];

export const formatMoney = (cents) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((cents || 0) / 100);
