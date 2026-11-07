import { z } from 'zod';
import { badRequest } from './errors.js';
import { hhmmToMin, isValidDateStr } from './time.js';

/** Normaliza celular brasileiro para somente dígitos (DDD + número), removendo +55. */
export function normalizePhone(input) {
  let d = String(input ?? '').replace(/\D/g, '');
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2);
  return d;
}

export const isValidPhone = (digits) => /^[1-9]{2}9?\d{8}$/.test(digits);

export const zPhone = z
  .string({ error: 'Informe o celular.' })
  .transform(normalizePhone)
  .refine(isValidPhone, 'Celular inválido. Use DDD + número, ex.: (11) 91234-5678.');

export const zName = z
  .string({ error: 'Informe o nome.' })
  .trim()
  .min(2, 'Nome muito curto.')
  .max(120, 'Nome muito longo.')
  .refine((v) => !/[<>{}]/.test(v), 'Nome contém caracteres inválidos.');

export const zEmail = z.string().trim().toLowerCase().max(160).email('E-mail inválido.');
export const zOptionalEmail = z
  .union([zEmail, z.literal(''), z.null()])
  .optional()
  .transform((v) => (v ? v : null));

export const zPassword = z
  .string()
  .min(8, 'A senha deve ter ao menos 8 caracteres.')
  .max(128)
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), 'A senha deve conter letras e números.');

export const zDate = z.string().refine(isValidDateStr, 'Data inválida (use AAAA-MM-DD).');
export const zTime = z
  .string()
  .refine((v) => !Number.isNaN(hhmmToMin(v)), 'Horário inválido (use HH:MM).')
  .transform(hhmmToMin);

export const zId = z.coerce.number().int().positive();
export const zCents = z.coerce.number().int().min(0).max(100_000_00);
export const zText = (max = 500) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const STATUSES = ['pending', 'confirmed', 'in_service', 'completed', 'cancelled', 'no_show'];
export const PAYMENT_METHODS = ['cash', 'pix', 'debit', 'credit'];

/** Valida e retorna os dados; lança 400 com detalhes por campo em caso de erro. */
export function parse(schema, data) {
  const r = schema.safeParse(data);
  if (r.success) return r.data;
  const details = {};
  for (const issue of r.error.issues) {
    const key = issue.path.join('.') || '_';
    if (!details[key]) details[key] = issue.message;
  }
  const first = Object.values(details)[0];
  throw badRequest(first || 'Dados inválidos.', details);
}
