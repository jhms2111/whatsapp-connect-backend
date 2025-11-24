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
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: 587,
      secure: false, // STARTTLS
      requireTLS: true,
      auth: {
        user: process.env.SMTP_USER!,
        pass: process.env.SMTP_PASS!,
      },
    });

    const fromAddress = process.env.SMTP_FROM || `"Enki" <${process.env.SMTP_USER}>`;

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

