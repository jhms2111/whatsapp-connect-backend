// backend/src/modules/auth/routes/emailVerificationRoutes.ts

import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import User from '../../mongo/models/userModel';
import { sendEmail } from '../../../utils/email';

const router = Router();

function in24h() {
  return new Date(Date.now() + 24 * 60 * 60 * 1000);
}

function codeExpiresIn15Min() {
  return new Date(Date.now() + 15 * 60 * 1000);
}

function generateEmailCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function buildFrontendVerifyUrl(emailToken: string, email: string) {
  const base = process.env.FRONTEND_URL || 'http://localhost:3000';
  const e = encodeURIComponent(email);
  return `${base}/verify-email?token=${emailToken}&email=${e}`;
}

function buildBackendVerifyUrl(emailToken: string, email: string) {
  const base = process.env.BACKEND_URL || 'http://localhost:4000';
  const e = encodeURIComponent(email);
  return `${base}/api/verify-email?token=${emailToken}&email=${e}`;
}

async function sendVerificationCodeEmail(user: any, email: string, code: string) {
  await sendEmail({
    to: email,
    subject: 'Seu código de verificação Enki',
    text: `Seu código de verificação é: ${code}. Ele expira em 15 minutos.`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.5;">
        <h2>Confirme sua conta Enki</h2>
        <p>Olá ${user.username},</p>
        <p>Use este código para continuar criando seu assistente:</p>
        <div style="font-size: 30px; font-weight: bold; letter-spacing: 8px; margin: 24px 0;">
          ${code}
        </div>
        <p>Este código expira em 15 minutos.</p>
        <p>Se você não criou uma conta na Enki, ignore este email.</p>
      </div>
    `,
  });
}

/**
 * Mantido: verificação antiga por POST token/link
 */
router.post('/verify-email', async (req: Request, res: Response) => {
  try {
    const { email, token } = req.body as { email?: string; token?: string };

    if (!email || !token) {
      return res.status(400).json({ error: 'Parâmetros inválidos' });
    }

    const user = await User.findOne({ email, emailToken: token });

    if (!user) {
      return res.status(400).json({ error: 'Token inválido' });
    }

    if (user.emailTokenExpiry && user.emailTokenExpiry < new Date()) {
      return res.status(400).json({ error: 'Token expirado' });
    }

    user.emailVerified = true;
    user.emailToken = undefined;
    user.emailTokenExpiry = undefined;

    user.emailVerificationCode = undefined;
    user.emailVerificationCodeExpiry = undefined;
    user.emailVerificationAttempts = 0;

    await user.save();

    return res.json({ message: 'Email verificado com sucesso!' });
  } catch (err) {
    console.error('[VERIFY EMAIL POST] erro:', err);
    return res.status(500).json({ error: 'Erro ao verificar email' });
  }
});

/**
 * Mantido: verificação antiga por GET link
 */
router.get('/verify-email', async (req: Request, res: Response) => {
  try {
    const { email, token } = req.query as { email?: string; token?: string };

    if (!email || !token) {
      return res.status(400).send('Link inválido.');
    }

    const user = await User.findOne({ email, emailToken: token });

    if (!user) {
      return res.status(400).send('Token inválido.');
    }

    if (user.emailTokenExpiry && user.emailTokenExpiry < new Date()) {
      return res.status(400).send('Token expirado.');
    }

    user.emailVerified = true;
    user.emailToken = undefined;
    user.emailTokenExpiry = undefined;

    user.emailVerificationCode = undefined;
    user.emailVerificationCodeExpiry = undefined;
    user.emailVerificationAttempts = 0;

    await user.save();

    const successUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/verify-email?status=ok`;
    return res.redirect(successUrl);
  } catch (err) {
    console.error('[VERIFY EMAIL GET] erro:', err);
    return res.status(500).send('Erro ao verificar email.');
  }
});

/**
 * Novo: verificar email por código de 6 dígitos
 */
