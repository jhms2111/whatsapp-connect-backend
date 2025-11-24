// src/utils/email.ts
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();

interface SendEmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export async function sendEmail({ to, subject, text, html }: SendEmailOptions) {
  try {
    const host = process.env.SMTP_HOST || 'smtp.sendgrid.net';

    // usamos a PORTA do .env, senão 587
    const port = Number(process.env.SMTP_PORT || '587');

    // regra comum: 465 = secure true, outras = false
    const secure = port === 465;

    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!user || !pass) {
      console.error('❌ SMTP_USER ou SMTP_PASS não definidos');
      throw new Error('Configuração SMTP ausente');
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,          // true se 465, false caso contrário
      auth: {
        user,
        pass,
      },
    });

    const fromAddress = process.env.SMTP_FROM || `"Enki" <${user}>`;

    const info = await transporter.sendMail({
      from: fromAddress,
      to,
      subject,
      text,
      html,
    });

    console.log(`✅ Email enviado para ${to}: ${info.messageId}`);
  } catch (err) {
    console.error('❌ Erro ao enviar email:', err);
    throw err;
  }
}
