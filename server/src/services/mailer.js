// Envio de e-mails via SMTP (nodemailer). Sem SMTP configurado, os e-mails são
// registrados no log (tabela email_log + console) para não perder nenhuma notificação.
import nodemailer from 'nodemailer';
import { config } from '../config.js';
import { getSetting, run } from '../db/index.js';

const transporter = config.smtp.host
  ? nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    })
  : null;

export const mailEnabled = () => !!transporter;

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Template HTML simples na identidade visual (preto + prata, logo B30). rows = [[rótulo, valor], ...] */
export function renderEmail({ title, intro, rows = [], footer }) {
  const shop = getSetting('shop_name', 'Barbearia');
  const rowsHtml = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:8px 0;color:#9a968f;width:140px">${esc(k)}</td><td style="padding:8px 0;color:#f2efe9;font-weight:600">${esc(v)}</td></tr>`,
    )
    .join('');
  const html = `<!doctype html><html><body style="margin:0;background:#000000;font-family:Arial,Helvetica,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#000000;padding:24px 0"><tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#18181b;border:1px solid #2a2a2e;border-radius:12px">
      <tr><td style="padding:24px 28px;border-bottom:2px solid #d6d9de">
        <div style="color:#c6c7cb;font-size:13px;letter-spacing:3px;text-transform:uppercase">${esc(shop)}</div>
        <div style="color:#ffffff;font-size:21px;margin-top:6px;font-weight:bold;letter-spacing:.5px">${esc(title)}</div>
      </td></tr>
      <tr><td style="padding:24px 28px;color:#d6d2cb;font-size:15px;line-height:1.5">
        ${intro ? `<p style="margin:0 0 16px">${esc(intro)}</p>` : ''}
        <table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px">${rowsHtml}</table>
        ${footer ? `<p style="margin:20px 0 0;color:#9a968f;font-size:13px">${esc(footer)}</p>` : ''}
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
  const text = [title, intro, ...rows.map(([k, v]) => `${k}: ${v}`), footer].filter(Boolean).join('\n');
  return { html, text };
}

export async function sendMail({ to, subject, html, text }) {
  if (!to) return;
  if (!transporter) {
    run('INSERT INTO email_log (to_address, subject, body_text, status) VALUES (?, ?, ?, ?)', [to, subject, text, 'logged']);
    if (!config.isProd) console.log(`[e-mail simulado] para=${to} assunto="${subject}"`);
    return;
  }
  try {
    await transporter.sendMail({ from: config.smtp.from, to, subject, html, text });
    run('INSERT INTO email_log (to_address, subject, body_text, status) VALUES (?, ?, ?, ?)', [to, subject, text, 'sent']);
  } catch (err) {
    console.error('[e-mail] falha ao enviar para', to, err.message);
    run('INSERT INTO email_log (to_address, subject, body_text, status, error) VALUES (?, ?, ?, ?, ?)', [
      to,
      subject,
      text,
      'failed',
      String(err.message).slice(0, 500),
    ]);
  }
}

/** Dispara o envio sem bloquear a resposta HTTP. */
export function queueMail(msg) {
  setImmediate(() => sendMail(msg).catch((e) => console.error('[e-mail]', e)));
}
