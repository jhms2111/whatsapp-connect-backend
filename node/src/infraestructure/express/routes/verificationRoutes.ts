import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import User from '../../mongo/models/userModel';
import { sendEmail } from '../../../utils/email';

const router = Router();

// Utils
function in24h() {
  return new Date(Date.now() + 24 * 60 * 60 * 1000);
}
function buildFrontendVerifyUrl(emailToken: string, email: string) {
  const base = process.env.FRONTEND_URL || 'http://localhost:3000';
  const e = encodeURIComponent(email);
  return `${base}/verify-email?token=${emailToken}&email=${e}`;
}
function buildBackendVerifyUrl(emailToken: string, email: string) {
  const base = process.env.BACKEND_URL || 'http://localhost:4000';
  const e = encodeURIComponent(email);
  // GET do próprio backend (útil caso você prefira ativar no backend e redirecionar)
  return `${base}/api/verify-email?token=${emailToken}&email=${e}`;
}

/**
 * ✅ Verificação de email via POST
 * Usada pela página do frontend (JS/Fetch) para confirmar.
 */
router.post('/verify-email', async (req: Request, res: Response) => {
  try {
    const { email, token } = req.body as { email?: string; token?: string };
    if (!email || !token) return res.status(400).json({ error: 'Parâmetros inválidos' });

    const user = await User.findOne({ email, emailToken: token });
    if (!user) return res.status(400).json({ error: 'Token inválido' });

    if (user.emailTokenExpiry && user.emailTokenExpiry < new Date()) {
      return res.status(400).json({ error: 'Token expirado' });
    }

    user.emailVerified = true;
    user.emailToken = undefined;
    user.emailTokenExpiry = undefined;
    await user.save();

    res.json({ message: 'Email verificado com sucesso!' });
  } catch (err) {
    console.error('[VERIFY EMAIL POST] erro:', err);
    res.status(500).json({ error: 'Erro ao verificar email' });
  }
});

/**
 * ✅ Verificação de email via GET (para clique direto no link)
 * Ex.: http://localhost:4000/api/verify-email?token=...&email=...
 * Dica: você pode redirecionar para uma página de sucesso no frontend.
 */
router.get('/verify-email', async (req: Request, res: Response) => {
  try {
    const { email, token } = req.query as { email?: string; token?: string };
    if (!email || !token) return res.status(400).send('Link inválido.');

    const user = await User.findOne({ email, emailToken: token });
    if (!user) return res.status(400).send('Token inválido.');

    if (user.emailTokenExpiry && user.emailTokenExpiry < new Date()) {
      return res.status(400).send('Token expirado.');
    }

    user.emailVerified = true;
    user.emailToken = undefined;
    user.emailTokenExpiry = undefined;
    await user.save();

    // Redireciona para sua página do frontend (opcional)
    const successUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/verify-email?status=ok`;
    return res.redirect(successUrl);
  } catch (err) {
    console.error('[VERIFY EMAIL GET] erro:', err);
    res.status(500).send('Erro ao verificar email.');
  }
});

/**
 * ✅ Reenviar link de verificação de e-mail
 * Body: { email }
 */
router.post('/resend-email-verification', async (req: Request, res: Response) => {
  try {
    const { email } = req.body as { email?: string };
    if (!email) return res.status(400).json({ error: 'Email é obrigatório' });

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
    if (user.emailVerified) return res.status(400).json({ error: 'Email já verificado' });

    // Gera novo token e expiração
    user.emailToken = crypto.randomBytes(20).toString('hex');
    user.emailTokenExpiry = in24h();
    await user.save();

    // Você pode escolher qual URL enviar no e-mail:
    // a) Verificar no FRONTEND (a página chama POST /api/verify-email)
    const confirmUrlFE = buildFrontendVerifyUrl(user.emailToken, email);
    // b) Verificar direto no BACKEND via GET:
    const confirmUrlBE = buildBackendVerifyUrl(user.emailToken, email);

    await sendEmail({
      to: email,
      subject: 'Confirme sua conta',
      text: `Clique para ativar sua conta: ${confirmUrlFE}`,
      html: `<p>Olá ${user.username},</p>
             <p>Clique em um dos links abaixo para ativar sua conta (válido por 24h):</p>
             <p><a href="${confirmUrlFE}">Verificar via Frontend</a></p>
             <p><a href="${confirmUrlBE}">Verificar via Backend</a></p>
             <p>Se você não se registrou, ignore este email.</p>`,
    });

    res.json({ message: 'Novo link de verificação enviado.' });
  } catch (err) {
    console.error('[RESEND EMAIL VERIFICATION] erro:', err);
    res.status(500).json({ error: 'Erro ao reenviar verificação' });
  }
});

export default router;