router.post('/verify-email-code', async (req: Request, res: Response) => {
  try {
    const { email, code } = req.body as { email?: string; code?: string };

    if (!email || !code) {
      return res.status(400).json({ error: 'Email e código são obrigatórios' });
    }

    const cleanCode = String(code).trim();

    if (!/^\d{6}$/.test(cleanCode)) {
      return res.status(400).json({ error: 'Código inválido' });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    if (user.emailVerified) {
      return res.json({ message: 'Email já verificado' });
    }

    if (!user.emailVerificationCode || !user.emailVerificationCodeExpiry) {
      return res.status(400).json({ error: 'Código não encontrado. Solicite um novo código.' });
    }

    if (user.emailVerificationCodeExpiry < new Date()) {
      return res.status(400).json({ error: 'Código expirado. Solicite um novo código.' });
    }

    if ((user.emailVerificationAttempts || 0) >= 5) {
      return res.status(429).json({ error: 'Muitas tentativas. Solicite um novo código.' });
    }

    if (user.emailVerificationCode !== cleanCode) {
      user.emailVerificationAttempts = (user.emailVerificationAttempts || 0) + 1;
      await user.save();

      return res.status(400).json({ error: 'Código inválido' });
    }

    user.emailVerified = true;

    user.emailVerificationCode = undefined;
    user.emailVerificationCodeExpiry = undefined;
    user.emailVerificationAttempts = 0;

    user.emailToken = undefined;
    user.emailTokenExpiry = undefined;

    await user.save();

    return res.json({ message: 'Email verificado com sucesso!' });
  } catch (err) {
    console.error('[VERIFY EMAIL CODE] erro:', err);
    return res.status(500).json({ error: 'Erro ao verificar código' });
  }
});

/**
 * Novo: reenviar código de verificação
 */
router.post('/resend-email-code', async (req: Request, res: Response) => {
  try {
    const { email } = req.body as { email?: string };

    if (!email) {
      return res.status(400).json({ error: 'Email é obrigatório' });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    if (user.emailVerified) {
      return res.status(400).json({ error: 'Email já verificado' });
    }

    const code = generateEmailCode();

    user.emailVerificationCode = code;
    user.emailVerificationCodeExpiry = codeExpiresIn15Min();
    user.emailVerificationAttempts = 0;

    await user.save();

    await sendVerificationCodeEmail(user, email, code);

    return res.json({ message: 'Código enviado com sucesso.' });
  } catch (err) {
    console.error('[RESEND EMAIL CODE] erro:', err);
    return res.status(500).json({ error: 'Erro ao reenviar código' });
  }
});

/**
 * Mantido: reenviar link antigo de verificação
 */
router.post('/resend-email-verification', async (req: Request, res: Response) => {
  try {
    const { email } = req.body as { email?: string };

    if (!email) {
      return res.status(400).json({ error: 'Email é obrigatório' });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    if (user.emailVerified) {
      return res.status(400).json({ error: 'Email já verificado' });
    }

    user.emailToken = crypto.randomBytes(20).toString('hex');
    user.emailTokenExpiry = in24h();

    await user.save();

    const confirmUrlFE = buildFrontendVerifyUrl(user.emailToken, email);
    const confirmUrlBE = buildBackendVerifyUrl(user.emailToken, email);

    await sendEmail({
      to: email,
      subject: 'Confirme sua conta',
      text: `Clique para ativar sua conta: ${confirmUrlFE}`,
      html: `
        <p>Olá ${user.username},</p>
        <p>Clique em um dos links abaixo para ativar sua conta válido por 24h:</p>
        <p><a href="${confirmUrlFE}">Verificar via Frontend</a></p>
        <p><a href="${confirmUrlBE}">Verificar via Backend</a></p>
        <p>Se você não se registrou, ignore este email.</p>
      `,
    });

    return res.json({ message: 'Novo link de verificação enviado.' });
  } catch (err) {
    console.error('[RESEND EMAIL VERIFICATION] erro:', err);
    return res.status(500).json({ error: 'Erro ao reenviar verificação' });
  }
});

export default router;