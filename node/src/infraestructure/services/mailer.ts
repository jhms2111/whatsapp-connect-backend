// src/infraestructure/services/mailer.ts
import nodemailer from 'nodemailer';

const {
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASS,
  MAIL_FROM,
} = process.env;

let transporter: nodemailer.Transporter | null = null;

export function getMailer() {
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT),
      secure: Number(SMTP_PORT) === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
  }
  return transporter;
}

export async function sendMailSafe(to: string, subject: string, html: string) {
  const mailer = getMailer();
  if (!mailer) {
    console.warn('[MAILER] SMTP não configurado. E-mail não enviado.');
    return false;
  }
  await mailer.sendMail({
    from: MAIL_FROM || `"Suporte" <no-reply@localhost>`,
    to,
    subject,
    html,
  });
  return true;
}
